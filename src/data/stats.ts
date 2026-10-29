/**
 * 统计口径（纯函数，页面、首页卡片与 AI 共用同一份结果）：
 * - 趋势只用晨重：7 日滑动均值（窗口内有几天算几天），次日变化 = 次日晨重 − 当日晨重；
 * - 每日预算 = 按身体数据算出的日常消耗 − 500，体重下降后随之下调；设置了手动预算时用手动值；
 * - 余额 = 预算 + 运动消耗 − 摄入；「少吃」= 记了饮食且余额 ≥ 0，「多动」= 运动分钟达标；
 *   没记饮食、还没有预算（未填身体数据或从没称过）的日子既不算少吃也不算没少吃（unknown）；
 *   今天在一天结束前不判定做到，已经超了则直接算没做到。
 */
import { addDays, daysBetween, type Entry, type Profile, type Weigh } from "./model";

export const DEFICIT = 500;

/** Mifflin-St Jeor 基础代谢 × 活动系数 */
export function dailyBurn(profile: Profile, kg: number, year: number): number {
  const age = year - profile.birthYear;
  const bmr =
    10 * kg + 6.25 * profile.heightCm - 5 * age + (profile.sex === "male" ? 5 : -161);
  return bmr * profile.activity;
}

/** 预算取整到 10 kcal，且不低于安全下限（男 1500 / 女 1200） */
export function dailyBudget(profile: Profile, kg: number, year: number): number {
  if (profile.budgetOverride != null) return profile.budgetOverride;
  const floor = profile.sex === "male" ? 1500 : 1200;
  return Math.max(floor, Math.round((dailyBurn(profile, kg, year) - DEFICIT) / 10) * 10);
}

export type Verdict = "ok" | "miss" | "unknown";

export interface DaySummary {
  date: string;
  am: number | null;
  pm: number | null;
  /** 7 日晨重均值；窗口内没有晨重时为 null */
  avg: number | null;
  /** 次日晨重 − 当日晨重；任一缺失为 null */
  next: number | null;
  intake: number;
  burn: number;
  moveMinutes: number;
  foodCount: number;
  budget: number;
  remaining: number;
  eat: Verdict;
  move: Verdict;
}

export interface Ledger {
  days: DaySummary[];
  byDate: Map<string, DaySummary>;
}

/** 汇总 [from, to] 的每一天；weighs/entries 应覆盖 from 前 6 天，均值窗口才完整 */
export function buildLedger(
  from: string,
  to: string,
  weighs: readonly Weigh[],
  entries: readonly Entry[],
  profile: Profile | null,
  today: string
): Ledger {
  const am = new Map<string, number>();
  const pm = new Map<string, number>();
  for (const w of weighs) (w.slot === "am" ? am : pm).set(w.date, w.kg);
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }
  const avgOf = (date: string) => {
    const values: number[] = [];
    for (let k = 0; k < 7; k++) {
      const v = am.get(addDays(date, -k));
      if (v != null) values.push(v);
    }
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  };
  // 预算按当天的体重均值算；还没有体重时沿用最近一次已知值
  let lastKg = [...am.entries()].sort(([a], [b]) => a.localeCompare(b))[0]?.[1] ?? null;
  const days: DaySummary[] = [];
  const total = daysBetween(from, to);
  for (let k = 0; k <= total; k++) {
    const date = addDays(from, k);
    const list = byDay.get(date) ?? [];
    const intake = list.filter(e => e.kind === "food").reduce((s, e) => s + e.kcal, 0);
    const foodCount = list.filter(e => e.kind === "food").length;
    const moves = list.filter(e => e.kind === "move");
    const burn = moves.reduce((s, e) => s + e.kcal, 0);
    const moveMinutes = moves.reduce((s, e) => s + e.minutes, 0);
    const avg = avgOf(date);
    if (avg != null) lastKg = avg;
    const budget =
      profile && lastKg != null ? dailyBudget(profile, lastKg, Number(date.slice(0, 4))) : 0;
    const remaining = budget + burn - intake;
    const live = date === today;
    const moveGoal = profile?.moveGoal ?? 30;
    const amToday = am.get(date) ?? null;
    const amNext = am.get(addDays(date, 1)) ?? null;
    days.push({
      date,
      am: amToday,
      pm: pm.get(date) ?? null,
      avg,
      next: amToday != null && amNext != null ? round2(amNext - amToday) : null,
      intake,
      burn,
      moveMinutes,
      foodCount,
      budget,
      remaining,
      eat: budget === 0 || foodCount === 0 ? "unknown" : remaining >= 0 ? (live ? "unknown" : "ok") : "miss",
      move: moveMinutes >= moveGoal ? "ok" : live ? "unknown" : "miss",
    });
  }
  return { days, byDate: new Map(days.map(d => [d.date, d])) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 7 日均值的线性回归斜率 × 7（kg/周）；有效点少于 5 个时为 null */
export function weeklyRate(days: readonly DaySummary[]): number | null {
  const points = days
    .map((d, i) => ({ x: i, y: d.avg }))
    .filter((p): p is { x: number; y: number } => p.y != null);
  if (points.length < 5) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : (num / den) * 7;
}

export type GroupId = "both" | "eat" | "move" | "none";
export interface GroupStat {
  id: GroupId;
  name: string;
  days: number;
  /** 次日晨重平均变化；没有样本时为 null */
  mean: number | null;
}

/** 按少吃 / 多动是否做到分四组，比较次日晨重变化；饮食没记的日子不参与 */
export function compareGroups(days: readonly DaySummary[]): GroupStat[] {
  const defs: [GroupId, string, (d: DaySummary) => boolean][] = [
    ["both", "都做到", d => d.eat === "ok" && d.move === "ok"],
    ["eat", "只少吃", d => d.eat === "ok" && d.move === "miss"],
    ["move", "只多动", d => d.eat === "miss" && d.move === "ok"],
    ["none", "都没做", d => d.eat === "miss" && d.move === "miss"],
  ];
  return defs.map(([id, name, test]) => {
    const values = days.filter(d => d.next != null && test(d)).map(d => d.next as number);
    return {
      id,
      name,
      days: values.length,
      mean: values.length ? round2(values.reduce((s, v) => s + v, 0) / values.length) : null,
    };
  });
}

/** 截至昨天连续做到的天数；今天已做到时一并计入 */
export function streak(days: readonly DaySummary[], key: "eat" | "move", today: string): number {
  let count = 0;
  for (let k = days.length - 1; k >= 0; k--) {
    const d = days[k];
    if (d.date > today) continue;
    if (d[key] === "ok") count++;
    else if (d.date === today) continue;
    else break;
  }
  return count;
}

export interface Overview {
  today: DaySummary;
  yesterday: DaySummary | null;
  latestAvg: number | null;
  startKg: number | null;
  /** 近 14 天的周速率 */
  rate: number | null;
  toGoal: number | null;
  weeksToGoal: number | null;
  bmi: number | null;
  eatStreak: number;
  /** 本周（周一起）运动达标天数 */
  weekMoveDays: number;
}

export function overview(
  ledger: Ledger,
  profile: Profile | null,
  today: string,
  firstWeigh: number | null
): Overview {
  const { days, byDate } = ledger;
  const t = byDate.get(today) ?? days[days.length - 1];
  const latestAvg = [...days].reverse().find(d => d.avg != null)?.avg ?? null;
  const rate = weeklyRate(days.filter(d => daysBetween(d.date, today) < 14 && d.date <= today));
  const goal = profile?.goalKg ?? null;
  const toGoal = goal != null && latestAvg != null ? latestAvg - goal : null;
  const weekday = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  return {
    today: t,
    yesterday: byDate.get(addDays(today, -1)) ?? null,
    latestAvg,
    startKg: firstWeigh,
    rate,
    toGoal,
    weeksToGoal: toGoal != null && toGoal > 0 && rate != null && rate < -0.05 ? toGoal / -rate : null,
    bmi: profile && latestAvg != null ? latestAvg / (profile.heightCm / 100) ** 2 : null,
    eatStreak: streak(days, "eat", today),
    weekMoveDays: days.filter(d => d.date >= monday && d.date <= today && d.move === "ok").length,
  };
}
