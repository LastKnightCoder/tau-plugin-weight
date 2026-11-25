// @vitest-environment jsdom
import { Activity, act } from "react";
import { defaultScheduler, notifyManager } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import type { PluginContext, PluginPageContext, PluginPageParams } from "@tau/plugins";
import { expect, it, vi } from "vitest";
import { registerCollections } from "../data/store";
import { createRuntime, RuntimeProvider } from "../runtime";
import { MobileHomePanel } from "../ui/mobile/MobileHomePanel";
import { MobileWeightPage } from "../ui/mobile/MobileWeightPage";
import { createMemoryStore } from "./memory-store";

vi.mock("@tau/ui", () => ({
  cn: (...names: unknown[]) => names.filter(Boolean).join(" "),
  Loading: () => null,
  usePortalContainer: () => document.body,
}));

it("今天页记一笔只打开一次减重页，保活恢复后保留输入的草稿", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 22, 15));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const store = createMemoryStore();
  registerCollections(store);
  const context = {
    ...store,
    events: { on: vi.fn() },
    register: vi.fn(),
    speech: { unavailableReason: () => null },
    signal: new AbortController().signal,
  } as unknown as PluginContext;
  const runtime = createRuntime(context);
  const open = vi.fn(async (_params?: PluginPageParams) => {});
  runtime.pages.main = { id: "weight", open, dispose: vi.fn() };
  const pageContext: PluginPageContext = {
    isActive: () => true,
    register: vi.fn(),
    registerLeaveGuard: vi.fn(),
    registerDismiss: vi.fn(),
  };
  try {
    notifyManager.setScheduler(callback => void Promise.resolve().then(callback));
    await runtime.data.savePrefs({ onboarded: true });
    await act(async () =>
      root.render(
        <RuntimeProvider runtime={runtime}>
          <MobileHomePanel context={context} />
        </RuntimeProvider>
      )
    );
    const log = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "记一笔"
    );
    if (!log) throw new Error("首页卡片未显示记一笔");
    await act(async () => log.click());
    expect(open).toHaveBeenCalledTimes(1);
    const params = open.mock.calls[0][0]!;
    const pageProps = { context, params, pageContext, placement: "page" as const };
    const showPage = async (mode: "visible" | "hidden") =>
      act(async () =>
        root.render(
          <RuntimeProvider runtime={runtime}>
            <Activity mode={mode}>
              <MobileWeightPage {...pageProps} />
            </Activity>
          </RuntimeProvider>
        )
      );
    await showPage("visible");
    await act(async () => vi.advanceTimersToNextFrame());
    expect(document.activeElement).toBeInstanceOf(HTMLInputElement);
    expect(open).toHaveBeenCalledTimes(1);
    const input = document.activeElement as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "午饭"
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await showPage("hidden");
    await showPage("visible");
    expect(input.value).toBe("午饭");
    expect(open).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    runtime.queryClient.clear();
    container.remove();
    notifyManager.setScheduler(defaultScheduler);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
