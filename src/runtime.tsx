/**
 * 插件运行时：本次启用的 context、数据层、AI 与查询缓存；组件经 useRuntime 取得。
 * 本插件的记录变化（含同步下载、其他窗口写入）时整体刷新。
 */
import { createContext, useContext, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PluginContext, PluginPageHandle, PluginSettingsHandle } from "@tau/plugins";
import { createAI, type WeightAI } from "./ai";
import { createWeightData, type WeightData } from "./data/store";

export const WEIGHT_KEY = ["weight"] as const;

export interface WeightRuntime {
  context: PluginContext;
  data: WeightData;
  ai: WeightAI;
  queryClient: QueryClient;
  pages: { main?: PluginPageHandle; settings?: PluginSettingsHandle };
}

export function createRuntime(context: PluginContext): WeightRuntime {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  context.events.on(["record.created", "record.updated", "record.deleted", "workspace.reset"], () => {
    void queryClient.invalidateQueries({ queryKey: WEIGHT_KEY });
  });
  context.register({ dispose: () => queryClient.clear() });
  return {
    context,
    data: createWeightData(context),
    ai: createAI(context),
    queryClient,
    pages: {},
  };
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
  if (!runtime) throw new Error("减重记账本的组件需要在插件页面内使用");
  return runtime;
}
