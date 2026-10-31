/**
 * 二级页「趋势与效果」：体重趋势（按住左右拖看某天读数）、打卡格（5 周，点格看当天）、
 * 「做到了，第二天轻多少」四组对比、AI 分析（点了才请求，数据变了只提示可能过时）。
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@tau/ui";
import { aiErrorMessage, needsSetup, type AIScope, type AnalysisInput } from "../../ai";
import { addDays } from "../../data/model";
import { compareGroups, type DaySummary, type GroupStat, type Ledger } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { FOOD_COLOR, GAIN_COLOR, LOSE_COLOR, MOVE_COLOR, dayLabel, kg, shortDate, signed, useWidth } from "../bits";
import { Rendered } from "../AIPanel";
import { MCard, PrimaryButton } from "./parts";

type Range = 14 | 30 | 90;

export function TrendView({
  ledger,
  today,
  goal,
  moveGoal,
  budgetKnown,
  aiInput,
  stamp,
}: {
  ledger: Ledger;
  today: string;
  goal: number | null;
  moveGoal: number;
  budgetKnown: boolean;
  aiInput: AnalysisInput;
  stamp: string;
}) {
  const [range, setRange] = useState<Range>(30);
  const days = useMemo(() => ledger.days.filter(d => d.date > addDays(today, -range)), [ledger, range, today]);
  const values = days.map(d => d.avg).filter((v): v is number => v != null);
  const latest = values.at(-1) ?? null;
  const change = values.length >= 2 ? values[values.length - 1] - values[0] : null;
  return (
    <div className="wt:flex wt:flex-col wt:gap-3 wt:pt-1 wt:pb-6">
      <MCard>
        <div className="wt:mb-1.5 wt:flex wt:items-center">
          <h2 className="wt:text-[13.5px] wt:font-[650]">体重</h2>
          <span className="wt:flex-1" />
          <Pills<Range>
            value={range}
            onChange={setRange}
            options={[
              [14, "2 周"],
              [30, "月"],
              [90, "3 月"],
            ]}
          />
        </div>
        <div className="wt:text-ink-2 wt:mb-2.5 wt:flex wt:gap-4 wt:text-[12px]">
          <span>
            7 日均值 <b className="wt:text-ink-1 wt:tabular-nums">{kg(latest)}</b>
          </span>
          {change != null && (
            <span>
              {range} 天 <b className={cn("wt:tabular-nums", change <= 0 ? "wt:text-info" : "wt:text-danger")}>{signed(change)}</b>
            </span>
          )}
          {goal != null && latest != null && (
            <span>
              距目标 <b className="wt:text-ink-1 wt:tabular-nums">{Math.max(0, latest - goal).toFixed(1)}</b>
            </span>
          )}
        </div>
        {days.some(d => d.am != null || d.foodCount) ? (
          <TouchChart days={days} goal={goal} today={today} />
        ) : (
          <p className="wt:text-ink-3 wt:grid wt:h-[180px] wt:place-items-center wt:text-[12.5px]">明早起床称一次，趋势从这里开始</p>
        )}
        <div className="wt:text-ink-2 wt:mt-2 wt:flex wt:flex-wrap wt:gap-x-3 wt:gap-y-1 wt:text-[11px]">
          <Legend swatch={<i className="wt:bg-accent wt:h-0.5 wt:w-3.5 wt:rounded-full" />}>7 日均值</Legend>
          {goal != null && (
            <Legend swatch={<i className="wt:h-0 wt:w-3.5 wt:border-t-[1.5px] wt:border-dashed wt:border-ok" />}>目标</Legend>
          )}
          <Legend swatch={<i className="wt:h-2.5 wt:w-2 wt:rounded-[2px]" style={{ background: FOOD_COLOR }} />}>没超预算</Legend>
          <Legend swatch={<i className="wt:bg-ink-3 wt:h-2.5 wt:w-2 wt:rounded-[2px] wt:opacity-45" />}>超预算</Legend>
        </div>
      </MCard>
      <HabitCard ledger={ledger} today={today} moveGoal={moveGoal} budgetKnown={budgetKnown} />
      <GroupCard groups={compareGroups(ledger.days)} />
      <AICard input={aiInput} stamp={stamp} />
    </div>
  );
}

function Pills<T extends string | number>({ value, onChange, options }: { value: T; onChange(v: T): void; options: [T, string][] }) {
  return (
    <span className="wt:flex wt:gap-1" role="radiogroup">
      {options.map(([key, label]) => (
        <button
          key={String(key)}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "wt:h-7 wt:rounded-full wt:px-2.5 wt:text-[12px]",
            value === key ? "wt:bg-ink-1 wt:text-ink-inverse wt:font-semibold" : "wt:text-ink-3"
          )}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="wt:inline-flex wt:items-center wt:gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

const KG_H = 118;
const GAP = 14;
const BAR_H = 52;
const PAD_R = 30;

/** 按住左右拖：竖线吸附到最近一天并显示读数，拖动期间不滚动页面 */
function TouchChart({ days, goal, today }: { days: readonly DaySummary[]; goal: number | null; today: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [scrub, setScrub] = useState<number | null>(null);
  const hold = useRef<{ timer?: number; id: number; x: number; y: number; active: boolean } | null>(null);
  const values = days.flatMap(d => [d.am, d.avg]).filter((v): v is number => v != null);
  if (goal != null && values.length && Math.min(...values) - goal < 4) values.push(goal);
  const lo = values.length ? Math.min(...values) - 0.3 : 60;
  const hi = values.length ? Math.max(...values) + 0.3 : 80;
  const kcalMax = Math.max(2000, ...days.map(d => Math.max(d.intake, d.budget)));
  const height = KG_H + GAP + BAR_H + 10;
  const plotW = Math.max(1, width - PAD_R);
  const n = days.length;
  const x = (i: number) => (i + 0.5) * (plotW / n);
  const y = (v: number) => 6 + ((hi - v) / (hi - lo)) * (KG_H - 6);
  const barTop = KG_H + GAP;
  const by = (v: number) => barTop + BAR_H - (v / kcalMax) * BAR_H;
  const bw = Math.max(1.5, (plotW / n) * 0.62);
  const line = days
    .map((d, i) => (d.avg == null ? null : `${x(i).toFixed(1)},${y(d.avg).toFixed(1)}`))
    .reduce<string[]>((acc, p, i, all) => {
      if (p) acc.push(`${i === 0 || all[i - 1] === null ? "M" : "L"}${p}`);
      return acc;
    }, [])
    .join("");
  const budget = days.at(-1)?.budget ?? 0;

  const indexAt = (clientX: number, el: HTMLElement) =>
    Math.min(n - 1, Math.max(0, Math.floor(((clientX - el.getBoundingClientRect().left) / plotW) * n)));
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const state = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false } as NonNullable<typeof hold.current>;
    hold.current = state;
    // 鼠标立即开始；触摸按住 200ms 才进入拖动，避免挡住页面滚动
    const startNow = e.pointerType === "mouse";
    const begin = () => {
      state.active = true;
      el.setPointerCapture(state.id);
      setScrub(indexAt(state.x, el));
      navigator.vibrate?.(6);
    };
    if (startNow) begin();
    else state.timer = window.setTimeout(begin, 200);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const state = hold.current;
    if (!state || state.id !== e.pointerId) return;
    if (!state.active) {
      if (Math.hypot(e.clientX - state.x, e.clientY - state.y) > 8) {
        window.clearTimeout(state.timer);
        hold.current = null;
      }
      return;
    }
    const next = indexAt(e.clientX, e.currentTarget);
    if (next !== scrub) setScrub(next);
  };
  const onUp = () => {
    window.clearTimeout(hold.current?.timer);
    hold.current = null;
    setScrub(null);
  };
  const d = scrub != null ? days[scrub] : null;

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={e => e.preventDefault()}
      data-no-tab-swipe
      data-no-edge-back
      className={cn("wt:relative wt:select-none", scrub != null ? "wt:touch-none" : "wt:touch-pan-y")}
    >
      {d && (
        <div
          className="wt:bg-ink-1 wt:text-ink-inverse wt:shadow-float wt:pointer-events-none wt:absolute wt:-top-1.5 wt:z-[1] wt:rounded-[12px] wt:px-2.5 wt:py-1.5 wt:text-[11.5px] wt:leading-[1.55] wt:whitespace-nowrap"
          style={{ left: Math.min(Math.max(0, x(scrub!) - 70), Math.max(0, width - 160)) }}
        >
          {d.date === today ? "今天" : dayLabel(d.date)} · 晨重 <b className="wt:text-[13px] wt:tabular-nums">{kg(d.am)}</b>
          <br />
          均值 {kg(d.avg)} · {d.foodCount ? `吃了 ${d.intake} kcal${d.eat === "miss" ? "（超）" : ""}` : "饮食没记"}
        </div>
      )}
      {width > 0 && (
        <svg width={width} height={height} aria-label="体重与每日摄入趋势" role="img" className="wt:block">
          {[0, 0.5, 1].map(t => {
            const v = hi - t * (hi - lo);
            return (
              <g key={t}>
                <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="var(--tau-line-2)" />
                <text x={plotW + 4} y={y(v) + 3.5} fontSize={10} fill="var(--tau-ink-3)">
                  {v.toFixed(1)}
                </text>
              </g>
            );
          })}
          {goal != null && goal >= lo && (
            <line x1={0} x2={plotW} y1={y(goal)} y2={y(goal)} stroke="var(--tau-ok)" strokeDasharray="4 3" strokeWidth={1.5} />
          )}
          {days.map((day, i) =>
            day.foodCount ? (
              <rect
                key={day.date}
                x={x(i) - bw / 2}
                y={by(day.intake)}
                width={bw}
                height={barTop + BAR_H - by(day.intake)}
                rx={Math.min(2, bw / 2)}
                fill={day.eat === "miss" ? "var(--tau-ink-3)" : FOOD_COLOR}
                opacity={day.eat === "miss" ? 0.35 : 0.75}
              />
            ) : null
          )}
          {budget > 0 && (
            <line x1={0} x2={plotW} y1={by(budget)} y2={by(budget)} stroke="var(--tau-ink-3)" strokeDasharray="2 3" opacity={0.6} />
          )}
          {n <= 30 &&
            days.map((day, i) =>
              day.move === "ok" ? <circle key={day.date} cx={x(i)} cy={barTop + BAR_H + 6} r={2.2} fill={MOVE_COLOR} /> : null
            )}
          {n <= 30 &&
            days.map((day, i) =>
              day.am != null ? <circle key={day.date} cx={x(i)} cy={y(day.am)} r={2.6} fill="var(--tau-ink-3)" opacity={0.55} /> : null
            )}
          <path d={line} fill="none" stroke="var(--tau-accent)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {scrub != null && (
            <g>
              <line x1={x(scrub)} x2={x(scrub)} y1={0} y2={barTop + BAR_H} stroke="var(--tau-ink-1)" strokeWidth={1.2} />
              {d?.avg != null && <circle cx={x(scrub)} cy={y(d.avg)} r={5} fill="var(--tau-bg-surface)" stroke="var(--tau-accent)" strokeWidth={2.4} />}
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

const WEEKS = 5;

function HabitCard({ ledger, today, moveGoal, budgetKnown }: { ledger: Ledger; today: string; moveGoal: number; budgetKnown: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const weekday = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const firstMonday = addDays(today, -weekday - (WEEKS - 1) * 7);
  const rows = Array.from({ length: WEEKS }, (_, w) => addDays(firstMonday, w * 7));
  const day = picked ? ledger.byDate.get(picked) : null;
  return (
    <MCard>
      <div className="wt:mb-2 wt:flex wt:items-baseline wt:gap-1.5">
        <h2 className="wt:text-[13.5px] wt:font-[650]">打卡</h2>
        <small className="wt:text-ink-3 wt:text-[11.5px]">由记录自动判定</small>
      </div>
      <div className="wt:grid wt:grid-cols-[30px_repeat(7,minmax(0,1fr))] wt:items-center wt:gap-1">
        <span />
        {"一二三四五六日".split("").map(c => (
          <span key={c} className="wt:text-ink-3 wt:text-center wt:text-[10.5px]">
            {c}
          </span>
        ))}
        {rows.map(monday => (
          <Week key={monday} monday={monday} ledger={ledger} today={today} picked={picked} onPick={setPicked} />
        ))}
      </div>
      <p className="wt:text-ink-2 wt:mt-2.5 wt:min-h-[18px] wt:text-[12px]">
        {day ? (
          <>
            {dayLabel(day.date)} · 晨重 {kg(day.am)} · {day.foodCount ? `吃了 ${day.intake}` : "饮食没记"} · 运动 {day.moveMinutes} 分钟
          </>
        ) : (
          <span className="wt:text-ink-3 wt:inline-flex wt:flex-wrap wt:gap-x-3">
            <span className="wt:inline-flex wt:items-center wt:gap-1">
              <Dot color={FOOD_COLOR} filled />
              少吃{budgetKnown ? "" : "（填身体数据后判定）"}
            </span>
            <span className="wt:inline-flex wt:items-center wt:gap-1">
              <Dot color={MOVE_COLOR} filled />
              多动 · 满 {moveGoal} 分钟
            </span>
          </span>
        )}
      </p>
    </MCard>
  );
}

function Week({
  monday,
  ledger,
  today,
  picked,
  onPick,
}: {
  monday: string;
  ledger: Ledger;
  today: string;
  picked: string | null;
  onPick(date: string | null): void;
}) {
  return (
    <>
      <span className="wt:text-ink-3 wt:text-[10px] wt:tabular-nums">{shortDate(monday)}</span>
      {Array.from({ length: 7 }, (_, k) => {
        const date = addDays(monday, k);
        const day = ledger.byDate.get(date);
        if (!day || date > today) return <span key={date} className="wt:h-[30px]" />;
        return (
          <button
            key={date}
            type="button"
            aria-label={dayLabel(date)}
            aria-pressed={picked === date}
            onClick={() => onPick(picked === date ? null : date)}
            className={cn(
              "wt:bg-hover wt:flex wt:h-[30px] wt:items-center wt:justify-center wt:gap-[3px] wt:rounded-[9px]",
              date === today && "wt:shadow-[0_0_0_1.5px_var(--tau-ink-1)]",
              picked === date && "wt:bg-press"
            )}
          >
            <Dot color={FOOD_COLOR} filled={day.eat === "ok"} />
            <Dot color={MOVE_COLOR} filled={day.move === "ok"} />
          </button>
        );
      })}
    </>
  );
}

function Dot({ color, filled }: { color: string; filled: boolean }) {
  return (
    <i
      aria-hidden
      className="wt:inline-block wt:size-[7px] wt:rounded-full"
      style={filled ? { background: color } : { boxShadow: `inset 0 0 0 1.4px ${color}` }}
    />
  );
}

const MIN_SAMPLE = 5;

function GroupCard({ groups }: { groups: GroupStat[] }) {
  const max = Math.max(0.2, ...groups.map(g => Math.abs(g.mean ?? 0)));
  const [both, eat, move, none] = groups;
  const enough = (g: GroupStat) => g.days >= MIN_SAMPLE && g.mean != null;
  const parts: string[] = [];
  if (enough(eat) && enough(move)) parts.push(eat.mean! < move.mean! ? "对你来说少吃比多动管用" : "对你来说多动比少吃管用");
  if (enough(both) && groups.filter(enough).every(g => g === both || both.mean! <= g.mean!)) parts.push("两样都做到效果最好");
  if (enough(none) && none.mean! > 0) parts.push("都没做的日子第二天会涨");
  return (
    <MCard>
      <h2 className="wt:mb-1 wt:text-[13.5px] wt:font-[650]">做到了，第二天轻多少</h2>
      {groups.map(g => {
        const v = g.mean ?? 0;
        const w = (Math.abs(v) / max) * (v < 0 ? 62 : 38);
        return (
          <div key={g.id} className={cn("wt:grid wt:h-10 wt:grid-cols-[82px_1fr_64px] wt:items-center wt:gap-2", g.days < MIN_SAMPLE && "wt:opacity-50")}>
            <span className="wt:flex wt:items-center wt:gap-[3px] wt:text-[12.5px]">
              <Dot color={FOOD_COLOR} filled={g.id === "both" || g.id === "eat"} />
              <Dot color={MOVE_COLOR} filled={g.id === "both" || g.id === "move"} />
              <span className="wt:ml-1">{g.name}</span>
            </span>
            <span className="wt:relative wt:h-3">
              <i className="wt:bg-line-1 wt:absolute wt:-top-2 wt:-bottom-2 wt:left-[62%] wt:w-px" />
              {g.mean != null && (
                <i
                  className="wt:absolute wt:top-0 wt:h-3"
                  style={{
                    width: `${w}%`,
                    background: v < 0 ? LOSE_COLOR : GAIN_COLOR,
                    ...(v < 0 ? { right: "38%", borderRadius: "4px 0 0 4px" } : { left: "62%", borderRadius: "0 4px 4px 0" }),
                  }}
                />
              )}
            </span>
            <span className="wt:text-right wt:text-[13px] wt:font-semibold wt:tabular-nums" style={{ color: g.mean == null ? undefined : v < 0 ? LOSE_COLOR : GAIN_COLOR }}>
              {g.mean == null ? "—" : signed(g.mean, 2)}
              <small className="wt:text-ink-3 wt:block wt:text-[10.5px] wt:font-normal">{g.days} 天</small>
            </span>
          </div>
        );
      })}
      <p className="wt:text-ink-2 wt:pt-1 wt:text-[12.5px] wt:leading-[1.7]">
        次日晨重减当日晨重的平均值。
        {groups.some(enough) ? `${parts.join("，") || "目前各组差别不大"}。` : "坚持记录两三周，就能看出少吃和多动各自的效果。"}
      </p>
    </MCard>
  );
}

function AICard({ input, stamp }: { input: AnalysisInput; stamp: string }) {
  const { ai, context } = useRuntime();
  const [scope, setScope] = useState<AIScope>("today");
  const [results, setResults] = useState<Partial<Record<AIScope, { text: string; stamp: string; done: boolean }>>>({});
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    const target = scope;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setError(null);
    setResults(r => ({ ...r, [target]: { text: "", stamp, done: false } }));
    try {
      let text = "";
      for await (const delta of ai.analyze(target, latest.current, current.signal)) {
        if (current.signal.aborted || context.signal.aborted) return;
        text += delta;
        setResults(r => ({ ...r, [target]: { text, stamp, done: false } }));
      }
      setResults(r => ({ ...r, [target]: { text, stamp, done: true } }));
    } catch (err) {
      if (current.signal.aborted) return;
      setResults(r => {
        const next = { ...r };
        delete next[target];
        return next;
      });
      const message = aiErrorMessage(err);
      if (message) setError({ message, setup: needsSetup(err) });
    }
  };
  const result = results[scope];
  const stale = result?.done && result.stamp !== stamp;
  return (
    <MCard>
      <div className="wt:mb-2 wt:flex wt:items-center wt:gap-1.5">
        <Sparkles className="wt:text-accent wt:size-[15px]" />
        <h2 className="wt:text-[13.5px] wt:font-[650]">AI 分析</h2>
        <span className="wt:flex-1" />
        <Pills<AIScope>
          value={scope}
          onChange={setScope}
          options={[
            ["today", "今天"],
            ["week", "本周"],
          ]}
        />
      </div>
      {result ? (
        <div className="wt:text-[13.5px] wt:leading-[1.75]">
          <Rendered text={result.text} streaming={!result.done} />
          {stale && (
            <div className="wt:text-ink-3 wt:mt-2.5 wt:flex wt:items-center wt:gap-1.5 wt:text-[12px]">
              记录有变化，结果可能过时
              <span className="wt:flex-1" />
              <PrimaryButton small ghost onClick={() => void run()}>
                <RefreshCw />
                重新分析
              </PrimaryButton>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="wt:text-ink-3 wt:text-[13px] wt:leading-[1.7]">
            {error
              ? error.message
              : scope === "today"
                ? "看看晚饭还能吃多少、运动还差多少。点了才分析，不会自动消耗额度。"
                : "总结最近两周的趋势，找出容易破功的规律。"}
          </p>
          <PrimaryButton
            className="wt:mt-3 wt:h-11 wt:text-[14.5px]"
            onClick={() => (error?.setup ? void context.ai.openSettings() : void run())}
          >
            {error?.setup ? (
              "去配置模型"
            ) : (
              <>
                <Sparkles />
                {error ? "重试" : scope === "today" ? "分析今天" : "分析本周"}
              </>
            )}
          </PrimaryButton>
        </>
      )}
    </MCard>
  );
}
