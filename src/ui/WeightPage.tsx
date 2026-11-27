/**
 * 减重主页：整页一张纸，标题固定在纸顶、内容在纸内滚动，纸内卡片用细描边。
 * 上部两列，左列三张今日卡与体重 + 摄入趋势，右列选日记录、每日流水与 AI（AI 仍分析今天，卡拉伸到与左列等高）；下部通栏是打卡格与四组对比。宽度不足时右列落到左列下方。参数 weigh: "am" | "pm" 打开称重弹窗（首页卡片跳转用）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n, type PluginPageProps } from "@tau/plugins";
import { FadeScroll, Loading, Segmented } from "@tau/ui";
import { addDays, dateKey, type WeighSlot } from "../data/model";
import { useRuntime } from "../runtime";
import { messages } from "../i18n";
import { AIPanel } from "./AIPanel";
import { Card, CardHead, FOOD_COLOR, MOVE_COLOR, dayLabel } from "./bits";
import { BudgetCard, MoveCard, WeightCard } from "./HeroCards";
import { GroupCompare, HabitGrid } from "./Insights";
import { QuickLog } from "./QuickLog";
import { useDayEntries, useLedger, useNow } from "./queries";
import { DayList } from "./DayList";
import { TrendChart } from "./TrendChart";
import { WeighDialog, type WeighDialogState } from "./WeighDialog";
import { defaultWeigh } from "./weighing";

type Range = "14" | "30" | "90";
const LEDGER_DAYS = 90;
const EXAMPLES = ["奶茶一杯", "午饭牛肉面", "散步 30 分钟"];

export function WeightPage({ params }: PluginPageProps) {
  const { pages } = useRuntime();
  const { t, locale } = useI18n(messages);
  const { today, time } = useNow();
  const query = useLedger(LEDGER_DAYS, today);
  const [range, setRange] = useState<Range>("30");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const selectedDate = pickedDate ?? today;
  const selectedDayQuery = useDayEntries(selectedDate);
  const [showPm, setShowPm] = useState(false);
  const [weigh, setWeigh] = useState<WeighDialogState | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const selectDate = (date: string) => {
    if (date > today) return;
    setPickedDate(current => current === date || date === today ? null : date);
  };

  /** 不带日期时按当前时间定（凌晨归到昨天睡前）；日详情补空缺时带上日期 */
  const openWeigh = (slot?: WeighSlot, date?: string) => {
    const ledger = query.data?.ledger;
    if (!ledger) return;
    const now = new Date();
    const target = date && slot ? { date, slot } : defaultWeigh(now, ledger, slot);
    setWeigh({ ...target, today: dateKey(now), ledger });
  };

  // 带 weigh 参数进入（首页卡片、命令）时打开称重，随后去掉参数，再次进入同一参数仍会触发；auto 按当前时间定时段
  const weighParam = params.weigh === "am" || params.weigh === "pm" || params.weigh === "auto" ? params.weigh : null;
  const ready = query.data != null;
  const openWeighRef = useRef(openWeigh);
  openWeighRef.current = openWeigh;
  useEffect(() => {
    if (!weighParam || !ready) return;
    openWeighRef.current(weighParam === "auto" ? undefined : weighParam);
    void pages.main?.open({});
  }, [weighParam, ready, pages]);

  const chartDays = useMemo(() => {
    const days = query.data?.ledger.days ?? [];
    return days.filter(d => d.date > addDays(today, -Number(range)));
  }, [query.data, range, today]);

  if (query.isError)
    return (
      <div className="wt:text-ink-3 wt:grid wt:h-full wt:place-items-center wt:text-[13px]">{t("common.loadFailed")}</div>
    );
  if (!query.data) return <Loading />;
  const { ledger, overview: o, todayEntries, profile } = query.data;
  const day = o.today;
  const moveGoal = profile?.moveGoal ?? 30;
  const focusLog = () => logRef.current?.querySelector("input")?.focus();
  const focusTodayLog = () => {
    selectDate(today);
    focusLog();
  };
  const selectedDay = ledger.byDate.get(selectedDate) ?? null;
  const selectedIsToday = selectedDate === today;
  const selectedRemaining = selectedDay && selectedDay.budget > 0 ? selectedDay.remaining : null;
  const stamp = `${todayEntries.map(e => `${e.id}:${e.kcal}`).join(",")}|${day.am}|${day.pm}`;

  return (
    <div className="wt:mx-auto wt:flex wt:h-full wt:min-h-0 wt:w-full wt:max-w-[1720px] wt:flex-col wt:px-4 wt:pb-4 wt:pt-1">
      <div className="wt:bg-surface wt:shadow-card wt:rounded-tau-lg wt:flex wt:min-h-0 wt:flex-1 wt:flex-col wt:overflow-hidden">
        <header className="wt:flex-none wt:px-8 wt:pt-5">
          <h1 className="wt:text-tau-title-lg wt:flex wt:h-10 wt:items-center wt:font-semibold wt:tracking-[-0.01em]">{t("app.page.title")}</h1>
        </header>
        <FadeScroll className="wt:mb-4 wt:min-h-0 wt:flex-1 wt:pb-4 wt:pl-8 wt:pr-[26px] wt:pt-3">
          <div className="wt:@container">
            <div className="wt:grid wt:grid-cols-1 wt:gap-3.5 wt:@[1040px]:grid-cols-[minmax(0,1fr)_340px]">
              <div className="wt:flex wt:min-w-0 wt:flex-col wt:gap-3.5">
                <div className="wt:grid wt:grid-cols-1 wt:gap-3.5 wt:@[640px]:grid-cols-[1.1fr_1.25fr_1fr]">
                  <WeightCard o={o} onWeigh={slot => openWeigh(slot)} />
                  <BudgetCard o={o} hasProfile={profile != null} onFocusLog={focusTodayLog} onSetup={() => void pages.settings?.open()} />
                  <MoveCard o={o} moveGoal={moveGoal} />
                </div>

                <Card className="wt:pb-3.5">
                  <CardHead title={t("wt.weightTitle")} note={t("wt.chartNote")}>
                    <Segmented<Range> label={t("wt.rangeLabel")} size="sm" value={range} onValueChange={setRange}>
                      <Segmented.Item value="14" label={t("wt.range2w")} />
                      <Segmented.Item value="30" label={t("wt.rangeMonth")} />
                      <Segmented.Item value="90" label={t("wt.range3m")} />
                    </Segmented>
                    <Segmented<"am" | "all"> label={t("wt.pmLabel")} size="sm" value={showPm ? "all" : "am"} onValueChange={v => setShowPm(v === "all")}>
                      <Segmented.Item value="am" label={t("wt.segAm")} />
                      <Segmented.Item value="all" label={t("wt.segPm")} />
                    </Segmented>
                  </CardHead>
                  <div className="wt:px-1 wt:pt-2.5 wt:pr-3.5">
                    {ledger.days.some(d => d.am != null) || ledger.days.some(d => d.foodCount) ? (
                      <TrendChart
                        days={chartDays}
                        today={today}
                        selectedDate={selectedDate}
                        goal={profile?.goalKg ?? null}
                        showPm={showPm}
                        onSelectDate={selectDate}
                      />
                    ) : (
                      <p className="wt:text-ink-3 wt:grid wt:h-[200px] wt:place-items-center wt:text-[12.5px]">
                        {t("wt.trendEmpty")}
                      </p>
                    )}
                  </div>
                  <Legend goal={profile?.goalKg != null} />
                </Card>

              </div>

              <div className="wt:flex wt:min-w-0 wt:flex-col wt:gap-3.5">
                <Card className="wt:px-4 wt:pt-3.5 wt:pb-3">
                  <div className="wt:text-ink-3 wt:mb-2.5 wt:flex wt:items-center wt:text-[12px]">
                    {selectedIsToday ? t("wt.oneLine") : t("wt.logBackfill", { day: dayLabel(t, selectedDate) })}
                    <span className="wt:flex-1" />
                    {selectedIsToday ? (
                      time
                    ) : (
                      <button type="button" onClick={() => selectDate(today)} className="wt:text-accent-text wt:font-medium">
                        {t("wt.backToToday")}
                      </button>
                    )}
                  </div>
                  <div ref={logRef}>
                    <QuickLog
                      date={selectedIsToday ? undefined : selectedDate}
                      remaining={selectedRemaining}
                      kg={o.latestAvg}
                      hasProfile={profile != null}
                      examples={EXAMPLES}
                    />
                  </div>
                </Card>
                <DayList
                  entries={selectedDayQuery.data ?? []}
                  date={selectedDate}
                  today={today}
                  time={time}
                  day={selectedDay}
                  loading={selectedDayQuery.isPending}
                  error={selectedDayQuery.isError}
                  moveGoal={moveGoal}
                  onFocusLog={focusLog}
                  onWeigh={() => openWeigh("am", selectedDate)}
                  onRetry={() => void selectedDayQuery.refetch()}
                />
                <AIPanel
                  className="wt:flex-1"
                  stamp={stamp}
                  input={{ now: time, profile, overview: o, days: ledger.days, todayEntries }}
                />
              </div>
            </div>
            <div className="wt:mt-3.5 wt:grid wt:grid-cols-1 wt:gap-3.5 wt:@[760px]:grid-cols-2">
              <HabitGrid
                ledger={ledger}
                today={today}
                selectedDate={selectedDate}
                budgetKnown={profile != null}
                moveGoal={moveGoal}
                onSelectDate={selectDate}
              />
              <GroupCompare days={ledger.days} />
            </div>
          </div>
        </FadeScroll>
      </div>
      <WeighDialog state={weigh} onClose={() => setWeigh(null)} />
    </div>
  );
}

function Legend({ goal }: { goal: boolean }) {
  const { t } = useI18n(messages);
  const item = "wt:inline-flex wt:items-center wt:gap-1.5";
  return (
    <div className="wt:text-ink-2 wt:flex wt:flex-wrap wt:gap-x-3.5 wt:gap-y-1 wt:px-[18px] wt:pt-2 wt:text-[11.5px]">
      <span className={item}><i className="wt:bg-ink-3 wt:size-[7px] wt:rounded-full wt:opacity-60" />{t("wt.legend.am")}</span>
      <span className={item}><i className="wt:bg-accent wt:h-0.5 wt:w-3.5 wt:rounded-full" />{t("wt.legend.avg")}</span>
      {goal && (
        <span className={item}>
          <i className="wt:h-0.5 wt:w-3.5" style={{ background: "repeating-linear-gradient(90deg, var(--tau-ok) 0 4px, transparent 4px 7px)" }} />
          {t("wt.legend.goal")}
        </span>
      )}
      <span className={item}><i className="wt:h-2.5 wt:w-2 wt:rounded-[2px]" style={{ background: FOOD_COLOR }} />{t("wt.legend.under")}</span>
      <span className={item}><i className="wt:bg-ink-3 wt:h-2.5 wt:w-2 wt:rounded-[2px] wt:opacity-45" />{t("wt.legend.over")}</span>
      <span className={item}><i className="wt:size-1.5 wt:rounded-full" style={{ background: MOVE_COLOR }} />{t("wt.legend.moveOk")}</span>
    </div>
  );
}
