/**
 * 页顶三张卡：今天晨重（起床 / 睡前两个记录位）、今天还能吃（余额环）、今天运动（进度 + 连续天数）。
 */
import { Footprints, Sunrise, Sunset, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@tau/plugins";
import { Button, cn } from "@tau/ui";
import type { WeighSlot } from "../data/model";
import type { Overview } from "../data/stats";
import { messages } from "../i18n";
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
  const { t } = useI18n(messages);
  const today = o.today;
  const delta = today.am != null && o.yesterday?.am != null ? today.am - o.yesterday.am : null;
  const lost = o.startKg != null && o.latestAvg != null ? o.startKg - o.latestAvg : null;
  return (
    <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
      <Label icon={<Sunrise className="wt:size-[13px]" />}>{t("wc.morningTitle", { day: dayLabel(t, today.date) })}</Label>
      <div className="wt:flex wt:items-baseline wt:gap-1.5">
        <b className="wt:text-[40px] wt:leading-none wt:font-semibold wt:tracking-[-0.03em] wt:tabular-nums">{kg(today.am)}</b>
        <span className="wt:text-ink-3 wt:text-[13px]">kg</span>
        {delta != null && <Delta value={delta} className="wt:ml-1.5 wt:text-[13px]" />}
      </div>
      <div className="wt:text-ink-2 wt:flex wt:flex-wrap wt:gap-x-4 wt:text-[12px]">
        <span>{t("wt.legend.avg")} <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{kg(o.latestAvg)}</b></span>
        {lost != null && <span>{t("wc.lost")} <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{lost.toFixed(1)}</b></span>}
        {o.toGoal != null && <span>{t("wc.toGoal")} <b className="wt:text-ink-1 wt:font-semibold wt:tabular-nums">{Math.max(0, o.toGoal).toFixed(1)}</b></span>}
      </div>
      <div className="wt:mt-auto wt:grid wt:grid-cols-2 wt:gap-2">
        <Slot icon={<Sunrise />} label={t("slot.am")} value={today.am} onClick={() => onWeigh("am")} />
        <Slot icon={<Sunset />} label={t("slot.pm")} value={today.pm} onClick={() => onWeigh("pm")} />
      </div>
    </Card>
  );
}

function Slot({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: number | null; onClick(): void }) {
  const { t } = useI18n(messages);
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
      <span className="wt:flex wt:min-w-0 wt:flex-col wt:overflow-hidden wt:leading-[1.35]">
        <span className="wt:text-ink-3 wt:truncate wt:text-[11px]">{label}</span>
        {empty ? (
          <span className="wt:whitespace-nowrap wt:text-[12.5px] wt:font-medium">{t("wc.logIt")}</span>
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
  const { t } = useI18n(messages);
  const today = o.today;
  if (!hasProfile)
    return (
      <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
        <Label icon={<UtensilsCrossed className="wt:size-[13px]" />}>{t("wc.budgetTitle")}</Label>
        <p className="wt:text-ink-2 wt:text-[12.5px] wt:leading-[1.7]">
          {t("wc.noProfileHint")}
        </p>
        <p className="wt:text-ink-3 wt:text-[12px]">{t("wc.eatenToday", { intake: today.intake })}</p>
        <Button variant="soft" className="wt:mt-auto wt:self-start" onClick={onSetup}>
          {t("wc.fillProfile")}
        </Button>
      </Card>
    );
  if (today.budget === 0)
    return (
      <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
        <Label icon={<UtensilsCrossed className="wt:size-[13px]" />}>{t("wc.budgetTitle")}</Label>
        <p className="wt:text-ink-2 wt:text-[12.5px] wt:leading-[1.7]">{t("wc.noWeightHint")}</p>
        <p className="wt:text-ink-3 wt:text-[12px]">{t("wc.eatenToday", { intake: today.intake })}</p>
      </Card>
    );
  const over = today.remaining < 0;
  return (
    <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
      <Label icon={<UtensilsCrossed className="wt:size-[13px]" />}>{t("wc.budgetTitle")}</Label>
      <div className="wt:grid wt:grid-cols-[112px_minmax(0,1fr)] wt:items-center wt:gap-4">
        <Ring used={today.intake - today.burn} budget={today.budget} over={over}>
          <b className={cn("wt:text-[25px] wt:font-semibold wt:tracking-[-0.02em] wt:tabular-nums", over && "wt:text-danger")}>
            {over ? "−" : ""}
            {Math.abs(today.remaining)}
          </b>
          <span className="wt:text-ink-3 wt:text-[11px]">{over ? t("wc.overUnit") : "kcal"}</span>
        </Ring>
        <div className="wt:flex wt:flex-col wt:gap-[5px] wt:text-[12px]">
          <Line label={t("wc.eaten")} value={String(today.intake)} />
          <Line label={t("wt.burnWord")} value={today.burn ? `−${today.burn}` : "0"} tone={today.burn ? "ok" : undefined} />
          <Line label={t("dl.budget")} value={String(today.budget)} muted />
          <Button size="sm" variant="secondary" className="wt:mt-1.5" onClick={onFocusLog}>
            {t("common.logBtn")}
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
  const { t } = useI18n(messages);
  const today = o.today;
  return (
    <Card className="wt:flex wt:flex-col wt:gap-2.5 wt:px-[18px] wt:py-4">
      <Label icon={<Footprints className="wt:size-[13px]" />}>{t("wc.moveTitle")}</Label>
      <div className="wt:flex wt:items-baseline wt:gap-1.5">
        <b className="wt:text-[40px] wt:leading-none wt:font-semibold wt:tracking-[-0.03em] wt:tabular-nums">{today.moveMinutes}</b>
        <span className="wt:text-ink-3 wt:text-[13px]">{t("wc.moveUnit", { goal: moveGoal })}</span>
      </div>
      <div className="wt:bg-track wt:h-2.5 wt:overflow-hidden wt:rounded-full">
        <div
          className="wt:h-full wt:rounded-full wt:transition-[width] wt:duration-500 wt:ease-tau-out"
          style={{ width: `${Math.min(100, (today.moveMinutes / moveGoal) * 100)}%`, background: MOVE_COLOR }}
        />
      </div>
      <div className="wt:mt-auto wt:grid wt:grid-cols-2 wt:gap-2">
        <Stat color={FOOD_COLOR} label={t("wc.eatStreak")} value={o.eatStreak} unit={t("wc.dayUnit")} />
        <Stat color={MOVE_COLOR} label={t("wc.weekMove")} value={o.weekMoveDays} unit={t("wc.weekUnit")} />
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
