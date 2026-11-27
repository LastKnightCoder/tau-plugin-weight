/**
 * 打卡格（最近 8 周，周一开头，每天两颗点 = 少吃 / 多动，点格选择当天）与「做到了，第二天轻多少」四组对比。
 */
import { useI18n } from "@tau/plugins";
import { Tooltip, cn } from "@tau/ui";
import { addDays } from "../data/model";
import { compareGroups, type DaySummary, type GroupStat, type Ledger } from "../data/stats";
import { messages, type Translate } from "../i18n";

const GROUP_KEYS = { both: "ig.groupBoth", eat: "ig.groupEat", move: "ig.groupMove", none: "ig.groupNone" } as const;
import { Card, CardHead, Delta, Dot, FOOD_COLOR, GAIN_COLOR, LOSE_COLOR, MOVE_COLOR, WEEKDAYS, dayLabel, shortDate } from "./bits";

const WEEKS = 8;
const MIN_SAMPLE = 5;

export function HabitGrid({ ledger, today, selectedDate, budgetKnown, moveGoal, onSelectDate }: {
  ledger: Ledger;
  today: string;
  selectedDate: string;
  budgetKnown: boolean;
  moveGoal: number;
  onSelectDate(date: string): void;
}) {
  const { t } = useI18n(messages);
  const weekday = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const firstMonday = addDays(today, -weekday - (WEEKS - 1) * 7);
  const rows = Array.from({ length: WEEKS }, (_, w) => addDays(firstMonday, w * 7));
  return (
    <Card>
      <CardHead title={t("ig.title")} note={`${t("ig.autoNote")} · ${t("ig.noteDesktop")}`} />
      <div className="wt:px-[18px] wt:pt-2.5 wt:pb-4">
        <div className="wt:grid wt:grid-cols-[48px_repeat(7,minmax(0,1fr))] wt:items-center wt:gap-1">
          <span />
          {WEEKDAYS.map(w => (
            <span key={w} className="wt:text-ink-3 wt:text-center wt:text-[10.5px]">
              {t(w)}
            </span>
          ))}
          {rows.map(monday => (
            <Week
              key={monday}
              monday={monday}
              ledger={ledger}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
            />
          ))}
        </div>
        <div className="wt:text-ink-3 wt:mt-2.5 wt:flex wt:flex-wrap wt:gap-x-3 wt:gap-y-1 wt:text-[11px]">
          <span className="wt:inline-flex wt:items-center wt:gap-1.5">
            <Dot color={FOOD_COLOR} />
            {t("ig.eatOk")}{budgetKnown ? "" : t("ig.needsProfile")}
          </span>
          <span className="wt:inline-flex wt:items-center wt:gap-1.5">
            <Dot color={MOVE_COLOR} />
            {t("ig.moveLegend", { goal: moveGoal })}
          </span>
          <span className="wt:inline-flex wt:items-center wt:gap-1.5">
            <Dot color="" filled={false} />
            {t("ig.noneLegend")}
          </span>
        </div>
      </div>
    </Card>
  );
}

function Week({ monday, ledger, today, selectedDate, onSelectDate }: {
  monday: string;
  ledger: Ledger;
  today: string;
  selectedDate: string;
  onSelectDate(date: string): void;
}) {
  return (
    <>
      <span className="wt:text-ink-3 wt:text-[10.5px] wt:tabular-nums">{shortDate(monday)}</span>
      {Array.from({ length: 7 }, (_, k) => {
        const date = addDays(monday, k);
        const day = ledger.byDate.get(date);
        if (!day || date > today)
          return <span key={date} className="wt:h-[26px] wt:rounded-[7px] wt:shadow-[inset_0_0_0_1px_var(--tau-line-2)]" />;
        return (
          <Cell
            key={date}
            day={day}
            isToday={date === today}
            selected={date === selectedDate}
            onSelect={() => onSelectDate(date)}
          />
        );
      })}
    </>
  );
}

function Cell({ day, isToday, selected, onSelect }: { day: DaySummary; isToday: boolean; selected: boolean; onSelect(): void }) {
  const { t } = useI18n(messages);
  const eatText =
    day.eat === "ok" ? t("wt.legend.under") : day.eat === "miss" ? t("ig.cellOver", { kcal: -day.remaining }) : day.foodCount ? t("ig.cellLogging") : t("ig.cellNotLogged");
  const moveText = t("ig.cellMove", { minutes: day.moveMinutes });
  return (
    <Tooltip
      content={
        <span className="wt:text-[12px]">
          {dayLabel(t, day.date)} · {eatText} · {moveText}
        </span>
      }
    >
      <button
        type="button"
        aria-label={t("ig.cellAria", { day: dayLabel(t, day.date), eat: eatText, move: moveText })}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "wt:bg-hover wt:hover:bg-press wt:flex wt:h-[26px] wt:items-center wt:justify-center wt:gap-[3px] wt:rounded-[7px] wt:outline-none wt:focus-visible:shadow-[var(--tau-focus-ring)]",
          selected && "wt:bg-press"
        )}
        style={selected ? { boxShadow: "0 0 0 1.5px var(--tau-accent)" } : isToday ? { boxShadow: "0 0 0 1.5px var(--tau-ink-1)" } : undefined}
      >
        <Dot color={FOOD_COLOR} filled={day.eat === "ok"} />
        <Dot color={MOVE_COLOR} filled={day.move === "ok"} />
      </button>
    </Tooltip>
  );
}

export function GroupCompare({ days }: { days: readonly DaySummary[] }) {
  const { t } = useI18n(messages);
  const groups = compareGroups(days);
  const max = Math.max(0.2, ...groups.map(g => Math.abs(g.mean ?? 0)));
  return (
    <Card>
      <CardHead title={t("ig.title2")} />
      <div className="wt:flex wt:flex-col wt:gap-1 wt:px-3.5 wt:pt-2.5 wt:pb-3.5">
        {groups.map(g => (
          <GroupRow key={g.id} group={g} max={max} />
        ))}
        <p className="wt:text-ink-2 wt:px-1.5 wt:pt-1.5 wt:text-[12px] wt:leading-[1.7]">{conclusion(t, groups)}</p>
      </div>
    </Card>
  );
}

function GroupRow({ group, max }: { group: GroupStat; max: number }) {
  const { t } = useI18n(messages);
  const v = group.mean ?? 0;
  const weak = group.days < MIN_SAMPLE;
  // 0 轴放在 62% 处：变轻是主要方向，左侧留得更长
  const width = (Math.abs(v) / max) * (v < 0 ? 62 : 38);
  return (
    <div className="wt:hover:bg-hover wt:grid wt:h-8 wt:grid-cols-[92px_minmax(0,1fr)_78px] wt:items-center wt:gap-2.5 wt:rounded-[8px] wt:px-1.5">
      <span className="wt:flex wt:items-center wt:gap-1 wt:text-[12.5px]">
        <Dot color={FOOD_COLOR} filled={group.id === "both" || group.id === "eat"} />
        <Dot color={MOVE_COLOR} filled={group.id === "both" || group.id === "move"} />
        <span className="wt:ml-1">{t(GROUP_KEYS[group.id])}</span>
      </span>
      <div className="wt:relative wt:h-3">
        <div className="wt:bg-line-1 wt:absolute wt:-top-2 wt:-bottom-2 wt:left-[62%] wt:w-px" />
        {group.mean != null && (
          <div
            className="wt:absolute wt:top-0 wt:h-3"
            style={{
              width: `${width}%`,
              opacity: weak ? 0.4 : 1,
              background: v < 0 ? LOSE_COLOR : GAIN_COLOR,
              ...(v < 0 ? { right: "38%", borderRadius: "4px 0 0 4px" } : { left: "62%", borderRadius: "0 4px 4px 0" }),
            }}
          />
        )}
      </div>
      <span className="wt:text-right wt:text-[12.5px]">
        <Delta value={group.mean} digits={2} suffix=" kg" />
        <small className="wt:text-ink-3 wt:block wt:text-[10.5px] wt:leading-none">
          {weak && group.days > 0 ? t("ig.samples") : ""}
          {t("common.days", { count: group.days })}
        </small>
      </span>
    </div>
  );
}

function conclusion(t: Translate, groups: GroupStat[]): string {
  const [both, eat, move, none] = groups;
  const enough = (g: GroupStat) => g.days >= MIN_SAMPLE && g.mean != null;
  if (!groups.some(enough)) return t("ig.conclusion.empty");
  const parts: string[] = [];
  if (enough(eat) && enough(move))
    parts.push(eat.mean! < move.mean! ? t("ig.conclusion.eatVsMove1") : t("ig.conclusion.eatVsMove2"));
  else if (enough(eat)) parts.push(t("ig.conclusion.eatMain"));
  else if (enough(move)) parts.push(t("ig.conclusion.moveMain"));
  if (enough(both) && groups.filter(enough).every(g => g === both || both.mean! <= g.mean!))
    parts.push(t("ig.conclusion.bothBest"));
  if (enough(none) && none.mean! > 0) parts.push(t("ig.conclusion.noneGains"));
  return `${t("ig.conclusion.prefix")}${parts.join(t("ig.joiner")) || t("ig.conclusion.tail")}${t("ig.period")}`;
}
