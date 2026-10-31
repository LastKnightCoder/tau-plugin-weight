// @vitest-environment jsdom
import { act, type ButtonHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickLog } from "../ui/QuickLog";

const { addEntry, invalidateQueries, estimate } = vi.hoisted(() => ({
  addEntry: vi.fn(async (_input: unknown) => undefined),
  invalidateQueries: vi.fn(async () => undefined),
  estimate: vi.fn(async () => ({ kind: "move", kcal: 95, minutes: 30, label: "散步半小时" })),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("../ui/queries", () => ({ useFoods: () => ({ data: foods }) }));
vi.mock("../runtime", () => ({
  WEIGHT_KEY: ["weight"],
  useRuntime: () => runtime,
}));
vi.mock("@tau/ui", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  IconButton: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Spinner: () => null,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const foods = {};
const runtime = {
  data: { addEntry },
  ai: { estimate },
  context: { signal: new AbortController().signal },
};
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("一句话记录的提交时间", () => {
  it.each([
    [new Date(2026, 9, 31, 17, 5), new Date(2026, 9, 31, 20, 28), "2026-10-31", "20:28"],
    [new Date(2026, 9, 31, 23, 59), new Date(2026, 10, 1, 0, 1), "2026-11-01", "00:01"],
  ])(
    "页面在 %s 打开，%s 提交时使用当前本地日期和时间",
    async (openedAt, submittedAt, date, time) => {
      vi.setSystemTime(openedAt);
      await act(async () => {
        root.render(<QuickLog remaining={500} kg={77} hasProfile />);
      });
      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label="一句话记录饮食或运动"]'
      )!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          "散步半小时"
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      // 模拟休眠或后台节流：推进系统时间，不触发页面的定时刷新。
      vi.setSystemTime(submittedAt);
      await act(async () => {
        container.querySelector<HTMLButtonElement>('button[aria-label="记下"]')!.click();
      });
      expect(addEntry).toHaveBeenCalledWith({
        date,
        time,
        kind: "move",
        text: "散步半小时",
        kcal: 95,
        minutes: 30,
        estimate: "ready",
      });
    }
  );
});
