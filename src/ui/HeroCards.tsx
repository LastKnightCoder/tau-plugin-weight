/**
 * 页顶三张卡：今天晨重（起床 / 睡前两个记录位）、今天还能吃（余额环）、今天运动（进度 + 连续天数）。
 */
import { Footprints, Sunrise, Sunset, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import { Button, cn } from "@tau/ui";
import type { WeighSlot } from "../data/model";
import type { Overview } from "../data/stats";
import { Card, Delta, FOOD_COLOR, MOVE_COLOR, dayLabel, kg } from "./bits";

function Label({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="wt:text-ink-3 wt:flex wt:items-center wt:gap-1.5 wt:text-[12px]">{icon}{children}</span>;
}

export function WeightCard({
  o,
  onWeigh,
}: {
  o: Overview;
  onWeigh(slot: WeighSlot): void;
}) {
  const t = o.today;
  const delta = t.am != null && o.yesterday?.am != null ? t.am - o.yesterday.am : null;
  const lost = o.startKg != null && o.latestAvg != null ? o.startKg - o.latestAvg : null;
  return (
    <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
      <Label icon={<Sunrise className="wt:size-[13px]" />}>今天晨重 · {dayLabel(t.date)}</Label>
      <div className="wt:flex wt:items-baseline wt:gap-1.5">
        <b className="wt:text-[40px] wt:leading-none wt:font-semibold wt:tracking-[-0.03em] wt:tabular-nums">{kg(t.am)}</b>
        <span className="wt:text-ink-3 wt:text-[13px]">kg</span>
        {delta != null && <Delta value={delta} className="wt:ml-1.5 wt:text-[13px]" />}
      </div>
      <div className="wt:text-ink-2 wt:flex wt:flex-wrap wt:gap-x-4 wt:text-[12px]">
        <span>7 日均值 <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{kg(o.latestAvg)}</b></span>
        {lost != null && <span>已减 <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{lost.toFixed(1)}</b></span>}
        {o.toGoal != null && <span>距目标 <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{Math.max(0, o.toGoal).toFixed(1)}</b></span>}
      </div>
      <div className="wt:mt-auto wt:grid wt:grid-cols-2 wt:gap-2">
        <Slot icon={<Sunrise />} label="起床" value={t.am} onClick={() => onWeigh("am")} />
        <Slot icon={<Sunset />} label="睡前" value={t.pm} onClick={() => onWeigh("pm")} />
      </div>
    </Card>
  );
}

function Slot({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: number | null; onClick(): void }) {
  const empty = value == null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "wt:flex wt:items-center wt:gap-2 wt:rounded-[11px] wt:px-2.5 wt:py-2 wt:text-left wt:transition-[background] wt:duration-150 wt:outline-none wt:focus-visible:shadow-[var(--tau-focus-ring)] wt:[&>svg]:size-[15px]",
        empty
          ? "wt:text-accent-text wt:shadow-[inset_0_0_0_1.5px_var(--tau-accent)] wt:hover:bg-accent-soft"
          : "wt:bg-hover wt:hover:bg-press wt:[&>svg]:text-ink-3"
      )}
    >
      {icon}
      <span className="wt:flex wt:flex-col wt:leading-[1.35]">
        <span className="wt:text-ink-3 wt:text-[11px]">{label}</span>
        {empty ? (
          <span className="wt:text-[12.5px] wt:font-medium">＋ 记一下</span>
        ) : (
          <b className="wt:text-ink-1 wt:text-[14px] wt:font-semibold wt:tabular-nums">{kg(value)}</b>
        )}
      </span>
    </button>
  );
}

export function BudgetCard({
  o,
  hasProfile,
  onFocusLog,
  onSetup,
}: {
  o: Overview;
  hasProfile: boolean;
  onFocusLog(): void;
  onSetup(): void;
}) {
  const t = o.today;
  if (!hasProfile)
    return (
      <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
        <Label icon={<UtensilsCrossed className="wt:size-[13px]" />}>今天还能吃</Label>
        <p className="wt:text-ink-2 wt:text-[12.5px] wt:leading-[1.7]">
          填写身高、出生年份和性别，按你的体重算出每天的热量预算，体重下降后自动下调。
        </p>
        <p className="wt:text-ink-3 wt:text-[12px]">今天已吃 {t.intake} kcal</p>
        <Button variant="soft" className="wt:mt-auto wt:self-start" onClick={onSetup}>
          填写身体数据
        </Button>
      </Card>
    );
  if (t.budget === 0)
    return (
      <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
        <Label icon={<UtensilsCrossed className="wt:size-[13px]" />}>今天还能吃</Label>
        <p className="wt:text-ink-2 wt:text-[12.5px] wt:leading-[1.7]">预算按体重计算，先称一次体重。</p>
        <p className="wt:text-ink-3 wt:text-[12px]">今天已吃 {t.intake} kcal</p>
      </Card>
    );
  const over = t.remaining < 0;
  return (
    <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
      <Label icon={<UtensilsCrossed className="wt:size-[13px]" />}>今天还能吃</Label>
      <div className="wt:grid wt:grid-cols-[112px_minmax(0,1fr)] wt:items-center wt:gap-4">
        <Ring used={t.intake - t.burn} budget={t.budget} over={over}>
          <b className={cn("wt:text-[25px] wt:font-semibold wt:tracking-[-0.02em] wt:tabular-nums", over && "wt:text-danger")}>
            {over ? "−" : ""}
            {Math.abs(t.remaining)}
          </b>
          <span className="wt:text-ink-3 wt:text-[11px]">{over ? "已超 kcal" : "kcal"}</span>
        </Ring>
        <div className="wt:flex wt:flex-col wt:gap-[5px] wt:text-[12px]">
          <Line label="已吃" value={String(t.intake)} />
          <Line label="运动消耗" value={t.burn ? `−${t.burn}` : "0"} tone={t.burn ? "ok" : undefined} />
          <Line label="预算" value={String(t.budget)} muted />
          <Button size="sm" variant="secondary" className="wt:mt-1.5" onClick={onFocusLog}>
            记一笔
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Line({ label, value, tone, muted }: { label: string; value: string; tone?: "ok"; muted?: boolean }) {
  return (
    <div className={cn("wt:flex wt:items-center wt:gap-2", muted ? "wt:text-ink-3" : "wt:text-ink-2")}>
      {label}
      <b className={cn("wt:ml-auto wt:tabular-nums", muted ? "wt:font-normal" : "wt:text-ink-1 wt:font-semibold", tone === "ok" && "wt:text-ok")}>
        {value}
      </b>
    </div>
  );
}

function Ring({ used, budget, over, children }: { used: number; budget: number; over: boolean; children: ReactNode }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  const ratio = budget > 0 ? Math.min(1, Math.max(0, used / budget)) : 0;
  return (
    <div className="wt:relative wt:size-[112px]">
      <svg width={112} height={112} className="wt:-rotate-90" aria-hidden>
        <circle cx={56} cy={56} r={r} fill="none" stroke="var(--tau-bg-track)" strokeWidth={10} />
        {ratio > 0 && (
          <circle
            cx={56}
            cy={56}
            r={r}
            fill="none"
            stroke={over ? "var(--tau-danger)" : FOOD_COLOR}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${c * ratio} ${c}`}
            className="wt:transition-[stroke-dasharray] wt:duration-500 wt:ease-tau-out"
          />
        )}
      </svg>
      <div className="wt:absolute wt:inset-0 wt:flex wt:flex-col wt:items-center wt:justify-center wt:leading-[1.2]">{children}</div>
    </div>
  );
}

export function MoveCard({ o, moveGoal }: { o: Overview; moveGoal: number }) {
  const t = o.today;
  return (
    <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
      <Label icon={<Footprints className="wt:size-[13px]" />}>今天运动</Label>
      <div className="wt:flex wt:items-baseline wt:gap-1.5">
        <b className="wt:text-[40px] wt:leading-none wt:font-semibold wt:tracking-[-0.03em] wt:tabular-nums">{t.moveMinutes}</b>
        <span className="wt:text-ink-3 wt:text-[13px]">/ {moveGoal} 分钟</span>
      </div>
      <div className="wt:bg-track wt:h-2.5 wt:overflow-hidden wt:rounded-full">
        <div
          className="wt:h-full wt:rounded-full wt:transition-[width] wt:duration-500 wt:ease-tau-out"
          style={{ width: `${Math.min(100, (t.moveMinutes / moveGoal) * 100)}%`, background: MOVE_COLOR }}
        />
      </div>
      <div className="wt:mt-auto wt:grid wt:grid-cols-2 wt:gap-2">
        <Stat color={FOOD_COLOR} label="少吃连续" value={o.eatStreak} unit="天" />
        <Stat color={MOVE_COLOR} label="本周多动" value={o.weekMoveDays} unit="/ 7 天" />
      </div>
    </Card>
  );
}

function Stat({ color, label, value, unit }: { color: string; label: string; value: number; unit: string }) {
  return (
    <div className="wt:bg-hover wt:flex wt:flex-col wt:rounded-[11px] wt:px-2.5 wt:py-2 wt:leading-[1.35]">
      <span className="wt:text-ink-3 wt:flex wt:items-center wt:gap-1.5 wt:text-[11px]">
        <i className="wt:size-[7px] wt:rounded-full" style={{ background: color }} />
        {label}
      </span>
      <b className="wt:text-[15px] wt:font-semibold wt:tabular-nums">
        {value}
        <small className="wt:text-ink-3 wt:ml-0.5 wt:text-[11px] wt:font-normal">{unit}</small>
      </b>
    </div>
  );
}
