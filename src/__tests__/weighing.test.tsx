// @vitest-environment jsdom
import { act, type ButtonHTMLAttributes, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildLedger } from "../data/stats";
import { createWeightData, registerCollections, type WeightData } from "../data/store";
import { WeighDialog } from "../ui/WeighDialog";
import { WeighSheet, type WeighTarget } from "../ui/mobile/WeighSheet";
import { createMemoryStore } from "./memory-store";

vi.mock("../runtime", () => ({
  WEIGHT_KEY: ["weight"],
  useRuntime: () => ({ data, context: { signal } }),
}));
vi.mock("@tau/ui", () => ({
  Button: ({ children, onClick, disabled }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Dialog: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
    footer: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        {footer}
      </div>
    ) : null,
  DialogBody: ({ children }: { children: ReactNode }) => <>{children}</>,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  toast: { success: vi.fn(), error: vi.fn() },
  usePortalContainer: () => document.body,
  lockBodyScroll: () => vi.fn(),
}));

const signal = new AbortController().signal;
const today = "2026-11-28";
let data: WeightData;
let client: QueryClient;
let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 28, 9));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const store = createMemoryStore();
  registerCollections(store);
  data = createWeightData(store);
  await data.saveWeigh("2026-11-21", "am", 77);
  await data.saveWeigh("2026-11-21", "pm", 77.5);
  client = new QueryClient();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// 首次打开称重面板曾在日期 effect 执行前，把空日期拆成 undefined 传给翻译器，导致整页崩溃。
it.each([
  { platform: "desktop", date: today, slot: "am", kg: 77 },
  { platform: "desktop", date: "2026-11-25", slot: "pm", kg: 77.5 },
  { platform: "mobile", date: today, slot: "am", kg: 77 },
  { platform: "mobile", date: "2026-11-25", slot: "pm", kg: 77.5 },
] as const)(
  "$platform 首次打开称重后可以保存到 $date 的 $slot 时段",
  async ({ platform, date, slot, kg }) => {
    const ledger = buildLedger(
      "2026-11-21",
      today,
      await data.listWeighs("2026-11-21", today),
      [],
      null,
      today
    );
    const onClose = vi.fn();
    const render = (target: WeighTarget | null) =>
      act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            {platform === "desktop" ? (
              <WeighDialog state={target} onClose={onClose} />
            ) : (
              <WeighSheet target={target} onClose={onClose} />
            )}
          </QueryClientProvider>
        );
      });

    await render(null);
    await render({ date, slot, today, ledger, avg: null });
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) throw new Error("称重面板未打开");
    const save = Array.from(dialog.querySelectorAll("button")).at(-1);
    if (!save) throw new Error("称重面板缺少保存按钮");
    expect(save.disabled).toBe(false);
    await act(async () => save.click());

    expect(await data.listWeighs(date, date)).toMatchObject([{ date, slot, kg }]);
    expect(onClose).toHaveBeenCalledTimes(1);
  }
);
