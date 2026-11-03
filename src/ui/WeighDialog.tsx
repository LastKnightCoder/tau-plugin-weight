/**
 * 称重弹窗：只记体重。默认今天（凌晨默认昨天睡前并提示），日期胶囊展开近 7 天可补记；预填同时段最近一次读数。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Clock, Sunrise, Sunset } from "lucide-react";
import { Button, Dialog, DialogBody, cn, toast } from "@tau/ui";
import { addDays, type WeighSlot } from "../data/model";
import type { Ledger } from "../data/stats";
import { WEIGHT_KEY, useRuntime } from "../runtime";
import { kg } from "./bits";
import { useNow } from "./queries";
import { SLOT_NAME, isLateNight, notifySaved, pillText, recentDates, relativeDay, saveLabel, weighDay } from "./weighing";

export interface WeighDialogState {
  date: string;
  slot: WeighSlot;
  today: string;
  ledger: Ledger;
}

export function WeighDialog({ state, onClose }: { state: WeighDialogState | null; onClose(): void }) {
  const { data, context } = useRuntime();
  const client = useQueryClient();
  const { date: now } = useNow();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<WeighSlot>("am");
  const [picking, setPicking] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!state) return;
    setDate(state.date);
    setSlot(state.slot);
    setPicking(false);
  }, [state]);
  useEffect(() => {
    if (!state || !date) return;
    const d = weighDay(state.ledger, date);
    const initial = d[slot] ?? d.previous[slot];
    setValue(initial != null ? initial.toFixed(1) : "");
  }, [state, date, slot]);

  const today = state?.today ?? "";
  const day = state && date ? weighDay(state.ledger, date) : null;
  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 20 && parsed <= 400;
  const lateNight = state != null && date === addDays(today, -1) && state.date === date && isLateNight(now);
  const reference = slot === "pm" ? day?.am : day?.previous.am;

  const save = async () => {
    if (!state || !day || !valid || saving) return;
    setSaving(true);
    try {
      await data.saveWeigh(date, slot, parsed);
      if (context.signal.aborted) return;
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      notifySaved(data, client, { date, slot, kg: parsed, before: day[slot] }, today);
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const pick = (next: string) => {
    if (!state) return;
    const d = weighDay(state.ledger, next);
    setDate(next);
    setSlot(d.am == null ? "am" : d.pm == null ? "pm" : slot);
    setPicking(false);
  };

  return (
    <Dialog
      open={state != null}
      onOpenChange={open => !open && onClose()}
      title="称重"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!valid} loading={saving} onClick={() => void save()}>
            {date === today ? "保存" : saveLabel(date, today, slot, day?.[slot] != null)}
          </Button>
        </>
      }
    >
      <DialogBody>
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
          className={cn(
            "wt:flex wt:h-7 wt:items-center wt:gap-0.5 wt:rounded-full wt:pr-1.5 wt:pl-2.5 wt:text-[12.5px] wt:font-medium wt:[&>svg]:size-[15px]",
            date !== today
              ? "wt:bg-accent-soft wt:text-accent-text wt:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
              : "wt:text-ink-1 wt:shadow-[inset_0_0_0_1px_var(--tau-line-1)] wt:[&>svg]:text-ink-3"
          )}
        >
          {date && pillText(date, today)}
          {picking ? <ChevronUp /> : <ChevronDown />}
        </button>
        {picking && state ? (
          <DayList ledger={state.ledger} today={today} value={date} onPick={pick} />
        ) : (
          <>
            {lateNight && (
              <p className="wt:bg-accent-soft wt:text-ink-2 wt:mt-3 wt:flex wt:items-start wt:gap-2 wt:rounded-[10px] wt:px-3 wt:py-2 wt:text-[12.5px] wt:leading-[1.55]">
                <Clock className="wt:text-accent-text wt:mt-[3px] wt:size-3.5 wt:shrink-0" />
                <span>
                  已过午夜，还没睡就算<b className="wt:text-ink-1 wt:font-semibold">昨天</b>的睡前。
                  <button
                    type="button"
                    onClick={() => {
                      setDate(today);
                      setSlot("am");
                    }}
                    className="wt:text-accent-text wt:ml-1 wt:font-semibold wt:hover:underline"
                  >
                    改成今天
                  </button>
                </span>
              </p>
            )}
            <div className="wt:mt-3 wt:grid wt:grid-cols-2 wt:gap-2" role="radiogroup" aria-label="称重时段">
              {(["am", "pm"] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={slot === key}
                  onClick={() => setSlot(key)}
                  className={cn(
                    "wt:flex wt:h-[34px] wt:items-center wt:justify-center wt:gap-1.5 wt:rounded-[10px] wt:text-[13px] wt:[&>svg]:size-[15px]",
                    slot === key
                      ? "wt:bg-accent-soft wt:text-accent-text wt:font-semibold wt:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
                      : "wt:text-ink-2 wt:shadow-[inset_0_0_0_1px_var(--tau-line-1)] wt:hover:bg-hover"
                  )}
                >
                  {key === "am" ? <Sunrise /> : <Sunset />}
                  {SLOT_NAME[key]}
                  {day?.[key] != null && <span className="wt:text-ink-3 wt:font-normal wt:tabular-nums">· {kg(day[key])}</span>}
                </button>
              ))}
            </div>
            <div className="wt:bg-hover wt:mt-3.5 wt:flex wt:items-baseline wt:gap-2.5 wt:rounded-[14px] wt:px-[18px] wt:py-3.5">
              <input
                data-autofocus
                value={value}
                inputMode="decimal"
                onChange={e => setValue(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
                onFocus={e => e.currentTarget.select()}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void save();
                  }
                }}
                aria-label="体重（千克）"
                placeholder="0.0"
                className="wt:placeholder:text-ink-3 wt:w-[140px] wt:bg-transparent wt:text-[40px] wt:font-semibold wt:tracking-[-0.02em] wt:tabular-nums wt:outline-none"
              />
              <span className="wt:text-ink-3 wt:text-[15px]">kg</span>
              <span className="wt:text-ink-2 wt:ml-auto wt:text-right wt:text-[12px] wt:leading-[1.6]">
                {reference != null && (
                  <>
                    {slot === "pm" ? (date === today ? "今早" : "当天晨重") : "上次晨重"} {kg(reference)}
                    <br />
                  </>
                )}
                <span className="wt:text-ink-3">{slot === "am" ? "空腹、如厕后称最准" : "只用来看日内波动"}</span>
              </span>
            </div>
            <p className="wt:text-ink-3 wt:mt-3 wt:flex wt:items-center wt:gap-1.5 wt:text-[12px]">
              {slot === "am" ? <Sunrise className="wt:size-3.5" /> : <Sunset className="wt:size-3.5" />}
              趋势只看晨重；同一天同一时段再称一次会覆盖。
            </p>
          </>
        )}
      </DialogBody>
    </Dialog>
  );
}

/** 近 7 天：右侧是起床 · 睡前读数，没称写「没称」 */
function DayList({ ledger, today, value, onPick }: { ledger: Ledger; today: string; value: string; onPick(date: string): void }) {
  return (
    <div className="wt:mt-2.5 wt:flex wt:flex-col wt:gap-0.5" role="radiogroup" aria-label="称重日期">
      {recentDates(today)
        .reverse()
        .map(date => {
          const day = ledger.byDate.get(date);
          const am = day?.am ?? null;
          const pm = day?.pm ?? null;
          const on = date === value;
          return (
            <button
              key={date}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(date)}
              className={cn(
                "wt:flex wt:h-[30px] wt:items-center wt:gap-2 wt:rounded-[8px] wt:px-2.5 wt:text-[12.5px]",
                on ? "wt:bg-accent-soft wt:text-accent-text wt:font-semibold" : "wt:hover:bg-hover"
              )}
            >
              {relativeDay(date, today)}
              {date >= addDays(today, -1) && <span className="wt:text-ink-3 wt:font-normal">{date.slice(5).replace("-", "/")}</span>}
              <span className="wt:text-ink-3 wt:ml-auto wt:font-normal wt:tabular-nums">
                {am == null && pm == null ? "没称" : `${kg(am)} · ${kg(pm)}`}
              </span>
            </button>
          );
        })}
    </div>
  );
}
