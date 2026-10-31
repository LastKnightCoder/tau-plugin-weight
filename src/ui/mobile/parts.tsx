/**
 * 手机界面的小部件：卡片、主按钮、± 步进、条目图标、余额环。
 * 触控目标不小于 32px；颜色只用主题 token 与 bits 里的数据色。
 */
import type { ReactNode } from "react";
import { Footprints, Minus, Plus, UtensilsCrossed } from "lucide-react";
import { cn } from "@tau/ui";
import type { EntryKind } from "../../data/model";
import { FOOD_COLOR, GAIN_COLOR, MOVE_COLOR } from "../bits";

export function MCard({ className, children, onClick }: { className?: string; children: ReactNode; onClick?(): void }) {
  const Tag = onClick ? "button" : "section";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "wt:bg-surface wt:shadow-card wt:block wt:w-full wt:min-w-0 wt:rounded-[18px] wt:px-4 wt:py-3.5 wt:text-left",
        onClick && "wt:active:scale-[0.99] wt:transition-transform",
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  ghost,
  small,
  className,
}: {
  children: ReactNode;
  onClick?(): void;
  disabled?: boolean;
  ghost?: boolean;
  small?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "wt:flex wt:items-center wt:justify-center wt:gap-1.5 wt:font-[650] wt:transition-[transform,opacity] wt:active:scale-[0.98] wt:disabled:opacity-40 wt:[&>svg]:size-4",
        small ? "wt:h-9 wt:rounded-[12px] wt:px-3.5 wt:text-[13.5px]" : "wt:h-[50px] wt:w-full wt:rounded-[16px] wt:text-[15.5px]",
        ghost ? "wt:bg-hover wt:text-ink-1" : "wt:bg-accent wt:text-ink-inverse",
        className
      )}
    >
      {children}
    </button>
  );
}

/** ± 步进：每次 step，热量不小于 0 */
export function Stepper({
  value,
  onChange,
  step = 10,
  unit = "kcal",
  label,
}: {
  value: number;
  onChange(value: number): void;
  step?: number;
  unit?: string;
  label: string;
}) {
  return (
    <div className="wt:bg-hover wt:flex wt:shrink-0 wt:items-center wt:gap-0.5 wt:rounded-[12px] wt:p-[3px]" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`减少 ${step}`}
        onClick={() => onChange(Math.max(0, value - step))}
        className="wt:text-ink-2 wt:grid wt:size-8 wt:place-items-center wt:rounded-[9px] wt:active:bg-press"
      >
        <Minus className="wt:size-4" />
      </button>
      <span className="wt:min-w-[52px] wt:text-center wt:leading-none">
        <b className="wt:block wt:text-[17px] wt:font-bold wt:tabular-nums">{value}</b>
        <small className="wt:text-ink-3 wt:text-[10.5px]">{unit}</small>
      </span>
      <button
        type="button"
        aria-label={`增加 ${step}`}
        onClick={() => onChange(value + step)}
        className="wt:text-ink-2 wt:grid wt:size-8 wt:place-items-center wt:rounded-[9px] wt:active:bg-press"
      >
        <Plus className="wt:size-4" />
      </button>
    </div>
  );
}

export function KindIcon({ kind, ghost, size = 30 }: { kind: EntryKind; ghost?: boolean; size?: number }) {
  const color = kind === "move" ? MOVE_COLOR : FOOD_COLOR;
  const Glyph = kind === "move" ? Footprints : UtensilsCrossed;
  return (
    <span
      aria-hidden
      className="wt:grid wt:shrink-0 wt:place-items-center wt:rounded-[10px]"
      style={{
        width: size,
        height: size,
        ...(ghost
          ? { boxShadow: "inset 0 0 0 1.5px var(--tau-line-1)", color: "var(--tau-ink-3)" }
          : { background: `color-mix(in srgb, ${color} 16%, transparent)`, color }),
      }}
    >
      <Glyph className="wt:size-[15px]" strokeWidth={2} />
    </span>
  );
}

/** 余额环：已吃占（预算 + 运动）的比例；超了变红 */
export function Ring({ eaten, total, size = 96, children }: { eaten: number; total: number; size?: number; children: ReactNode }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const over = total > 0 && eaten > total;
  const p = total > 0 ? Math.min(1, eaten / total) : 0;
  return (
    <div className="wt:relative wt:shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tau-bg-track)" strokeWidth={9} />
        {total > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={over ? GAIN_COLOR : FOOD_COLOR}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="wt:transition-[stroke-dasharray] wt:duration-500 wt:ease-tau-out"
          />
        )}
      </svg>
      <div className="wt:absolute wt:inset-0 wt:grid wt:place-content-center wt:text-center">{children}</div>
    </div>
  );
}
