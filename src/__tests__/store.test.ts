import { beforeEach, describe, expect, it } from "vitest";
import { classify, fromMemory, parseEstimate } from "../data/parse";
import { parseProfile } from "../data/model";
import { createWeightData, registerCollections, WEIGH } from "../data/store";
import { createMemoryStore } from "./memory-store";

describe("读写层", () => {
  let store: ReturnType<typeof createMemoryStore>;
  let data: ReturnType<typeof createWeightData>;
  beforeEach(() => {
    store = createMemoryStore();
    registerCollections(store);
    data = createWeightData(store);
  });

  it("同一天同一时段重复称重覆盖旧值，保留一位小数", async () => {
    await data.saveWeigh("2026-10-29", "am", 77.34);
    await data.saveWeigh("2026-10-29", "am", 77.26);
    await data.saveWeigh("2026-10-29", "pm", 78.4);
    const list = await data.listWeighs("2026-10-29", "2026-10-29");
    expect(list.map(w => [w.slot, w.kg]).sort()).toEqual([
      ["am", 77.3],
      ["pm", 78.4],
    ]);
  });

  it("合并离线产生的重复体重", async () => {
    await store.records.insert(WEIGH, { date: "2026-10-29", slot: "am", kg: 77 });
    await store.records.insert(WEIGH, { date: "2026-10-29", slot: "am", kg: 78 });
    await data.saveWeigh("2026-10-29", "am", 76.5);
    expect(await data.listWeighs("2026-10-29", "2026-10-29")).toMatchObject([{ kg: 76.5 }]);
  });

  it("拒绝不合理的体重", async () => {
    await expect(data.saveWeigh("2026-10-29", "am", 5)).rejects.toThrow();
  });

  it("按日期窗口分页读取，跳过格式不对的记录", async () => {
    for (let d = 1; d <= 9; d++)
      for (let k = 0; k < 30; k++)
        await data.addEntry({
          date: `2026-10-0${d}`,
          time: `${String(10 + (k % 10)).padStart(2, "0")}:00`,
          kind: "food",
          text: `第 ${k} 顿`,
          kcal: 100,
          minutes: 0,
        });
    await store.records.insert("entry", { date: "2026-10-05", kind: "food", text: 1, kcal: 1 });
    const list = await data.listEntries("2026-10-02", "2026-10-08");
    expect(list).toHaveLength(7 * 30);
    expect(list[0].date).toBe("2026-10-02");
    expect(list.every((e, i) => i === 0 || `${list[i - 1].date}${list[i - 1].time}` <= `${e.date}${e.time}`)).toBe(true);
  });

  it("修改与删除带 revision", async () => {
    const entry = await data.addEntry({
      date: "2026-10-29",
      time: "12:00",
      kind: "food",
      text: "牛肉面",
      kcal: 600,
      minutes: 0,
    });
    await data.updateEntry(entry, { kcal: 680 });
    expect((await data.listEntries("2026-10-29", "2026-10-29"))[0].kcal).toBe(680);
    await expect(data.deleteEntry(entry)).rejects.toThrow("数据已被修改");
    const [fresh] = await data.listEntries("2026-10-29", "2026-10-29");
    await data.deleteEntry(fresh);
    expect(await data.listEntries("2026-10-29", "2026-10-29")).toEqual([]);
  });

  it("起点体重取最早的晨重", async () => {
    await data.saveWeigh("2026-10-02", "am", 80);
    await data.saveWeigh("2026-09-01", "pm", 83);
    await data.saveWeigh("2026-09-05", "am", 82);
    expect(await data.firstWeigh()).toBe(82);
  });

  it("记住常吃食物，按归一化的文字匹配", async () => {
    await data.rememberFood("牛肉面 （大碗）", 720);
    const foods = await data.getFoods();
    expect(fromMemory("牛肉面(大碗)", foods)).toMatchObject({ kind: "food", kcal: 720, source: "memory" });
    expect(fromMemory("牛肉面", foods)).toMatchObject({ kcal: null, source: null });
  });

  it("身体数据校验：缺字段视为未填，可选项给默认值", async () => {
    expect(parseProfile({ heightCm: 176 })).toBeNull();
    expect(parseProfile({ heightCm: 176, birthYear: 1994, sex: "male" })).toMatchObject({
      activity: 1.2,
      moveGoal: 30,
      goalKg: null,
      budgetOverride: null,
    });
  });
});

describe("一句话记录", () => {
  it("识别运动与时长", () => {
    expect(classify("跑步 5km 32 分钟")).toEqual({ kind: "move", text: "跑步 5km 32 分钟", minutes: 32 });
    expect(classify("晚饭后散步")).toMatchObject({ kind: "move", minutes: 30 });
    expect(classify("游泳 1 小时")).toMatchObject({ kind: "move", minutes: 60 });
    expect(classify("奶茶一杯")).toMatchObject({ kind: "food", minutes: 0 });
  });

  it("只接受约定形状的 AI 估算", () => {
    expect(parseEstimate('好的：{"kind":"food","kcal":380.4,"minutes":0,"label":"奶茶"}')).toEqual({
      kind: "food",
      kcal: 380,
      minutes: 0,
      label: "奶茶",
    });
    expect(parseEstimate('{"kind":"move","kcal":300,"minutes":32}')).toMatchObject({ minutes: 32, label: "" });
    expect(parseEstimate("大约 300 千卡")).toBeNull();
    expect(parseEstimate('{"kind":"food","kcal":-1}')).toBeNull();
    expect(parseEstimate('{"kind":"drink","kcal":100}')).toBeNull();
  });
});
