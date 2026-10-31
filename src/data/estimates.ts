/**
 * 后台估算：没记过热量的条目先以 pending 记下，这里逐条请 AI 估算并写回。
 * 队列挂在插件运行时上，离开页面也继续；启用时补跑上次没算完的条目。
 * 估算失败（含没配模型）标记为 failed，等用户填热量。条目已被删除或被用户改过时丢弃结果。
 */
import { PluginConflictError } from "@tau/plugins";
import type { Estimate } from "./parse";
import type { Entry } from "./model";
import type { WeightData } from "./store";

export interface EstimateOutcome {
  entry: Entry;
  /** 估算成功写回后为 ready，失败为 failed */
  status: "ready" | "failed";
  error?: unknown;
}

export interface EstimateQueueDeps {
  data: Pick<WeightData, "getEntry" | "updateEntry" | "listPending" | "rememberFood">;
  estimate(entry: Entry, signal: AbortSignal): Promise<Estimate>;
  signal: AbortSignal;
}

export function createEstimateQueue({ data, estimate, signal }: EstimateQueueDeps) {
  const waiting: string[] = [];
  const listeners = new Set<(outcome: EstimateOutcome) => void>();
  /** 已估算完成但用户还没看到的条目 */
  const fresh = new Set<string>();
  let running: Promise<void> | null = null;

  const emit = (outcome: EstimateOutcome) => {
    if (outcome.status === "ready") fresh.add(outcome.entry.id);
    for (const listener of listeners) listener(outcome);
  };

  async function settle(id: string) {
    const current = await data.getEntry(id);
    // 删除了，或已被用户手动填了热量
    if (!current || current.estimate !== "pending") return;
    let result: Estimate;
    try {
      result = await estimate(current, signal);
    } catch (error) {
      if (signal.aborted) return;
      const latest = await data.getEntry(id);
      if (!latest || latest.estimate !== "pending") return;
      const failed = await data.updateEntry(latest, { estimate: "failed" }).catch(() => null);
      if (failed) emit({ entry: failed, status: "failed", error });
      return;
    }
    if (signal.aborted) return;
    const latest = await data.getEntry(id);
    if (!latest || latest.estimate !== "pending") return;
    const kind = result.kind;
    const patch = {
      kind,
      kcal: result.kcal,
      minutes: kind === "move" ? result.minutes || latest.minutes || 30 : 0,
      estimate: "ready" as const,
    };
    try {
      const next = await data.updateEntry(latest, patch);
      if (kind === "food") await data.rememberFood(next.text, next.kcal);
      emit({ entry: next, status: "ready" });
    } catch (error) {
      // 估算期间被另一台设备改过：下一轮重新读取
      if (error instanceof PluginConflictError && !waiting.includes(id)) waiting.push(id);
      else if (!(error instanceof PluginConflictError)) throw error;
    }
  }

  function drain() {
    running ??= (async () => {
      while (waiting.length && !signal.aborted) {
        const id = waiting.shift()!;
        await settle(id).catch(error => console.error("[weight] 估算失败", error));
      }
    })().finally(() => {
      running = null;
      if (waiting.length && !signal.aborted) drain();
    });
    return running;
  }

  return {
    /** 排入一条 pending 条目 */
    enqueue(entry: Pick<Entry, "id">) {
      if (signal.aborted || waiting.includes(entry.id)) return drain();
      waiting.push(entry.id);
      return drain();
    },
    /** 补跑存量 pending（启用时调用） */
    async resume() {
      const pending = await data.listPending();
      for (const entry of pending) if (!waiting.includes(entry.id)) waiting.push(entry.id);
      return drain();
    },
    subscribe(listener: (outcome: EstimateOutcome) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** 取走「估算完成、还没被看到」的条目，用于下次打开页面时高亮 */
    takeFresh(): string[] {
      const ids = [...fresh];
      fresh.clear();
      return ids;
    },
    /** 测试用：等队列空 */
    idle: () => running ?? Promise.resolve(),
  };
}

export type EstimateQueue = ReturnType<typeof createEstimateQueue>;
