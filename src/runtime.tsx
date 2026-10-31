/**
 * 插件运行时：本次启用的 context、数据层、AI 与查询缓存；组件经 useRuntime 取得。
 * 本插件的记录变化（含同步下载、其他窗口写入）时整体刷新。
 */
import { createContext, useContext, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PluginContext, PluginPageHandle, PluginSettingsHandle } from "@tau/plugins";
import { createAI, type WeightAI } from "./ai";
import { createWeightData, type WeightData } from "./data/store";
import { createEstimateQueue, type EstimateQueue } from "./data/estimates";
import { addDays } from "./data/model";

export const WEIGHT_KEY = ["weight"] as const;

export interface WeightRuntime {
  context: PluginContext;
  data: WeightData;
  ai: WeightAI;
  /** 后台估算：pending 条目在这里补上热量，离开页面也继续 */
  estimates: EstimateQueue;
  queryClient: QueryClient;
  pages: { main?: PluginPageHandle; trend?: PluginPageHandle; settings?: PluginSettingsHandle };
}

export function createRuntime(context: PluginContext): WeightRuntime {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  context.events.on(["record.created", "record.updated", "record.deleted", "workspace.reset"], () => {
    void queryClient.invalidateQueries({ queryKey: WEIGHT_KEY });
  });
  context.register({ dispose: () => queryClient.clear() });
  const data = createWeightData(context);
  const ai = createAI(context);
  const estimates = createEstimateQueue({
    data,
    signal: context.signal,
    // 运动消耗按记录当天附近的体重估算
    estimate: async (entry, signal) => {
      const recent = await data.listWeighs(addDays(entry.date, -7), entry.date).catch(() => []);
      const kg = recent.filter(w => w.slot === "am").at(-1)?.kg ?? null;
      return ai.estimate({ text: entry.text }, entry.kind === "move" ? kg : null, signal);
    },
  });
  estimates.subscribe(() => void queryClient.invalidateQueries({ queryKey: WEIGHT_KEY }));
  // 启用后补跑上次没算完的（应用被系统结束、离线时记下的）
  void estimates.resume().catch(() => undefined);
  return { context, data, ai, estimates, queryClient, pages: {} };
}

const RuntimeContext = createContext<WeightRuntime | null>(null);

export function RuntimeProvider({ runtime, children }: { runtime: WeightRuntime; children: ReactNode }) {
  return (
    <RuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={runtime.queryClient}>{children}</QueryClientProvider>
    </RuntimeContext.Provider>
  );
}

export function useRuntime(): WeightRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("减重的组件需要在插件页面内使用");
  return runtime;
}
