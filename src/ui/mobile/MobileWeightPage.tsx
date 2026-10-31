/**
 * 手机减重页。view=today（默认）：主卡 → 趋势迷你卡 → 今天流水，页底固定记录条；
 * view=trend：趋势与效果（单独注册的二级页，由页面栈承载返回）。参数 weigh 打开称重，log 聚焦记录条。
 * 第一次打开先走引导；离开期间后台估算完成的条目在回来时高亮。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PluginPageProps } from "@tau/plugins";
import { Loading } from "@tau/ui";
import { compareGroups } from "../../data/stats";
import type { Entry, WeighSlot } from "../../data/model";
import { useRuntime } from "../../runtime";
import { useLedger, useNow, usePrefs } from "../queries";
import { useQueryClient } from "@tanstack/react-query";
import { removeWithUndo } from "./actions";
import { EntrySheet } from "./EntrySheet";
import { LogBar, type LogBarHandle } from "./LogBar";
import { Onboarding } from "./Onboarding";
import { SheetHost } from "./Sheet";
import { HeroCard, TodayList, TrendMini } from "./TodayCards";
import { TrendView } from "./TrendPage";
import { VoiceSheet, type VoiceRequest } from "./VoiceSheet";
import { WeighSheet, type WeighTarget } from "./WeighSheet";

const LEDGER_DAYS = 90;
const HIGHLIGHT_MS = 2400;

export function MobileWeightPage({ params, pageContext }: PluginPageProps) {
  const runtime = useRuntime();
  const { pages, estimates, data } = runtime;
  const client = useQueryClient();
  const { today, time } = useNow();
  const query = useLedger(LEDGER_DAYS, today);
  const prefs = usePrefs();
  const [weigh, setWeigh] = useState<WeighTarget | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [voice, setVoice] = useState<VoiceRequest | null>(null);
  const [setup, setSetup] = useState<"onboard" | "profile" | null>(null);
  const [highlight, setHighlight] = useState<ReadonlySet<string>>(new Set());
  const logRef = useRef<LogBarHandle>(null);
  const view = params.view === "trend" ? "trend" : "today";

  // 离开期间估算完成的、以及在页面上估算完成的条目，短暂高亮
  useEffect(() => {
    const flash = (ids: string[]) => {
      if (!ids.length) return;
      setHighlight(new Set(ids));
      window.setTimeout(() => setHighlight(new Set()), HIGHLIGHT_MS);
    };
    flash(estimates.takeFresh());
    return estimates.subscribe(outcome => {
      if (outcome.status !== "ready") return;
      // 页面在显示时当场高亮；不在显示时留给下次打开
      if (!pageContext.isActive()) return;
      estimates.takeFresh();
      flash([outcome.entry.id]);
    });
  }, [estimates, pageContext]);

  const ready = query.data != null && prefs.data != null;
  useEffect(() => {
    if (ready && view === "today" && !prefs.data!.onboarded && !query.data!.profile) setSetup("onboard");
  }, [ready, view, prefs.data, query.data]);

  const openWeigh = (slot: WeighSlot) => {
    const ledger = query.data?.ledger;
    if (!ledger) return;
    const t = ledger.byDate.get(today);
    const before = [...ledger.days].reverse().filter(d => d.date < today);
    void data.listWeighs(today, today).then(list => {
      setWeigh({
        date: today,
        slot,
        am: t?.am ?? null,
        pm: t?.pm ?? null,
        previous: {
          am: before.find(d => d.am != null)?.am ?? null,
          pm: before.find(d => d.pm != null)?.pm ?? null,
        },
        avg: query.data?.overview.latestAvg ?? null,
        existing: Object.fromEntries(list.map(w => [w.slot, w])),
      });
    });
  };

  // 带参数进入（今天页卡片、命令）时执行一次，随后去掉参数，再次进入同一参数仍会触发
  const weighParam = params.weigh === "am" || params.weigh === "pm" ? params.weigh : null;
  const logParam = params.log === true || params.log === "1";
  const latestOpen = useRef(openWeigh);
  latestOpen.current = openWeigh;
  useEffect(() => {
    if (!ready || (!weighParam && !logParam)) return;
    if (weighParam) latestOpen.current(weighParam);
    if (logParam) logRef.current?.fill("");
    void pages.main?.open({});
  }, [weighParam, logParam, ready, pages]);

  const stamp = useMemo(() => {
    const d = query.data;
    if (!d) return "";
    return `${d.todayEntries.map(e => `${e.id}:${e.kcal}:${e.estimate}`).join(",")}|${d.overview.today.am}|${d.overview.today.pm}`;
  }, [query.data]);

  if (query.isError)
    return <div className="wt:text-ink-3 wt:grid wt:h-60 wt:place-items-center wt:text-[13px]">记录读取失败</div>;
  if (!query.data || !prefs.data) return <Loading minHeight={240} />;
  const { ledger, overview: o, todayEntries, profile } = query.data;
  const t = o.today;
  const moveGoal = profile?.moveGoal ?? 30;
  const groups = compareGroups(ledger.days);

  if (view === "trend")
    return (
      <SheetHost.Provider value={pageContext}>
        <TrendView
          ledger={ledger}
          today={today}
          goal={profile?.goalKg ?? null}
          moveGoal={moveGoal}
          budgetKnown={profile != null}
          aiInput={{ now: time, profile, overview: o, days: ledger.days, todayEntries }}
          stamp={stamp}
        />
      </SheetHost.Provider>
    );

  const remaining = t.budget > 0 ? t.remaining : null;
  return (
    <SheetHost.Provider value={pageContext}>
      {/* 宿主外壳随键盘收缩：内容区滚动，记录条贴在可见区底部 */}
      <div className="wt:-mx-4 wt:flex wt:min-h-full wt:flex-col">
        <div className="wt:flex wt:flex-1 wt:flex-col wt:gap-3 wt:px-4 wt:pt-1 wt:pb-4">
          <HeroCard
            o={o}
            hasProfile={profile != null}
            moveGoal={moveGoal}
            onWeigh={openWeigh}
            onSetup={() => setSetup("profile")}
          />
          <TrendMini days={ledger.days.slice(-30)} o={o} groups={groups} onOpen={() => void pages.trend?.open()} />
          <TodayList
            entries={todayEntries}
            remaining={remaining}
            moveMinutes={t.moveMinutes}
            moveGoal={moveGoal}
            time={time}
            highlight={highlight}
            onEdit={setEditing}
            onDelete={entry => void removeWithUndo(runtime, client, entry)}
            onFill={text => logRef.current?.fill(text)}
          />
        </div>
        <div className="wt:sticky wt:bottom-0 wt:z-[2]">
          <LogBar
            ref={logRef}
            today={today}
            time={time}
            remaining={remaining}
            eaten={t.intake}
            onVoice={text =>
              setVoice({
                text,
                today,
                now: time,
                remaining,
                moveMinutes: t.moveMinutes,
                moveGoal,
                kg: o.latestAvg,
              })
            }
          />
        </div>
      </div>
      <WeighSheet target={weigh} onClose={() => setWeigh(null)} />
      <EntrySheet entry={editing} onClose={() => setEditing(null)} />
      <VoiceSheet request={voice} onClose={() => setVoice(null)} />
      {setup && (
        <Onboarding
          profileOnly={setup === "profile"}
          today={today}
          latestKg={o.latestAvg}
          onClose={() => setSetup(null)}
          onDone={({ weigh: next }) => {
            setSetup(null);
            if (next) openWeigh("am");
          }}
        />
      )}
    </SheetHost.Provider>
  );
}
