/**
 * 打卡格（最近 8 周，周一开头，每天两颗点 = 少吃 / 多动）与「做到了，第二天轻多少」四组对比。
 */
import { Tooltip } from "@tau/ui";
import { addDays } from "../data/model";
import { compareGroups, type DaySummary, type GroupStat, type Ledger } from "../data/stats";
import { Card, CardHead, Delta, Dot, FOOD_COLOR, GAIN_COLOR, LOSE_COLOR, MOVE_COLOR, dayLabel, shortDate } from "./bits";

const WEEKS = 8;
const MIN_SAMPLE = 5;

export function HabitGrid({ ledger, today, budgetKnown, moveGoal }: {
  ledger: Ledger;
  today: string;
  budgetKnown: boolean;
  moveGoal: number;
}) {
  const weekday = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const firstMonday = addDays(today, -weekday - (WEEKS - 1) * 7);
  const rows = Array.from({ length: WEEKS }, (_, w) => addDays(firstMonday, w * 7));
  return (
    <Card>
      <CardHead title="打卡" note="由记录自动判定" />
      <div className="wt:px-[18px] wt:pt-2.5 wt:pb-4">
        <div className="wt:grid wt:grid-cols-[48px_repeat(7,minmax(0,1fr))] wt:items-center wt:gap-1">
          <span />
          {"一二三四五六日".split("").map(c => (
            <span key={c} className="wt:text-ink-3 wt:text-center wt:text-[10.5px]">
              {c}
            </span>
          ))}
          {rows.map(monday => (
            <Week key={monday} monday={monday} ledger={ledger} today={today} />
          ))}
        </div>
        <div className="wt:text-ink-3 wt:mt-2.5 wt:flex wt:flex-wrap wt:gap-x-3 wt:gap-y-1 wt:text-[11px]">
          <span className="wt:inline-flex wt:items-center wt:gap-1.5">
            <Dot color={FOOD_COLOR} />
            少吃 · 没超预算{budgetKnown ? "" : "（填写身体数据后判定）"}
          </span>
          <span className="wt:inline-flex wt:items-center wt:gap-1.5">
            <Dot color={MOVE_COLOR} />
            多动 · 运动 ≥ {moveGoal} 分钟
          </span>
          <span className="wt:inline-flex wt:items-center wt:gap-1.5">
            <Dot color="" filled={false} />
            没做到或没记
          </span>
        </div>
      </div>
    </Card>
  );
}

function Week({ monday, ledger, today }: { monday: string; ledger: Ledger; today: string }) {
  return (
    <>
      <span className="wt:text-ink-3 wt:text-[10.5px] wt:tabular-nums">{shortDate(monday)}</span>
      {Array.from({ length: 7 }, (_, k) => {
        const date = addDays(monday, k);
        const day = ledger.byDate.get(date);
        if (!day || date > today)
          return <span key={date} className="wt:h-[26px] wt:rounded-[7px] wt:shadow-[inset_0_0_0_1px_var(--tau-line-2)]" />;
        return <Cell key={date} day={day} isToday={date === today} />;
      })}
    </>
  );
}

function Cell({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const eatText = day.eat === "ok" ? "没超预算" : day.eat === "miss" ? `超出 ${-day.remaining} kcal` : day.foodCount ? "还在记" : "饮食没记";
  return (
    <Tooltip
      content={
        <span className="wt:text-[12px]">
          {dayLabel(day.date)} · {eatText} · 运动 {day.moveMinutes} 分钟
        </span>
      }
    >
      <span
        tabIndex={0}
        className="wt:bg-hover wt:hover:bg-press wt:flex wt:h-[26px] wt:items-center wt:justify-center wt:gap-[3px] wt:rounded-[7px] wt:outline-none wt:focus-visible:shadow-[var(--tau-focus-ring)]"
        style={isToday ? { boxShadow: "0 0 0 1.5px var(--tau-ink-1)" } : undefined}
      >
        <Dot color={FOOD_COLOR} filled={day.eat === "ok"} />
        <Dot color={MOVE_COLOR} filled={day.move === "ok"} />
      </span>
    </Tooltip>
  );
}

export function GroupCompare({ days }: { days: readonly DaySummary[] }) {
  const groups = compareGroups(days);
  const max = Math.max(0.2, ...groups.map(g => Math.abs(g.mean ?? 0)));
  return (
    <Card>
      <CardHead title="做到了，第二天轻多少" />
      <div className="wt:flex wt:flex-col wt:gap-1 wt:px-3.5 wt:pt-2.5 wt:pb-3.5">
        {groups.map(g => (
          <GroupRow key={g.id} group={g} max={max} />
        ))}
        <p className="wt:text-ink-2 wt:px-1.5 wt:pt-1.5 wt:text-[12px] wt:leading-[1.7]">{conclusion(groups)}</p>
      </div>
    </Card>
  );
}

function GroupRow({ group, max }: { group: GroupStat; max: number }) {
  const v = group.mean ?? 0;
  const weak = group.days < MIN_SAMPLE;
  // 0 轴放在 62% 处：变轻是主要方向，左侧留得更长
  const width = (Math.abs(v) / max) * (v < 0 ? 62 : 38);
  return (
    <div className="wt:hover:bg-hover wt:grid wt:h-8 wt:grid-cols-[92px_minmax(0,1fr)_78px] wt:items-center wt:gap-2.5 wt:rounded-[8px] wt:px-1.5">
      <span className="wt:flex wt:items-center wt:gap-1 wt:text-[12.5px]">
        <Dot color={FOOD_COLOR} filled={group.id === "both" || group.id === "eat"} />
        <Dot color={MOVE_COLOR} filled={group.id === "both" || group.id === "move"} />
        <span className="wt:ml-1">{group.name}</span>
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
          {weak && group.days > 0 ? "样本少 · " : ""}
          {group.days} 天
        </small>
      </span>
    </div>
  );
}

function conclusion(groups: GroupStat[]): string {
  const [both, eat, move, none] = groups;
  const enough = (g: GroupStat) => g.days >= MIN_SAMPLE && g.mean != null;
  if (!groups.some(enough)) return "次日晨重减当日晨重的平均值。坚持记录两三周，这里就能看出少吃和多动各自的效果。";
  const parts: string[] = [];
  if (enough(eat) && enough(move))
    parts.push(eat.mean! < move.mean! ? "对你来说少吃比多动管用" : "对你来说多动比少吃管用");
  else if (enough(eat)) parts.push("少吃是主力");
  else if (enough(move)) parts.push("多动是主力");
  if (enough(both) && groups.filter(enough).every(g => g === both || both.mean! <= g.mean!))
    parts.push("两样都做到效果最好");
  if (enough(none) && none.mean! > 0) parts.push("都没做的日子第二天会涨");
  return `次日晨重减当日晨重的平均值。${parts.join("，") || "目前各组差别不大"}。`;
}
