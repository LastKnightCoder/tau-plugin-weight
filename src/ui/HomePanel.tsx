/**
 * 首页「减重」卡：今天晨重（没称时给称重入口）、还能吃多少 kcal、运动进度，下面是一句话记录。
 */
import { ChevronRight, Footprints, Sunrise } from "lucide-react";
import { cn } from "@tau/ui";
import { useRuntime } from "../runtime";
import { Delta, MOVE_COLOR, kg } from "./bits";
import { QuickLog } from "./QuickLog";
import { useLedger, useNow } from "./queries";

export function HomePanel() {
  const { pages } = useRuntime();
  const { today, time } = useNow();
  const query = useLedger(14, today);
  if (!query.data) return null;
  const { overview: o, profile } = query.data;
  const t = o.today;
  const moveGoal = profile?.moveGoal ?? 30;
  const delta = t.am != null && o.yesterday?.am != null ? t.am - o.yesterday.am : null;
  const hasBudget = t.budget > 0;
  const over = hasBudget && t.remaining < 0;
  return (
    <div className="wt:flex wt:flex-col wt:gap-3 wt:px-1">
      <div className="wt:grid wt:grid-cols-3 wt:gap-3">
        <button
          type="button"
          onClick={() => void pages.main?.open(t.am == null ? { weigh: "am" } : {})}
          className="wt:hover:bg-hover wt:flex wt:flex-col wt:items-start wt:rounded-[10px] wt:px-2 wt:py-1.5 wt:text-left"
        >
          <span className="wt:text-ink-3 wt:flex wt:items-center wt:gap-1 wt:text-[11.5px]">
            <Sunrise className="wt:size-3" />
            晨重
          </span>
          {t.am == null ? (
            <span className="wt:text-accent-text wt:text-[13px] wt:leading-[1.9] wt:font-medium">＋ 称一下</span>
          ) : (
            <span className="wt:flex wt:items-baseline wt:gap-1.5">
              <b className="wt:text-[20px] wt:font-semibold wt:tabular-nums">{kg(t.am)}</b>
              <Delta value={delta} className="wt:text-[11.5px]" />
            </span>
          )}
        </button>
        <div className="wt:flex wt:flex-col wt:px-2 wt:py-1.5">
          <span className="wt:text-ink-3 wt:text-[11.5px]">{over ? "已超预算" : "还能吃"}</span>
          {hasBudget ? (
            <b className={cn("wt:text-[20px] wt:font-semibold wt:tabular-nums", over && "wt:text-danger")}>
              {Math.abs(t.remaining)}
              <small className="wt:text-ink-3 wt:ml-1 wt:text-[11px] wt:font-normal">kcal</small>
            </b>
          ) : (
            <span className="wt:text-ink-2 wt:text-[12.5px] wt:leading-[1.9]">已吃 {t.intake} kcal</span>
          )}
        </div>
        <div className="wt:flex wt:flex-col wt:px-2 wt:py-1.5">
          <span className="wt:text-ink-3 wt:flex wt:items-center wt:gap-1 wt:text-[11.5px]">
            <Footprints className="wt:size-3" />
            运动
          </span>
          <b className="wt:text-[20px] wt:font-semibold wt:tabular-nums">
            {t.moveMinutes}
            <small className="wt:text-ink-3 wt:ml-1 wt:text-[11px] wt:font-normal">/ {moveGoal} 分钟</small>
          </b>
          <div className="wt:bg-track wt:mt-1 wt:h-1.5 wt:overflow-hidden wt:rounded-full">
            <div className="wt:h-full wt:rounded-full" style={{ width: `${Math.min(100, (t.moveMinutes / moveGoal) * 100)}%`, background: MOVE_COLOR }} />
          </div>
        </div>
      </div>
      <QuickLog
        today={today}
        time={time}
        remaining={t.budget > 0 ? t.remaining : null}
        kg={o.latestAvg}
        hasProfile={profile != null}
      />
      <button
        type="button"
        onClick={() => void pages.main?.open()}
        className="wt:text-ink-3 wt:hover:text-ink-1 wt:inline-flex wt:items-center wt:gap-0.5 wt:self-start wt:rounded-[6px] wt:px-1 wt:py-0.5 wt:text-[12px]"
      >
        查看趋势
        <ChevronRight className="wt:size-[13px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}
