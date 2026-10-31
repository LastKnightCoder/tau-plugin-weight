/**
 * 手机「今天」页的减重小卡：还能吃多少 + 晨重，「称重」就地弹出称重面板，「记一笔」进减重页并聚焦记录条。
 * 早上还没称时换成「起床称一下」。用户在引导里关掉了今天页卡片时不显示。
 */
import { useState } from "react";
import type { PluginHomePanelProps } from "@tau/plugins";
import { Plus, Scale } from "lucide-react";
import { cn } from "@tau/ui";
import type { WeighSlot } from "../../data/model";
import { useRuntime } from "../../runtime";
import { kg, signed } from "../bits";
import { useLedger, useNow, usePrefs } from "../queries";
import { SheetHost } from "./Sheet";
import { WeighSheet, type WeighTarget } from "./WeighSheet";

export function MobileHomePanel({ registerDismiss }: PluginHomePanelProps) {
  const { pages, data } = useRuntime();
  const { today } = useNow();
  const query = useLedger(14, today);
  const prefs = usePrefs();
  const [weigh, setWeigh] = useState<WeighTarget | null>(null);
  if (!query.data || !prefs.data || !prefs.data.homeCard) return null;
  const { overview: o, ledger } = query.data;
  const t = o.today;
  const morning = new Date().getHours() < 14;
  const needWeigh = morning && t.am == null;
  const delta = t.am != null && o.yesterday?.am != null ? t.am - o.yesterday.am : null;
  const slot: WeighSlot = morning || t.am == null ? "am" : "pm";

  const openWeigh = () => {
    const before = [...ledger.days].reverse().filter(d => d.date < today);
    void data.listWeighs(today, today).then(list =>
      setWeigh({
        date: today,
        slot,
        am: t.am,
        pm: t.pm,
        previous: { am: before.find(d => d.am != null)?.am ?? null, pm: before.find(d => d.pm != null)?.pm ?? null },
        avg: o.latestAvg,
        existing: Object.fromEntries(list.map(w => [w.slot, w])),
      })
    );
  };

  const button = "wt:flex wt:h-8 wt:flex-1 wt:items-center wt:justify-center wt:gap-1 wt:rounded-[10px] wt:text-[12px] wt:font-semibold wt:[&>svg]:size-[13px]";
  return (
    <SheetHost.Provider value={registerDismiss ? { registerDismiss } : null}>
      <div className="wt:flex wt:min-h-[96px] wt:flex-1 wt:flex-col">
        {needWeigh ? (
          <>
            <b className="wt:mt-1.5 wt:text-[18px] wt:font-[750]">起床称一下</b>
            <span className="wt:text-ink-2 wt:mt-0.5 wt:text-[11.5px]">
              昨天晨重 <b className="wt:tabular-nums">{kg(o.yesterday?.am)}</b> · 均值 {kg(o.latestAvg)}
            </span>
          </>
        ) : (
          <>
            <b className={cn("wt:mt-1 wt:text-[25px] wt:leading-[1.1] wt:font-[750] wt:tracking-[-0.03em] wt:tabular-nums", t.budget > 0 && t.remaining < 0 && "wt:text-danger")}>
              {t.budget > 0 ? Math.abs(t.remaining) : t.intake}
              <small className="wt:text-ink-3 wt:ml-0.5 wt:text-[11px] wt:font-medium wt:tracking-normal">kcal</small>
            </b>
            <span className="wt:text-ink-2 wt:mt-0.5 wt:truncate wt:text-[11.5px]">
              {t.budget > 0 ? (t.remaining < 0 ? "超预算" : "还能吃") : "今天已吃"} · 晨重 <b className="wt:tabular-nums">{kg(t.am)}</b>
              {delta != null && <span className={delta <= 0 ? "wt:text-info" : "wt:text-danger"}> {signed(delta)}</span>}
            </span>
          </>
        )}
        <span className="wt:mt-auto wt:flex wt:gap-1.5 wt:pt-2">
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              openWeigh();
            }}
            className={cn(button, needWeigh ? "wt:bg-accent wt:text-ink-inverse" : "wt:bg-hover wt:text-ink-1")}
          >
            <Scale />
            称重
          </button>
          {!needWeigh && (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                void pages.main?.open({ log: true });
              }}
              className={cn(button, "wt:bg-accent-soft wt:text-accent-text")}
            >
              <Plus />
              记一笔
            </button>
          )}
        </span>
      </div>
      <WeighSheet target={weigh} onClose={() => setWeigh(null)} />
    </SheetHost.Provider>
  );
}
