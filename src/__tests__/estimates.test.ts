import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEstimateQueue } from "../data/estimates";
import { organizePrompt, parseOrganized, splitSpeech } from "../data/parse";
import { createWeightData, registerCollections } from "../data/store";
import { createMemoryStore } from "./memory-store";

const pendingInput = (text: string) => ({
  date: "2026-10-31",
  time: "17:05",
  kind: "food" as const,
  text,
  kcal: 0,
  minutes: 0,
  estimate: "pending" as const,
});

describe("后台估算", () => {
  let data: ReturnType<typeof createWeightData>;
  beforeEach(() => {
    const store = createMemoryStore();
    registerCollections(store);
    data = createWeightData(store);
  });

  it("估算成功写回热量、记住常吃并通知", async () => {
    const estimate = vi.fn(async () => ({ kind: "food" as const, kcal: 380, minutes: 0, label: "奶茶" }));
    const queue = createEstimateQueue({ data, estimate, signal: new AbortController().signal });
    const outcomes: string[] = [];
    queue.subscribe(o => outcomes.push(`${o.status}:${o.entry.kcal}`));
    const entry = await data.addEntry(pendingInput("奶茶一杯"));
    await queue.enqueue(entry);
    const [saved] = await data.listEntries("2026-10-31", "2026-10-31");
    expect(saved).toMatchObject({ kcal: 380, estimate: "ready" });
    expect(outcomes).toEqual(["ready:380"]);
    expect((await data.getFoods())["奶茶一杯"]).toBe(380);
    expect(queue.takeFresh()).toEqual([entry.id]);
    expect(queue.takeFresh()).toEqual([]);
  });

  it("估算失败标为 failed，等用户填", async () => {
    const queue = createEstimateQueue({
      data,
      estimate: async () => {
        throw new Error("AI_NOT_CONFIGURED");
      },
      signal: new AbortController().signal,
    });
    const statuses: string[] = [];
    queue.subscribe(o => statuses.push(o.status));
    await queue.enqueue(await data.addEntry(pendingInput("麻辣烫")));
    const [saved] = await data.listEntries("2026-10-31", "2026-10-31");
    expect(saved.estimate).toBe("failed");
    expect(statuses).toEqual(["failed"]);
  });

  it("估算期间用户已手填或删除时丢弃结果", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const queue = createEstimateQueue({
      data,
      estimate: async () => {
        await gate;
        return { kind: "food" as const, kcal: 999, minutes: 0, label: "" };
      },
      signal: new AbortController().signal,
    });
    const first = await data.addEntry(pendingInput("汉堡"));
    const second = await data.addEntry(pendingInput("薯条"));
    void queue.enqueue(first);
    void queue.enqueue(second);
    await new Promise(r => setTimeout(r, 0));
    await data.updateEntry((await data.getEntry(first.id))!, { kcal: 550, estimate: "ready" });
    await data.deleteEntry((await data.getEntry(second.id))!);
    release();
    await queue.idle();
    const list = await data.listEntries("2026-10-31", "2026-10-31");
    expect(list).toMatchObject([{ text: "汉堡", kcal: 550 }]);
  });

  it("启用时补跑存量 pending", async () => {
    await data.addEntry(pendingInput("包子"));
    await data.addEntry({ ...pendingInput("粥"), estimate: "ready", kcal: 120 });
    const estimate = vi.fn(async () => ({ kind: "food" as const, kcal: 250, minutes: 0, label: "" }));
    const queue = createEstimateQueue({ data, estimate, signal: new AbortController().signal });
    await queue.resume();
    expect(estimate).toHaveBeenCalledTimes(1);
    expect(await data.listPending()).toEqual([]);
  });

  it("停用后不再写回", async () => {
    const controller = new AbortController();
    const queue = createEstimateQueue({
      data,
      estimate: async () => {
        controller.abort();
        return { kind: "food" as const, kcal: 300, minutes: 0, label: "" };
      },
      signal: controller.signal,
    });
    await queue.enqueue(await data.addEntry(pendingInput("蛋糕")));
    expect((await data.listPending()).map(e => e.text)).toEqual(["蛋糕"]);
  });
});

describe("语音整理", () => {
  it("解析多条记录与评估，丢弃不合格项", () => {
    const reply = `{"items":[
      {"kind":"food","text":"牛肉面 + 鸡蛋","kcal":650,"minutes":0,"time":"12:30"},
      {"kind":"food","text":"奶茶一杯","kcal":380.6,"minutes":0,"time":null},
      {"kind":"move","text":"走路 40 分钟","kcal":160,"minutes":40,"time":"19:30"},
      {"kind":"drink","text":"水"},
      {"kind":"food","text":"","kcal":1}
    ],"advice":"晚饭基本没余量了。"}`;
    expect(parseOrganized(`好的：${reply}`)).toEqual({
      items: [
        { kind: "food", text: "牛肉面 + 鸡蛋", kcal: 650, minutes: 0, time: "12:30" },
        { kind: "food", text: "奶茶一杯", kcal: 381, minutes: 0, time: null },
        { kind: "move", text: "走路 40 分钟", kcal: 160, minutes: 40, time: "19:30" },
      ],
      advice: "晚饭基本没余量了。",
    });
    expect(parseOrganized('{"items":[]}')).toBeNull();
    expect(parseOrganized("没听清")).toBeNull();
    expect(parseOrganized('{"items":[{"kind":"move","text":"跑步","time":"25:00"}]}')?.items[0]).toEqual({
      kind: "move",
      text: "跑步",
      kcal: null,
      minutes: 30,
      time: null,
    });
  });

  it("没有 AI 时按句拆开并本地分类", () => {
    expect(splitSpeech("中午吃了牛肉面，下午喝了杯奶茶，然后跑步 20 分钟")).toEqual([
      { kind: "food", text: "牛肉面", kcal: null, minutes: 0, time: null },
      { kind: "food", text: "奶茶", kcal: null, minutes: 0, time: null },
      { kind: "move", text: "跑步 20 分钟", kcal: null, minutes: 20, time: null },
    ]);
  });

  it("提示里带上今天的余量与运动", () => {
    const prompt = organizePrompt("奶茶", { now: "17:05", remaining: 900, moveMinutes: 20, moveGoal: 30 }, 72.2);
    expect(prompt).toContain("还能吃 900 kcal");
    expect(prompt).toContain("已运动 20 分钟，目标 30 分钟");
    expect(prompt).toContain("体重 72.2 kg");
  });
});
