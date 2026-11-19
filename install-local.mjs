import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(manifest.id)) throw new Error("插件 ID 无效");
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)) throw new Error("插件版本无效");

const appRoot = path.join(homedir(), ".editor");
const root = path.join(appRoot, "plugins");
const target = path.join(root, manifest.id);
const sourceFile = path.join(appRoot, "plugin-updates", "sources", `${manifest.id}.json`);
const backupRoot = path.join(appRoot, "plugin-local-backups", manifest.id);
const backupPackage = path.join(backupRoot, "package");
const backupSource = path.join(backupRoot, "source.json");
const backupMetadata = path.join(backupRoot, "metadata.json");

const exists = async file => {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};

async function replaceTarget(populate) {
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(path.join(root, ".installing-"));
  const next = path.join(staging, manifest.id);
  const previous = `${target}.previous-${path.basename(staging)}`;
  let hasPrevious = false;
  let installed = false;
  try {
    await populate(staging);
    if (await exists(target)) {
      const current = await lstat(target);
      if (!current.isDirectory() || current.isSymbolicLink()) throw new Error("当前插件目录不是普通目录");
      await rename(target, previous);
      hasPrevious = true;
    }
    try {
      await rename(next, target);
      installed = true;
    } catch (error) {
      if (hasPrevious && !(await exists(target))) {
        try {
          await rename(previous, target);
          hasPrevious = false;
        } catch (recoveryError) {
          throw new Error(`安装失败，旧包保留在 ${previous}`, { cause: recoveryError });
        }
      }
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (installed && hasPrevious) await rm(previous, { recursive: true, force: true });
  }
}

async function readBackup() {
  const value = JSON.parse(await readFile(backupMetadata, "utf8"));
  if (typeof value.hadPackage !== "boolean" || typeof value.hadSource !== "boolean")
    throw new Error("本地安装备份无效，请保留目录后检查");
  return value;
}

async function createBackup() {
  if (await exists(backupRoot)) {
    await readBackup();
    return false;
  }
  const hadPackage = await exists(target);
  const hadSource = await exists(sourceFile);
  let version = null;
  await mkdir(backupRoot, { recursive: true });
  try {
    if (hadPackage) {
      const current = await lstat(target);
      if (!current.isDirectory() || current.isSymbolicLink()) throw new Error("当前插件目录不是普通目录");
      await cp(target, backupPackage, { recursive: true });
      version = JSON.parse(await readFile(path.join(target, "manifest.json"), "utf8")).version ?? null;
    }
    if (hadSource) await cp(sourceFile, backupSource);
    await writeFile(backupMetadata, JSON.stringify({ hadPackage, hadSource, version }));
    return true;
  } catch (error) {
    await rm(backupRoot, { recursive: true, force: true });
    throw error;
  }
}

async function restoreOriginal() {
  const backup = await readBackup();
  if (backup.hadPackage) {
    await replaceTarget(async staging => {
      await cp(backupPackage, path.join(staging, manifest.id), { recursive: true });
    });
  } else {
    await rm(target, { recursive: true, force: true });
  }
  if (backup.hadSource) {
    await mkdir(path.dirname(sourceFile), { recursive: true });
    const staging = `${sourceFile}.tmp`;
    await writeFile(staging, await readFile(backupSource));
    await rename(staging, sourceFile);
  } else {
    await rm(sourceFile, { force: true });
  }
  await rm(backupRoot, { recursive: true, force: true });
  return backup;
}

if (process.argv.includes("--restore")) {
  const backup = await restoreOriginal();
  console.log(
    backup.hadPackage
      ? `已恢复原始插件${backup.version ? ` ${backup.version}` : ""}：${target}\n在客户端插件页点「重新扫描」即可。`
      : `已移除本地安装插件：${target}`
  );
} else {
  const zip = new AdmZip(path.resolve("dist", `${manifest.id}-${manifest.version}.zip`));
  const entries = zip.getEntries().filter(entry => !entry.isDirectory);
  const packaged = JSON.parse(zip.readAsText(`${manifest.id}/manifest.json`));
  // 没有 main 的是独立 Skill 包，只含 skills/ 目录
  const skillPackage = packaged.main === undefined;
  if (
    (!skillPackage && packaged.main !== "main.js") ||
    (packaged.styles !== undefined && packaged.styles !== "main.css")
  )
    throw new Error("ZIP入口与模板约定不一致");
  if (packaged.formatVersion === 3) {
    const { validatePortablePluginManifest } = await import("@tau/plugins/portable");
    validatePortablePluginManifest(packaged);
  } else if (packaged.backend !== undefined) {
    const { validatePluginManifest } = await import("@tau/plugins/package");
    validatePluginManifest(packaged, { strict: true });
    if (packaged.backend.entry !== "backend.js") throw new Error("后台模板入口必须是 backend.js");
  } else if (packaged.formatVersion !== 1) throw new Error("插件包格式无效");
  const integrity = packaged.integrity ?? {};
  const allowed = [
    "manifest.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    ...Object.keys(integrity).filter(file => !skillPackage || file.startsWith("skills/")),
  ];
  for (const entry of entries) {
    if (!allowed.some(file => entry.entryName === `${manifest.id}/${file}`))
      throw new Error("ZIP 包含非约定文件");
  }
  if (packaged.id !== manifest.id || packaged.version !== manifest.version)
    throw new Error("ZIP 与当前 manifest 不一致，请重新构建");
  if (!skillPackage && !integrity["main.js"]) throw new Error("产物校验失败：main.js");
  for (const [file, digest] of Object.entries(integrity)) {
    const bytes = zip.readFile(`${manifest.id}/${file}`);
    if (!bytes || createHash("sha256").update(bytes).digest("hex") !== digest)
      throw new Error(`产物校验失败：${file}`);
  }

  const createdBackup = await createBackup();
  try {
    await replaceTarget(async staging => zip.extractAllTo(staging, false));
  } catch (error) {
    if (createdBackup) await rm(backupRoot, { recursive: true, force: true });
    throw error;
  }
  await rm(sourceFile, { force: true });
  console.log(
    `已安装本地开发版 ${manifest.version}：${target}\n` +
      `原始插件备份：${backupRoot}\n` +
      `重复安装直接重新运行本命令，无需修改版本号。\n` +
      (packaged.formatVersion === 3 ? "跨端本地包请使用开发客户端，正式客户端只接受插件中心版本。\n" : "") +
      `调试结束后运行 node install-local.mjs --restore 恢复原始插件。`
  );
}
