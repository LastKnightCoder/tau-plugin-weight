import { vi } from "vitest";
import zhCN from "../locales/zh-CN.json";

/** SDK 的运行时由 Tau 提供，测试里只给出用到的值；useI18n 用简体词典直译，defineI18n 用最小实现兜住词典求值 */
vi.mock("@tau/plugins", () => {
  class PluginConflictError extends Error {
    override readonly name = "PluginConflictError";
    constructor(message = "数据已被修改，请重新读取后再试") {
      super(message);
    }
  }
  const table = zhCN as Record<string, string>;
  return {
    PluginConflictError,
    SIDEBAR_GROUPS: { daily: "daily", knowledge: "knowledge", learning: "learning" },
    definePlugin: (definition: unknown) => definition,
    defineI18n: (config: { fallbackLocale: string; resources: Record<string, Record<string, string>> }) => ({
      ...config,
      ref: (key: string) => ({ kind: "i18n", key }),
    }),
    useI18n: () => ({
      locale: "zh-CN",
      t: (key: string, values?: Record<string, string | number | boolean>) =>
        (table[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
          const value = values?.[name];
          if (value == null || (typeof value === "number" && !Number.isFinite(value)))
            throw new Error(`无效的翻译参数：${key}.${name}`);
          return String(value);
        }),
      resolve: (value: unknown) => String(value),
    }),
  };
});
