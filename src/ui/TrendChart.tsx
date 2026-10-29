/**
 * 趋势图：上半区体重（晨重散点 + 7 日均值线 + 目标虚线，可叠睡前空心点），下半区每日摄入柱
 * （没超预算用饮食色、超了用中性灰，预算为虚线，运动达标在柱下打点）。两区各自一根纵轴、共用横轴，
 * 悬停时十字线贯穿两区并显示当天明细。
 */
import { useMemo, useState, type PointerEvent } from "react";
import type { DaySummary } from "../data/stats";
import { FOOD_COLOR, MOVE_COLOR, dayLabel, kg, shortDate, signed, useWidth } from "./bits";

const PAD_L = 36;
const PAD_R = 14;
const TOP_H = 196;
const GAP = 34;
const BAR_H = 92;
const AXIS_H = 20;

export function TrendChart({
  days,
  today,
  goal,
  showPm,
}: {
  days: readonly DaySummary[];
  today: string;
  goal: number | null;
  showPm: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = TOP_H + GAP + BAR_H + AXIS_H;

  const scale = useMemo(() => {
    const values = days.flatMap(d => [d.am, d.avg, showPm ? d.pm : null]).filter((v): v is number => v != null);
    if (goal != null && values.length) {
      const min = Math.min(...values);
      // 目标离当前太远时不撑开坐标轴，避免曲线被压扁
      if (min - goal < 4) values.push(goal);
    }
    const lo = values.length ? Math.floor(Math.min(...values) - 0.3) : 60;
    const hi = values.length ? Math.ceil(Math.max(...values) + 0.3) : 80;
    const budgetMax = Math.max(...days.map(d => Math.max(d.intake, d.budget)), 1);
    const kcalMax = Math.max(1000, Math.ceil(budgetMax / 1000) * 1000);
    return { lo, hi, kcalMax, step: hi - lo > 8 ? 2 : 1 };
  }, [days, goal, showPm]);

  if (!days.length) return <div ref={ref} />;
  const plotW = Math.max(1, width - PAD_L - PAD_R);
  const x = (i: number) => PAD_L + (days.length === 1 ? plotW / 2 : (i / (days.length - 1)) * plotW);
  const y = (v: number) => 8 + ((scale.hi - v) / (scale.hi - scale.lo)) * (TOP_H - 8);
  const barTop = TOP_H + GAP;
  const yk = (v: number) => barTop + (1 - v / scale.kcalMax) * BAR_H;
  const bw = Math.max(2, Math.min(14, plotW / days.length - 3));
  const tickEvery = days.length > 45 ? 14 : days.length > 20 ? 7 : days.length > 10 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = scale.lo; v <= scale.hi; v += scale.step) ticks.push(v);
  const line = days
    .map((d, i) => (d.avg == null ? null : `${x(i).toFixed(1)},${y(d.avg).toFixed(1)}`))
    .reduce<string[]>((acc, p, i, all) => {
      if (p) acc.push(`${i === 0 || all[i - 1] === null ? "M" : "L"}${p}`);
      return acc;
    }, [])
    .join("");
  const lastAvg = [...days.keys()].reverse().find(i => days[i].avg != null);
  const budget = days[days.length - 1].budget;
  const h = hover != null ? days[hover] : null;

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const mx = event.clientX - svg.getBoundingClientRect().left - PAD_L;
    const index = days.length === 1 ? 0 : Math.round((mx / plotW) * (days.length - 1));
    setHover(Math.min(days.length - 1, Math.max(0, index)));
  };

  return (
    <div ref={ref} className="wt:relative wt:select-none">
      {width > 0 && (
        <svg width={width} height={height} className="wt:block wt:overflow-visible" role="img" aria-label="体重与每日摄入趋势">
          {ticks.map(v => (
            <g key={v}>
              <line x1={PAD_L} x2={width - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--tau-line-2)" />
              <text x={PAD_L - 8} y={y(v) + 3.5} textAnchor="end" className="wt:fill-ink-3 wt:text-[10.5px] wt:tabular-nums">
                {v}
              </text>
            </g>
          ))}
          {goal != null && goal >= scale.lo && goal <= scale.hi && (
            <g>
              <line x1={PAD_L} x2={width - PAD_R} y1={y(goal)} y2={y(goal)} stroke="var(--tau-ok)" strokeWidth={1.5} strokeDasharray="4 4" />
              <text x={width - PAD_R} y={y(goal) - 6} textAnchor="end" className="wt:fill-ok wt:text-[10.5px]">
                目标 {goal}
              </text>
            </g>
          )}
          {showPm &&
            days.map((d, i) =>
              d.pm == null ? null : (
                <circle key={`pm${d.date}`} cx={x(i)} cy={y(d.pm)} r={2.6} fill="none" stroke="var(--tau-ink-3)" strokeWidth={1.2} opacity={0.75} />
              )
            )}
          {days.map((d, i) =>
            d.am == null ? null : (
              <circle key={`am${d.date}`} cx={x(i)} cy={y(d.am)} r={days.length > 40 ? 2.4 : 3.2} fill="var(--tau-ink-3)" opacity={0.55} />
            )
          )}
          <path d={line} fill="none" stroke="var(--tau-accent)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          {lastAvg != null && (
            <circle cx={x(lastAvg)} cy={y(days[lastAvg].avg!)} r={4.5} fill="var(--tau-accent)" stroke="var(--tau-bg-surface)" strokeWidth={2} />
          )}

          {[0, scale.kcalMax / 2, scale.kcalMax].map(v => (
            <g key={`k${v}`}>
              <line x1={PAD_L} x2={width - PAD_R} y1={yk(v)} y2={yk(v)} stroke="var(--tau-line-2)" />
              <text x={PAD_L - 8} y={yk(v) + 3.5} textAnchor="end" className="wt:fill-ink-3 wt:text-[10.5px] wt:tabular-nums">
                {v ? `${v / 1000}k` : 0}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            if (!d.foodCount) return null;
            const top = yk(Math.min(d.intake, scale.kcalMax));
            const ok = d.eat !== "miss";
            return (
              <rect
                key={`b${d.date}`}
                x={x(i) - bw / 2}
                y={top}
                width={bw}
                height={Math.max(0, yk(0) - top)}
                rx={Math.min(4, bw / 2)}
                fill={ok ? FOOD_COLOR : "var(--tau-ink-3)"}
                opacity={d.date === today ? 0.45 : ok ? 0.9 : 0.45}
              />
            );
          })}
          {days.map((d, i) =>
            d.move === "ok" ? <circle key={`m${d.date}`} cx={x(i)} cy={yk(0) + 8} r={3} fill={MOVE_COLOR} /> : null
          )}
          {budget > 0 && (
            <g>
              <line x1={PAD_L} x2={width - PAD_R} y1={yk(budget)} y2={yk(budget)} stroke="var(--tau-ink-2)" strokeWidth={1.2} strokeDasharray="4 4" />
              <text x={width - PAD_R} y={yk(budget) - 5} textAnchor="end" className="wt:fill-ink-2 wt:text-[10.5px]">
                预算 {budget}
              </text>
            </g>
          )}
          {days.map((d, i) =>
            (days.length - 1 - i) % tickEvery === 0 ? (
              <text key={`t${d.date}`} x={x(i)} y={height - 2} textAnchor="middle" className="wt:fill-ink-3 wt:text-[10.5px] wt:tabular-nums">
                {shortDate(d.date)}
              </text>
            ) : null
          )}
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={4} y2={yk(0)} stroke="var(--tau-ink-2)" opacity={0.35} />
          )}
          {h?.avg != null && hover != null && (
            <circle cx={x(hover)} cy={y(h.avg)} r={4.5} fill="var(--tau-accent)" stroke="var(--tau-bg-surface)" strokeWidth={2} />
          )}
          <rect
            x={PAD_L - bw}
            y={0}
            width={plotW + bw * 2}
            height={height}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {h && hover != null && (
        <div
          className="wt:bg-surface wt:shadow-float wt:pointer-events-none wt:absolute wt:z-10 wt:min-w-[156px] wt:rounded-[10px] wt:px-[11px] wt:py-2 wt:text-[12px] wt:whitespace-nowrap"
          style={{
            top: 8,
            ...(x(hover) + 172 > width ? { right: width - x(hover) + 14 } : { left: x(hover) + 14 }),
          }}
        >
          <div className="wt:text-ink-3 wt:mb-0.5 wt:text-[11px]">
            {dayLabel(h.date)}
            {h.date === today ? " · 记录中" : ""}
          </div>
          <TipRow swatch="var(--tau-ink-3)" label="晨重" value={kg(h.am)} />
          {showPm && <TipRow swatch="transparent" ring label="睡前" value={kg(h.pm)} />}
          <TipRow swatch="var(--tau-accent)" label="7 日均值" value={kg(h.avg, 2)} />
          <TipRow
            swatch={FOOD_COLOR}
            label="摄入"
            value={h.foodCount ? `${h.intake} kcal` : "未记"}
            note={h.foodCount && h.budget ? `${signed(h.intake - h.burn - h.budget, 0)}` : undefined}
            over={h.eat === "miss"}
          />
          <TipRow swatch={MOVE_COLOR} label="运动" value={`${h.moveMinutes} 分钟`} />
        </div>
      )}
    </div>
  );
}

function TipRow({
  swatch,
  ring,
  label,
  value,
  note,
  over,
}: {
  swatch: string;
  ring?: boolean;
  label: string;
  value: string;
  note?: string;
  over?: boolean;
}) {
  return (
    <div className="wt:flex wt:items-center wt:gap-2 wt:leading-[1.75]">
      <span
        className="wt:size-2 wt:shrink-0 wt:rounded-[2px]"
        style={{ background: swatch, boxShadow: ring ? "inset 0 0 0 1.2px var(--tau-ink-3)" : undefined }}
      />
      {label}
      <b className="wt:ml-auto wt:font-semibold wt:tabular-nums">{value}</b>
      {note && <span className={over ? "wt:text-danger wt:tabular-nums" : "wt:text-ok wt:tabular-nums"}>{note}</span>}
    </div>
  );
}
