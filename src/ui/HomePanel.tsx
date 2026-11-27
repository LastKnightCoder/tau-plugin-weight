/**
 * 首页「减重」卡：今天晨重（没称时给称重入口）、还能吃多少 kcal、运动进度，下面是一句话记录。
 */
import type { ReactNode } from "react";
import { useI18n } from "@tau/plugins";
import { cn } from "@tau/ui";
import { useRuntime } from "../runtime";
import { messages } from "../i18n";
import { Delta, MOVE_COLOR, kg } from "./bits";
import { QuickLog } from "./QuickLog";
import { useLedger, useNow } from "./queries";

export function HomePanel() {
  const { pages } = useRuntime();
  const { t } = useI18n(messages);
  const { today } = useNow();
  const query = useLedger(14, today);
  if (!query.data) return null;
  const { overview: o, profile } = query.data;
  const day = o.today;
  const moveGoal = profile?.moveGoal ?? 30;
  const delta = day.am != null && o.yesterday?.am != null ? day.am - o.yesterday.am : null;
  const hasBudget = day.budget > 0;
  const over = hasBudget && day.remaining < 0;
  const unit = (text: string) => <small className="wt:text-ink-3 wt:ml-1 wt:text-[11px] wt:font-normal">{text}</small>;
  return (
    <div className="wt:flex wt:flex-col wt:gap-3">
      <div className="wt:grid wt:grid-cols-3 wt:gap-4">
        <Stat
          label={t("wt.legend.am")}
          foot={day.am == null ? t("hp.notWeighedToday") : <>{t("hp.vsYesterday")} <Delta value={delta} suffix=" kg"/></>}
        >
          {day.am == null ? (
            <button
              type="button"
              onClick={() => void pages.main?.open({ weigh: "am" })}
              className="wt:text-accent-text wt:hover:underline wt:text-[14px] wt:font-medium"
            >
              {t("hp.weighCta")}
            </button>
          ) : (
            <>
              {kg(day.am)}
              {unit("kg")}
            </>
          )}
        </Stat>
        <Stat label={over ? t("hp.overBudget") : t("wc.left")} danger={over} foot={hasBudget ? t("hp.eaten", { intake: day.intake }) : t("hp.noBudget")}>
          {hasBudget ? Math.abs(day.remaining) : day.intake}
          {unit("kcal")}
        </Stat>
        <Stat
          label={t("dl.move")}
          foot={
            <div className="wt:bg-track wt:h-1.5 wt:w-full wt:overflow-hidden wt:rounded-full">
              <div className="wt:h-full wt:rounded-full" style={{ width: `${Math.min(100, (day.moveMinutes / moveGoal) * 100)}%`, background: MOVE_COLOR }} />
            </div>
          }
        >
          {day.moveMinutes}
          {unit(t("wc.moveUnit", { goal: moveGoal }))}
        </Stat>
      </div>
      <QuickLog
        remaining={day.budget > 0 ? day.remaining : null}
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
