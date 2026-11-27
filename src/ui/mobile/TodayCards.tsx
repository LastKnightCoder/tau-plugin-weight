/**
 * 主页上的今天：主卡（余额环 + 算式 + 晨重 / 睡前 / 运动三格）、趋势迷你卡、今天流水。
 * 流水左滑露出「改 / 删除」，点按打开编辑面板；估算中的行显示占位，失败的行给「填热量」。
 */
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useI18n } from "@tau/plugins";
import { ChevronRight, ChevronUp, Footprints, Pencil, Plus, Sparkles, Sunrise, Sunset, Trash2 } from "lucide-react";
import { cn } from "@tau/ui";
import type { Entry, WeighSlot } from "../../data/model";
import type { DaySummary, GroupStat, Overview } from "../../data/stats";
import { messages } from "../../i18n";
import { MOVE_COLOR, dayLabel, kg, signed } from "../bits";
import type { Translate } from "../../i18n";
import { isMorning } from "../weighing";
import { KindIcon, MCard, Ring } from "./parts";

export function HeroCard({
  o,
  hasProfile,
  moveGoal,
  onWeigh,
  onSetup,
}: {
  o: Overview;
  hasProfile: boolean;
  moveGoal: number;
  onWeigh(slot: WeighSlot): void;
  onSetup(): void;
}) {
  const { t } = useI18n(messages);
  const day = o.today;
  const delta = day.am != null && o.yesterday?.am != null ? day.am - o.yesterday.am : null;
  const total = day.budget + day.burn;
  const over = day.budget > 0 && day.remaining < 0;
  const morning = isMorning(new Date());
  return (
    <MCard>
      <div className="wt:flex wt:items-center wt:gap-3.5">
        {day.budget > 0 ? (
          <Ring eaten={day.intake} total={total}>
            <b className="wt:text-[22px] wt:leading-none wt:font-bold wt:tracking-[-0.02em] wt:tabular-nums">
              {over ? `−${-day.remaining}` : day.remaining}
            </b>
            <small className="wt:text-ink-3 wt:mt-1 wt:text-[10.5px]">{over ? t("tc.ringOver") : t("wc.left")}</small>
          </Ring>
        ) : (
          <Ring eaten={0} total={0}>
            <b className="wt:text-ink-3 wt:text-[13px]">?</b>
          </Ring>
        )}
        <div className="wt:min-w-0 wt:flex-1">
          <div className="wt:text-ink-3 wt:text-[12px]">{t("wc.budgetTitle")} · {dayLabel(t, day.date)}</div>
          {day.budget > 0 ? (
            <>
              <div className={cn("wt:my-0.5 wt:text-[30px] wt:font-bold wt:tracking-[-0.03em] wt:tabular-nums", over && "wt:text-danger")}>
                {Math.abs(day.remaining)}
                <small className="wt:text-ink-3 wt:ml-1 wt:text-[13px] wt:font-medium wt:tracking-normal">
                  {over ? t("tc.kcalOver") : "kcal"}
                </small>
              </div>
              <div className="wt:text-ink-2 wt:text-[11.5px] wt:leading-[1.6]">
                {t("tc.budgetLabel")} <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{day.budget}</b>
                {day.burn > 0 && (
                  <>
                    {" "}+ {t("dl.move")} <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{day.burn}</b>
                  </>
                )}{" "}
                − {t("tc.formulaEaten")} <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{day.intake}</b>
                {day.unsettled > 0 && <span className="wt:text-ink-3">{t("tc.unsettled", { count: day.unsettled })}</span>}
              </div>
            </>
          ) : (
            <>
              <div className="wt:my-1 wt:text-[14.5px] wt:font-semibold">{hasProfile ? t("tc.noBudgetProfile") : t("tc.noBudgetData")}</div>
              <div className="wt:text-ink-2 wt:text-[11.5px]">{t("tc.noBudgetHint")}</div>
              {!hasProfile && (
                <button
                  type="button"
                  onClick={onSetup}
                  className="wt:bg-accent wt:text-ink-inverse wt:mt-2 wt:h-8 wt:rounded-[10px] wt:px-3 wt:text-[13px] wt:font-semibold"
                >
                  {t("tc.goFill")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="wt:mt-3 wt:grid wt:grid-cols-3 wt:gap-2">
        <Tile
          icon={<Sunrise />}
          label={t("wt.legend.am")}
          empty={day.am == null}
          emptyText={t("tc.wakeEmpty")}
          onClick={() => onWeigh("am")}
        >
          {kg(day.am)}
          {delta != null && (
            <small className={cn("wt:ml-1 wt:text-[11px] wt:font-medium", delta <= 0 ? "wt:text-info" : "wt:text-danger")}>
              {signed(delta)}
            </small>
          )}
        </Tile>
        <Tile
          icon={<Sunset />}
          label={t("slot.pm")}
          empty={day.pm == null}
          muted={day.pm == null && morning}
          emptyText={morning ? t("tc.pmEmptyMorning") : t("tc.pmEmpty")}
          onClick={() => onWeigh("pm")}
        >
          {kg(day.pm)}
        </Tile>
        <div className="wt:bg-hover wt:flex wt:min-h-[62px] wt:flex-col wt:gap-0.5 wt:rounded-[13px] wt:px-2.5 wt:pt-[9px] wt:pb-2">
          <span className="wt:text-ink-3 wt:flex wt:items-center wt:gap-1 wt:text-[11px] wt:[&>svg]:size-3">
            <Footprints />
            {t("dl.move")}
          </span>
          <span className="wt:text-[18px] wt:font-[650] wt:tracking-[-0.02em] wt:tabular-nums">
            {day.moveMinutes}
            <small className="wt:text-ink-3 wt:ml-1 wt:text-[11px] wt:font-medium wt:tracking-normal">{t("tc.moveUnitShort", { goal: moveGoal })}</small>
          </span>
          <span className="wt:bg-track wt:mt-1 wt:h-1 wt:overflow-hidden wt:rounded-full">
            <i className="wt:block wt:h-full wt:rounded-full" style={{ width: `${Math.min(100, (day.moveMinutes / moveGoal) * 100)}%`, background: MOVE_COLOR }} />
          </span>
        </div>
      </div>
    </MCard>
  );
}

function Tile({
  icon,
  label,
  empty,
  emptyText,
  muted,
  onClick,
  children,
}: {
  icon: ReactNode;
  label: string;
  empty: boolean;
  emptyText: string;
  muted?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  const { t } = useI18n(messages);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={empty ? t("tc.tileAriaEmpty", { label, empty: emptyText }) : t("tc.tileAriaEdit", { label })}
      className={cn(
        "wt:flex wt:min-h-[62px] wt:flex-col wt:gap-0.5 wt:rounded-[13px] wt:px-2.5 wt:pt-[9px] wt:pb-2 wt:text-left wt:active:scale-[0.97] wt:transition-transform",
        !empty
          ? "wt:bg-hover"
          : muted
            ? "wt:text-ink-3 wt:shadow-[inset_0_0_0_1.5px_var(--tau-line-1)]"
            : "wt:text-accent-text wt:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
      )}
    >
      <span className={cn("wt:flex wt:items-center wt:gap-1 wt:text-[11px] wt:[&>svg]:size-3", !empty && "wt:text-ink-3")}>
        {icon}
        {label}
      </span>
      {empty ? (
        <span className="wt:flex wt:items-center wt:gap-0.5 wt:text-[14px] wt:font-semibold">
          {!muted && <Plus className="wt:size-3.5" />}
          {emptyText}
        </span>
      ) : (
        <span className="wt:flex wt:items-baseline wt:text-[18px] wt:font-[650] wt:tracking-[-0.02em] wt:tabular-nums">{children}</span>
      )}
    </button>
  );
}

/** 趋势迷你卡：30 天均值变化 + 一句结论 + 折线，点按进「趋势与效果」 */
export function TrendMini({
  days,
  o,
  groups,
  onOpen,
}: {
  days: readonly DaySummary[];
  o: Overview;
  groups: GroupStat[];
  onOpen(): void;
}) {
  const { t } = useI18n(messages);
  const values = days.map(d => d.avg).filter((v): v is number => v != null);
  const change = values.length >= 2 ? values[values.length - 1] - values[0] : null;
  return (
    <MCard onClick={onOpen} className="wt:flex wt:items-center wt:gap-3 wt:py-3">
      <div className="wt:min-w-0 wt:flex-1">
        <div className="wt:text-ink-3 wt:text-[12px]">{t("tc.trendAvgLabel")}</div>
        <div className="wt:text-[20px] wt:font-bold wt:tracking-[-0.02em] wt:tabular-nums">
          {kg(o.latestAvg)}{" "}
          {change != null && (
            <small className={cn("wt:text-[12.5px] wt:font-semibold", change <= 0 ? "wt:text-info" : "wt:text-danger")}>
              {signed(change)} kg
            </small>
          )}
        </div>
        <div className="wt:text-ink-2 wt:mt-0.5 wt:truncate wt:text-[11.5px]">
          {[o.toGoal != null ? t("tc.toGoalKg", { kg: Math.max(0, o.toGoal).toFixed(1) }) : null, miniConclusion(t, groups)].filter(Boolean).join(" · ")}
        </div>
      </div>
      <Spark values={values} />
      <ChevronRight className="wt:text-ink-3 wt:size-[18px] wt:shrink-0" />
    </MCard>
  );
}

function miniConclusion(t: Translate, groups: GroupStat[]) {
  const [, eat, move] = groups;
  const enough = (g: GroupStat) => g.days >= 5 && g.mean != null;
  if (enough(eat) && enough(move)) return eat.mean! < move.mean! ? t("tc.miniEatWins") : t("tc.miniMoveWins");
  if (enough(eat)) return t("ig.conclusion.eatMain");
  if (enough(move)) return t("ig.conclusion.moveMain");
  return t("tc.miniKeep");
}

function Spark({ values, width = 104, height = 44 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span style={{ width }} />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map(
    (v, i) => [(i / (values.length - 1)) * (width - 4) + 2, ((hi - v) / (hi - lo || 1)) * (height - 6) + 3] as const
  );
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden className="wt:shrink-0">
      <polyline
        points={pts.map(p => p.join(",")).join(" ")}
        fill="none"
        stroke="var(--tau-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r={3} fill="var(--tau-accent)" />
    </svg>
  );
}

const COLLAPSED = 3;

export function TodayList({
  entries,
  remaining,
  moveMinutes,
  moveGoal,
  time,
  highlight,
  onEdit,
  onDelete,
  onFill,
}: {
  entries: readonly Entry[];
  remaining: number | null;
  moveMinutes: number;
  moveGoal: number;
  time: string;
  /** 刚记下或刚估算完的条目 */
  highlight: ReadonlySet<string>;
  onEdit(entry: Entry): void;
  onDelete(entry: Entry): void;
  onFill(text: string): void;
}) {
  const { t } = useI18n(messages);
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const foods = entries.filter(e => e.kind === "food").length;
  const moves = entries.length - foods;
  const hasDinner = entries.some(e => e.kind === "food" && e.time >= "16:30");
  const hidden = expanded ? 0 : Math.max(0, entries.length - COLLAPSED);
  const shown = entries.slice(hidden);
  return (
    <MCard className="wt:pb-1.5">
      <div className="wt:mb-1 wt:flex wt:items-center wt:gap-1.5">
        <h2 className="wt:text-[13.5px] wt:font-[650]">{t("date.today")}</h2>
        <small className="wt:text-ink-3 wt:text-[11.5px]">
          {t("dl.foodCount", { count: foods })} · {t("dl.moveCount", { count: moves })}
        </small>
        <span className="wt:flex-1" />
        {entries.length > COLLAPSED && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="wt:text-ink-3 wt:-mr-1 wt:flex wt:h-7 wt:items-center wt:gap-0.5 wt:px-1 wt:text-[12px] wt:font-medium"
          >
            {expanded ? t("tc.collapse") : t("tc.showOlder", { count: hidden })}
            <ChevronUp className={cn("wt:size-[13px] wt:transition-transform", expanded && "wt:rotate-180")} />
          </button>
        )}
      </div>
      <div className="wt:divide-y wt:divide-line-2">
        {shown.map(entry => (
          <SwipeRow
            key={entry.id}
            open={opened === entry.id}
            onOpen={next => setOpened(next ? entry.id : null)}
            onEdit={() => onEdit(entry)}
            onDelete={() => onDelete(entry)}
          >
            <Row entry={entry} highlighted={highlight.has(entry.id)} onClick={() => (opened ? setOpened(null) : onEdit(entry))} />
          </SwipeRow>
        ))}
        {!hasDinner && time < "21:30" && (
          <Placeholder
            kind="food"
            onClick={() => onFill("晚饭 ")}
            text={
              <>
                <b className="wt:text-ink-2 wt:font-semibold">{t("dl.dinnerLabel")}</b> {t("dl.notLogged")}
                {remaining != null &&
                  (remaining > 0 ? t("tc.dinnerSuggest", { kcal: Math.max(0, remaining - 100) }) : t("tc.dinnerDone"))}
              </>
            }
          />
        )}
        {moveMinutes < moveGoal && (
          <Placeholder
            kind="move"
            onClick={() => onFill(`散步 ${moveGoal - moveMinutes} 分钟`)}
            text={
              <>
                <b className="wt:text-ink-2 wt:font-semibold">{t("dl.move")}</b> {t("dl.moveGap", { minutes: moveGoal - moveMinutes })}
              </>
            }
          />
        )}
        {entries.length === 0 && (
          <p className="wt:text-ink-3 wt:py-5 wt:text-center wt:text-[12.5px] wt:leading-[1.7]">
            {t("tc.emptyHint1")}
            <br />
            {t("tc.emptyHint2")}
          </p>
        )}
      </div>
    </MCard>
  );
}

function Row({ entry, highlighted, onClick }: { entry: Entry; highlighted: boolean; onClick(): void }) {
  const { t } = useI18n(messages);
  const note =
    entry.estimate === "pending" ? (
      <span className="wt:text-accent-text wt:inline-flex wt:items-center wt:gap-0.5">
        <Sparkles className="wt:size-2.5" />
        {entry.time} · {t("ql.estimating")}
      </span>
    ) : entry.estimate === "failed" ? (
      <span className="wt:text-danger">
        {entry.time} · {t("tc.estimateFailed")}
      </span>
    ) : (
      <>
        {entry.time}
        {entry.kind === "move" && (
          <span>
            {" · "}
            {t("wt.minutes", { count: entry.minutes })}
          </span>
        )}
      </>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "wt:bg-surface wt:flex wt:h-[50px] wt:w-full wt:items-center wt:gap-2.5 wt:text-left wt:transition-colors wt:duration-700",
        highlighted && "wt:bg-press"
      )}
    >
      <KindIcon kind={entry.kind} />
      <span className="wt:min-w-0 wt:flex-1">
        <span className="wt:block wt:truncate wt:text-[14px]">{entry.text}</span>
        <small className="wt:text-ink-3 wt:block wt:text-[11px]">{note}</small>
      </span>
      {entry.estimate === "pending" ? (
        <span className="wt:bg-track wt:h-3 wt:w-[38px] wt:animate-pulse wt:rounded-full" aria-label={t("ql.estimating")} />
      ) : entry.estimate === "failed" ? (
        <span className="wt:bg-accent-soft wt:text-accent-text wt:flex wt:h-7 wt:items-center wt:rounded-full wt:px-[11px] wt:text-[12.5px] wt:font-[650]">
          {t("dl.fillKcal")}
        </span>
      ) : (
        <span className={cn("wt:text-[14px] wt:font-semibold wt:tabular-nums", entry.kind === "move" && "wt:text-info")}>
          {entry.kind === "move" ? `+${entry.kcal}` : entry.kcal}
        </span>
      )}
    </button>
  );
}

function Placeholder({ kind, text, onClick }: { kind: Entry["kind"]; text: ReactNode; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className="wt:flex wt:h-[50px] wt:w-full wt:items-center wt:gap-2.5 wt:text-left wt:active:bg-press">
      <KindIcon kind={kind} ghost />
      <span className="wt:text-ink-3 wt:min-w-0 wt:flex-1 wt:truncate wt:text-[13px]">{text}</span>
      <Plus className="wt:text-ink-3 wt:size-4" />
    </button>
  );
}

const ACTIONS = 128;

/** 左滑露出「改 / 删除」；滑过一半松手直接删除。竖向滑动交给页面滚动 */
function SwipeRow({
  open,
  onOpen,
  onEdit,
  onDelete,
  children,
}: {
  open: boolean;
  onOpen(open: boolean): void;
  onEdit(): void;
  onDelete(): void;
  children: ReactNode;
}) {
  const { t } = useI18n(messages);
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; locked?: "x" | "y" } | null>(null);
  const width = useRef(0);
  const offset = dx ?? (open ? -ACTIONS : 0);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    width.current = e.currentTarget.offsetWidth;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -ACTIONS : 0 };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.locked = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (s.locked === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (s.locked !== "x") return;
    setDx(Math.min(0, Math.max(-width.current, s.base + mx)));
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.locked !== "x" || dx == null) return setDx(null);
    const final = dx;
    setDx(null);
    if (final < -width.current / 2) {
      onOpen(false);
      onDelete();
    } else onOpen(final < -ACTIONS / 2);
  };
  return (
    <div className="wt:relative wt:overflow-hidden" data-no-tab-swipe data-no-edge-back>
      <div className="wt:absolute wt:inset-y-0 wt:right-0 wt:flex" aria-hidden={!open}>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            onOpen(false);
            onEdit();
          }}
          className="wt:bg-ink-3 wt:grid wt:w-16 wt:place-content-center wt:justify-items-center wt:gap-0.5 wt:text-[11px] wt:text-white"
        >
          <Pencil className="wt:size-[17px]" />
          {t("hero.swipeEdit")}
        </button>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            onOpen(false);
            onDelete();
          }}
          className="wt:bg-danger wt:grid wt:w-16 wt:place-content-center wt:justify-items-center wt:gap-0.5 wt:text-[11px] wt:text-white"
          style={offset < -ACTIONS ? { width: -offset - 64 } : undefined}
        >
          <Trash2 className="wt:size-[17px]" />
          {t("common.delete")}
        </button>
      </div>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cn("wt:relative wt:touch-pan-y", dx == null && "wt:transition-transform wt:duration-200 wt:ease-tau-out")}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
