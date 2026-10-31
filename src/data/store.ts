/**
 * 读写层：体重与流水存进插件记录（按日期索引、按窗口分页读取），身体数据与常吃食物存进私有存储。
 * 同一天同一时段只保留一条体重：重复称重覆盖旧值。
 */
import type { JsonValue, PluginContext, PluginRecord } from "@tau/plugins";
import {
  foodKey,
  parseEntry,
  parseProfile,
  parseWeigh,
  profileToJson,
  type Entry,
  type EntryInput,
  type Profile,
  type Weigh,
  type WeighSlot,
} from "./model";

export const WEIGH = "weigh";
export const ENTRY = "entry";
const PROFILE_KEY = "profile";
const FOODS_KEY = "foods";
const PREFS_KEY = "prefs";
const FOODS_LIMIT = 300;
const PAGE = 200;

/** 测试用内存实现与宿主共用的最小接口 */
export type WeightStore = Pick<PluginContext, "records" | "storage">;

export function registerCollections(context: Pick<PluginContext, "records">) {
  context.records.registerCollection({ name: WEIGH, indexes: { date: "string", slot: "string" } });
  context.records.registerCollection({
    name: ENTRY,
    indexes: { date: "string", estimate: "string" },
  });
}

async function queryAll(store: WeightStore, collection: string, from: string, to: string) {
  const items: PluginRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.records.query(collection, {
      where: { date: { gte: from, lte: to } },
      orderBy: { field: "date" },
      limit: PAGE,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}

export type FoodMemory = Record<string, number>;

/** 本插件的界面偏好，随笔记库同步 */
export interface WeightPrefs {
  /** 手机首次打开的引导已走完（含跳过） */
  onboarded: boolean;
  /** 在今天页显示减重卡片 */
  homeCard: boolean;
}
const DEFAULT_PREFS: WeightPrefs = { onboarded: false, homeCard: true };

export function createWeightData(store: WeightStore) {
  return {
    async listWeighs(from: string, to: string): Promise<Weigh[]> {
      return (await queryAll(store, WEIGH, from, to))
        .map(parseWeigh)
        .filter((w): w is Weigh => w !== null);
    },

    async listEntries(from: string, to: string): Promise<Entry[]> {
      return (await queryAll(store, ENTRY, from, to))
        .map(parseEntry)
        .filter((e): e is Entry => e !== null)
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    },

    /** 最早一次晨重（「已减」的起点） */
    async firstWeigh(): Promise<number | null> {
      const page = await store.records.query(WEIGH, {
        where: { slot: "am" },
        orderBy: { field: "date" },
        limit: 1,
      });
      const first = page.items[0] ? parseWeigh(page.items[0]) : null;
      return first?.kg ?? null;
    },

    async saveWeigh(date: string, slot: WeighSlot, kg: number): Promise<void> {
      if (!Number.isFinite(kg) || kg < 20 || kg > 400) throw new Error("体重超出合理范围");
      const value = Math.round(kg * 10) / 10;
      const page = await store.records.query(WEIGH, { where: { date, slot }, limit: 10 });
      const [current, ...duplicates] = page.items;
      if (current)
        await store.records.update(
          WEIGH,
          current.id,
          { date, slot, kg: value },
          { expectedRevision: current.revision }
        );
      else await store.records.insert(WEIGH, { date, slot, kg: value });
      // 两台设备离线各记一条时会出现重复，保留第一条
      for (const extra of duplicates)
        await store.records.delete(WEIGH, extra.id, { expectedRevision: extra.revision });
    },

    async deleteWeigh(weigh: Weigh): Promise<void> {
      await store.records.delete(WEIGH, weigh.id, { expectedRevision: weigh.revision });
    },

    async addEntry(input: EntryInput): Promise<Entry> {
      const record = await store.records.insert(ENTRY, { ...input, estimate: input.estimate ?? "ready" });
      const entry = parseEntry(record);
      if (!entry) throw new Error("记录格式无效");
      return entry;
    },

    async updateEntry(entry: Entry, patch: Partial<EntryInput>): Promise<Entry> {
      const { id, revision, ...rest } = entry;
      const record = await store.records.update(
        ENTRY,
        id,
        { ...rest, ...patch },
        { expectedRevision: revision }
      );
      const next = parseEntry(record);
      if (!next) throw new Error("记录格式无效");
      return next;
    },

    async getEntry(id: string): Promise<Entry | null> {
      const record = await store.records.get(ENTRY, id);
      return record ? parseEntry(record) : null;
    },

    /** 还在等后台估算的条目（上次没算完、被系统结束的也在内） */
    async listPending(): Promise<Entry[]> {
      const page = await store.records.query(ENTRY, {
        where: { estimate: "pending" },
        orderBy: { field: "date" },
        limit: PAGE,
      });
      return page.items.map(parseEntry).filter((e): e is Entry => e !== null);
    },

    async deleteEntry(entry: Entry): Promise<void> {
      await store.records.delete(ENTRY, entry.id, { expectedRevision: entry.revision });
    },

    async getProfile(): Promise<Profile | null> {
      return parseProfile(await store.storage.get(PROFILE_KEY));
    },

    async saveProfile(profile: Profile): Promise<void> {
      await store.storage.set(PROFILE_KEY, profileToJson(profile));
    },

    async getPrefs(): Promise<WeightPrefs> {
      const raw = await store.storage.get(PREFS_KEY);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PREFS };
      return {
        onboarded: raw.onboarded === true,
        homeCard: raw.homeCard !== false,
      };
    },

    async savePrefs(patch: Partial<WeightPrefs>): Promise<WeightPrefs> {
      const next = { ...(await this.getPrefs()), ...patch };
      await store.storage.set(PREFS_KEY, { ...next });
      return next;
    },

    async getFoods(): Promise<FoodMemory> {
      const raw = await store.storage.get(FOODS_KEY);
      const foods: FoodMemory = {};
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        for (const [key, value] of Object.entries(raw))
          if (typeof value === "number" && Number.isFinite(value) && value >= 0) foods[key] = value;
      return foods;
    },

    /** 记住这条饮食的热量；超过上限时丢掉最早记住的 */
    async rememberFood(text: string, kcal: number): Promise<void> {
      const key = foodKey(text);
      if (!key) return;
      const foods = await this.getFoods();
      delete foods[key];
      foods[key] = Math.round(kcal);
      const keys = Object.keys(foods);
      for (const old of keys.slice(0, Math.max(0, keys.length - FOODS_LIMIT))) delete foods[old];
      await store.storage.set(FOODS_KEY, foods as JsonValue);
    },
  };
}

export type WeightData = ReturnType<typeof createWeightData>;
