/**
 * 首页「减重」卡：今天晨重（没称时给称重入口）、还能吃多少 kcal、运动进度，下面是一句话记录。
 */
import type { ReactNode } from "react";
import { cn } from "@tau/ui";
import { useRuntime } from "../runtime";
import { Delta, MOVE_COLOR, kg } from "./bits";
import { QuickLog } from "./QuickLog";
import { useLedger, useNow } from "./queries";

export function HomePanel() {
  const { pages } = useRuntime();
  const { today } = useNow();
  const query = useLedger(14, today);
  if (!query.data) return null;
  const { overview: o, profile } = query.data;
  const t = o.today;
  const moveGoal = profile?.moveGoal ?? 30;
  const delta = t.am != null && o.yesterday?.am != null ? t.am - o.yesterday.am : null;
  const hasBudget = t.budget > 0;
  const over = hasBudget && t.remaining < 0;
  const unit = (text: string) => <small className="wt:text-ink-3 wt:ml-1 wt:text-[11px] wt:font-normal">{text}</small>;
  return (
    <div className="wt:flex wt:flex-col wt:gap-3">
      <div className="wt:grid wt:grid-cols-3 wt:gap-4">
        <Stat
          label="晨重"
          foot={t.am == null ? "今天还没称" : <>较昨天 <Delta value={delta} suffix=" kg"/></>}
        >
          {t.am == null ? (
            <button
              type="button"
              onClick={() => void pages.main?.open({ weigh: "am" })}
              className="wt:text-accent-text wt:hover:underline wt:text-[14px] wt:font-medium"
            >
              ＋ 称一下
            </button>
          ) : (
            <>
              {kg(t.am)}
              {unit("kg")}
            </>
          )}
        </Stat>
        <Stat label={over ? "已超预算" : "还能吃"} danger={over} foot={hasBudget ? `已吃 ${t.intake} kcal` : "未设热量预算"}>
          {hasBudget ? Math.abs(t.remaining) : t.intake}
          {unit("kcal")}
        </Stat>
        <Stat
          label="运动"
          foot={
            <div className="wt:bg-track wt:h-1.5 wt:w-full wt:overflow-hidden wt:rounded-full">
              <div className="wt:h-full wt:rounded-full" style={{ width: `${Math.min(100, (t.moveMinutes / moveGoal) * 100)}%`, background: MOVE_COLOR }} />
            </div>
          }
        >
          {t.moveMinutes}
          {unit(`/ ${moveGoal} 分钟`)}
        </Stat>
      </div>
      <QuickLog
        remaining={t.budget > 0 ? t.remaining : null}
        kg={o.latestAvg}
        hasProfile={profile != null}
      />
    </div>
  );
}

/** 指标格：标签 / 单行数字 / 固定高度的底行（进度条或一行说明），同排各格基线对齐 */
function Stat({ label, danger, foot, children }: { label: string; danger?: boolean; foot: ReactNode; children: ReactNode }) {
  return (
    <div className="wt:flex wt:min-w-0 wt:flex-col wt:gap-1">
      <span className="wt:text-ink-3 wt:truncate wt:text-[11.5px]">{label}</span>
      <b className={cn("wt:flex wt:h-[26px] wt:items-baseline wt:truncate wt:text-[20px] wt:leading-[26px] wt:font-semibold wt:tabular-nums", danger && "wt:text-danger")}>
        {children}
      </b>
      <div className="wt:text-ink-3 wt:flex wt:h-4 wt:min-w-0 wt:items-center wt:text-[11.5px] wt:tabular-nums">
        {typeof foot === "string" ? <span className="wt:truncate">{foot}</span> : foot}
      </div>
    </div>
  );
}
