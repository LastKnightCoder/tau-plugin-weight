import { describe, expect, it } from "vitest";
import { addDays, type Entry, type Profile, type Weigh } from "../data/model";
import {
  buildLedger,
  compareGroups,
  dailyBudget,
  overview,
  streak,
  weeklyRate,
} from "../data/stats";

const profile: Profile = {
  heightCm: 176,
  birthYear: 1994,
  sex: "male",
  activity: 1.2,
  goalKg: 72,
  moveGoal: 30,
  budgetOverride: null,
};

let seq = 0;
const weigh = (date: string, kg: number, slot: "am" | "pm" = "am"): Weigh => ({
  id: String(++seq),
  revision: "1",
  date,
  slot,
  kg,
});
const food = (date: string, kcal: number): Entry => ({
  id: String(++seq),
  revision: "1",
  date,
  time: "12:00",
  kind: "food",
  text: "饭",
  kcal,
  minutes: 0,
});
const move = (date: string, minutes: number, kcal = 150): Entry => ({
  ...food(date, kcal),
  kind: "move",
  minutes,
});

describe("每日预算", () => {
  it("按 Mifflin-St Jeor × 活动系数 − 500 计算，取整到 10", () => {
    // 10×80 + 6.25×176 − 5×32 + 5 = 1745，×1.2 = 2094，−500 = 1594 → 1590
    expect(dailyBudget(profile, 80, 2026)).toBe(1590);
  });
  it("体重下降后预算随之下调", () => {
    expect(dailyBudget(profile, 75, 2026)).toBeLessThan(dailyBudget(profile, 80, 2026));
  });
  it("不低于安全下限，手动预算优先", () => {
    expect(dailyBudget({ ...profile, sex: "female", heightCm: 150 }, 45, 2026)).toBe(1200);
    expect(dailyBudget({ ...profile, budgetOverride: 1800 }, 80, 2026)).toBe(1800);
  });
});

describe("每日汇总", () => {
  it("7 日均值只用晨重，次日变化取次日晨重差", () => {
    const ledger = buildLedger(
      "2026-10-01",
      "2026-10-03",
      [
        weigh("2026-10-01", 80),
        weigh("2026-10-01", 81.2, "pm"),
        weigh("2026-10-02", 79.6),
        weigh("2026-10-03", 79.5),
      ],
      [],
      profile,
      "2026-10-03"
    );
    const [d1, d2, d3] = ledger.days;
    expect(d1.avg).toBe(80);
    expect(d2.avg).toBeCloseTo(79.8);
    expect(d1.next).toBe(-0.4);
    expect(d3.next).toBeNull();
    expect(d1.pm).toBe(81.2);
  });

  it("均值窗口跨过缺测日，窗口内没有晨重时为 null", () => {
    const ledger = buildLedger(
      "2026-10-01",
      "2026-10-10",
      [weigh("2026-10-01", 80)],
      [],
      profile,
      "2026-10-10"
    );
    expect(ledger.byDate.get("2026-10-07")?.avg).toBe(80);
    expect(ledger.byDate.get("2026-10-08")?.avg).toBeNull();
  });

  it("余额 = 预算 + 运动消耗 − 摄入，据此判定少吃；没记饮食为 unknown", () => {
    const ledger = buildLedger(
      "2026-10-01",
      "2026-10-04",
      [weigh("2026-10-01", 80)],
      [
        food("2026-10-01", 1500),
        food("2026-10-02", 1700),
        move("2026-10-02", 40, 200),
        food("2026-10-03", 2200),
        move("2026-10-03", 20),
      ],
      profile,
      "2026-10-05"
    );
    const [d1, d2, d3, d4] = ledger.days;
    expect(d1.budget).toBe(1590);
    expect(d1.remaining).toBe(90);
    expect(d1.eat).toBe("ok");
    expect(d2.remaining).toBe(1590 + 200 - 1700);
    expect(d2.eat).toBe("ok");
    expect(d2.move).toBe("ok");
    expect(d3.eat).toBe("miss");
    expect(d3.move).toBe("miss");
    expect(d4.eat).toBe("unknown");
  });

  it("今天没过完时少吃不下结论，超了则直接算没做到；运动达标立刻算做到", () => {
    const ledger = buildLedger(
      "2026-10-01",
      "2026-10-02",
      [weigh("2026-10-01", 80)],
      [food("2026-10-01", 800), food("2026-10-02", 2500), move("2026-10-01", 30)],
      profile,
      "2026-10-01"
    );
    expect(ledger.days[0].eat).toBe("unknown");
    expect(ledger.days[0].move).toBe("ok");
    const over = buildLedger(
      "2026-10-02",
      "2026-10-02",
      [weigh("2026-10-02", 80)],
      [food("2026-10-02", 2500)],
      profile,
      "2026-10-02"
    );
    expect(over.days[0].eat).toBe("miss");
  });

  it("没填身体数据时预算为 0，少吃一律 unknown", () => {
    const ledger = buildLedger("2026-10-01", "2026-10-01", [], [food("2026-10-01", 1000)], null, "2026-10-02");
    expect(ledger.days[0].budget).toBe(0);
    expect(ledger.days[0].eat).toBe("unknown");
  });
});

describe("趋势与对比", () => {
  it("周速率为均值的回归斜率 × 7，点太少时为 null", () => {
    // 往前多给 6 天，均值窗口在区间开头就是完整的
    const weighs = Array.from({ length: 21 }, (_, i) =>
      weigh(addDays("2026-09-25", i), 80.6 - i * 0.1)
    );
    const ledger = buildLedger("2026-10-01", "2026-10-15", weighs, [], profile, "2026-10-15");
    expect(weeklyRate(ledger.days)).toBeCloseTo(-0.7, 1);
    expect(weeklyRate(ledger.days.slice(0, 3))).toBeNull();
  });

  it("四组对比只统计饮食有记录、次日有晨重的日子", () => {
    const ledger = buildLedger(
      "2026-10-01",
      "2026-10-04",
      [
        weigh("2026-10-01", 80),
        weigh("2026-10-02", 79.7),
        weigh("2026-10-03", 79.9),
        weigh("2026-10-04", 79.9),
        weigh("2026-10-05", 79.6),
      ],
      [
        food("2026-10-01", 1400),
        move("2026-10-01", 30),
        food("2026-10-02", 2600),
        move("2026-10-04", 30),
      ],
      profile,
      "2026-10-06"
    );
    const groups = Object.fromEntries(compareGroups(ledger.days).map(g => [g.id, g]));
    expect(groups.both).toMatchObject({ days: 1, mean: -0.3 });
    expect(groups.none).toMatchObject({ days: 1, mean: 0.2 });
    expect(groups.eat.days).toBe(0);
    expect(groups.move.days).toBe(0);
  });

  it("连续天数截至昨天，今天已做到时一并计入", () => {
    const ledger = buildLedger(
      "2026-10-01",
      "2026-10-04",
      [weigh("2026-10-01", 80)],
      [food("2026-10-01", 2600), food("2026-10-02", 1200), food("2026-10-03", 1200), move("2026-10-04", 40)],
      profile,
      "2026-10-04"
    );
    expect(streak(ledger.days, "eat", "2026-10-04")).toBe(2);
    expect(streak(ledger.days, "move", "2026-10-04")).toBe(1);
  });

  it("概览给出距目标与预计周数", () => {
    // 往前多给 6 天，均值窗口在区间开头就是完整的
    const weighs = Array.from({ length: 21 }, (_, i) =>
      weigh(addDays("2026-09-25", i), 80.6 - i * 0.1)
    );
    const ledger = buildLedger("2026-10-01", "2026-10-15", weighs, [], profile, "2026-10-15");
    const o = overview(ledger, profile, "2026-10-15", 80.6);
    expect(o.latestAvg).toBeCloseTo(78.9);
    expect(o.rate).toBeCloseTo(-0.7);
    expect(o.toGoal).toBeCloseTo(6.9);
    expect(o.weeksToGoal).toBeCloseTo(6.9 / 0.7);
    expect(o.bmi).toBeCloseTo(78.9 / 1.76 ** 2);
  });
});

describe("还没称过体重", () => {
  it("没有体重时预算为 0，少吃不判定", () => {
    const ledger = buildLedger("2026-10-01", "2026-10-01", [], [food("2026-10-01", 3000)], profile, "2026-10-02");
    expect(ledger.days[0]).toMatchObject({ budget: 0, eat: "unknown" });
  });

  it("预算沿用最近一次已知体重，均值窗口断开后不归零", () => {
    const ledger = buildLedger(
      "2026-10-01",
      "2026-10-12",
      [weigh("2026-10-01", 80)],
      [food("2026-10-12", 1000)],
      profile,
      "2026-10-13"
    );
    expect(ledger.byDate.get("2026-10-12")).toMatchObject({ avg: null, budget: 1590, eat: "ok" });
  });
});
