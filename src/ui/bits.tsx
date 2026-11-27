/**
 * 页面共用的小部件与格式化：数值、正负变化、类别色、日期文案。
 * 类别色取主题的数据色：饮食 tag-5、运动 tag-2；变化方向用 info（变轻）/ danger（变重），并始终带正负号。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@tau/ui";
import type { Translate } from "../i18n";

export const FOOD_COLOR = "var(--tau-tag-5)";
export const MOVE_COLOR = "var(--tau-tag-2)";
export const LOSE_COLOR = "var(--tau-info)";
export const GAIN_COLOR = "var(--tau-danger)";

export const kg = (v: number | null | undefined, digits = 1) => (v == null ? "—" : v.toFixed(digits));

export function signed(v: number, digits = 1): string {
  const fixed = Math.abs(v).toFixed(digits);
  if (Number(fixed) === 0) return `±${fixed}`;
  return `${v > 0 ? "+" : "−"}${fixed}`;
}

export function Delta({
  value,
  digits = 1,
  suffix = "",
  className,
}: {
  value: number | null | undefined;
  digits?: number;
  suffix?: string;
  className?: string;
}) {
  if (value == null) return <span className={cn("wt:text-ink-3", className)}>—</span>;
  const flat = Math.abs(value) < 0.5 * 10 ** -digits;
  return (
    <span
      className={cn(
        "wt:font-semibold wt:tabular-nums",
        flat ? "wt:text-ink-3" : value < 0 ? "wt:text-ok" : "wt:text-danger",
        className
      )}
    >
      {signed(value, digits)}
      {suffix}
    </span>
  );
}

/** 纸内卡片：落在页面那张大纸上，用细描边不叠阴影 */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("wt:bg-surface wt:border wt:border-line-1 wt:rounded-tau-lg wt:min-w-0", className)}>
      {children}
    </section>
  );
}

export function CardHead({ title, note, children }: { title: string; note?: ReactNode; children?: ReactNode }) {
  return (
    <header className="wt:flex wt:min-h-11 wt:items-center wt:gap-2 wt:px-[18px] wt:pt-4">
      <h2 className="wt:text-[13.5px] wt:font-semibold">{title}</h2>
      {note && <span className="wt:text-ink-3 wt:text-[11.5px]">{note}</span>}
      <span className="wt:flex-1" />
      {children}
    </header>
  );
}

export function Dot({ color, filled = true, className }: { color: string; filled?: boolean; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn("wt:inline-block wt:size-2 wt:shrink-0 wt:rounded-full", className)}
      style={filled ? { background: color } : { boxShadow: "inset 0 0 0 1.2px var(--tau-line-1)" }}
    />
  );
}

/** 元素的内容宽度，随容器缩放更新（图表按像素绘制） */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const WEEKDAY_KEYS = ["weekday.0", "weekday.1", "weekday.2", "weekday.3", "weekday.4", "weekday.5", "weekday.6"] as const;
/** 周一开头的表头顺序（一 … 日） */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0].map(i => WEEKDAY_KEYS[i]);
export const weekdayKeyOf = (date: string) => WEEKDAY_KEYS[new Date(`${date}T00:00:00`).getDay()];
export function dayLabel(t: Translate, date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return t("date.day", { month: m, day: d, week: t(WEEKDAY_KEYS[new Date(y, m - 1, d).getDay()]) });
}
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}
