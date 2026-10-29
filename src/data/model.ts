/**
 * 减重记账本的数据形状与校验。日期一律用本地日期键 YYYY-MM-DD，时间用 HH:MM。
 * 记录与存储里读到的数据可能来自旧版本或其他设备，读取后先经 parse* 校验，不合格的丢弃。
 */
import type { JsonValue, PluginRecord } from "@tau/plugins";

export type WeighSlot = "am" | "pm";
export type EntryKind = "food" | "move";
export type Sex = "male" | "female";

export interface Weigh {
  id: string;
  revision: string;
  date: string;
  slot: WeighSlot;
  kg: number;
}

export interface Entry {
  id: string;
  revision: string;
  date: string;
  time: string;
  kind: EntryKind;
  text: string;
  /** 饮食为摄入热量，运动为消耗热量，均为正数 */
  kcal: number;
  /** 运动时长；饮食为 0 */
  minutes: number;
}

export type EntryInput = Omit<Entry, "id" | "revision">;

export interface Profile {
  heightCm: number;
  birthYear: number;
  sex: Sex;
  /** 日常活动系数（不含记录的运动），1.2 久坐 ~ 1.55 经常走动 */
  activity: number;
  goalKg: number | null;
  /** 每天运动达到多少分钟算「多动」 */
  moveGoal: number;
  /** 手动指定的每日预算；null 时按身体数据自动计算 */
  budgetOverride: number | null;
}

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: "久坐", description: "办公室工作，日常很少走动" },
  { value: 1.375, label: "轻度活动", description: "通勤步行，偶尔站立工作" },
  { value: 1.55, label: "经常走动", description: "工作中大量站立或走动" },
] as const;

export const DEFAULT_MOVE_GOAL = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const isObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function parseWeigh(record: PluginRecord): Weigh | null {
  const { date, slot, kg } = record.data;
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;
  if (slot !== "am" && slot !== "pm") return null;
  if (!finite(kg) || kg <= 0) return null;
  return { id: record.id, revision: record.revision, date, slot, kg };
}

export function parseEntry(record: PluginRecord): Entry | null {
  const { date, time, kind, text, kcal, minutes } = record.data;
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;
  if (kind !== "food" && kind !== "move") return null;
  if (typeof text !== "string" || !finite(kcal) || kcal < 0) return null;
  return {
    id: record.id,
    revision: record.revision,
    date,
    time: typeof time === "string" && TIME_RE.test(time) ? time : "00:00",
    kind,
    text,
    kcal: Math.round(kcal),
    minutes: kind === "move" && finite(minutes) && minutes > 0 ? Math.round(minutes) : 0,
  };
}

export function parseProfile(value: JsonValue | undefined): Profile | null {
  if (!isObject(value)) return null;
  const { heightCm, birthYear, sex, activity, goalKg, moveGoal, budgetOverride } = value;
  if (!finite(heightCm) || heightCm < 100 || heightCm > 250) return null;
  if (!finite(birthYear) || birthYear < 1900 || birthYear > 2100) return null;
  if (sex !== "male" && sex !== "female") return null;
  return {
    heightCm,
    birthYear,
    sex,
    activity: finite(activity) && activity >= 1.1 && activity <= 2 ? activity : 1.2,
    goalKg: finite(goalKg) && goalKg > 0 ? goalKg : null,
    moveGoal: finite(moveGoal) && moveGoal > 0 ? Math.round(moveGoal) : DEFAULT_MOVE_GOAL,
    budgetOverride: finite(budgetOverride) && budgetOverride >= 800 ? Math.round(budgetOverride) : null,
  };
}

export const profileToJson = (profile: Profile): JsonValue => ({ ...profile });

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const timeKey = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
/** 两个日期键相差的天数（b − a） */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86_400_000);
}

/** 常吃食物的记忆键：去空白、全角转半角、小写 */
export function foodKey(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase()
    .slice(0, 64);
}
