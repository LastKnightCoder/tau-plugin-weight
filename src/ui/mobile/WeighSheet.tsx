/**
 * 手机称重面板：默认刻度尺（每格 0.1 kg，左右拖，起点是同时段上次读数）；点大数字切到面板数字键盘。
 * 标题旁的日期胶囊展开近 7 天日期条，可补记或改前几天的读数；凌晨打开默认记到昨天睡前并提示。
 * 已记过的时段按钮为「更新」，可删除这一次。睡前的参照是当天晨重。
 */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Clock, Delete, Sunrise, Sunset } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { addDays, type WeighSlot } from "../../data/model";
import type { Ledger } from "../../data/stats";
import { WEIGHT_KEY, useRuntime } from "../../runtime";
import { signed } from "../bits";
import { useNow } from "../queries";
import { SLOT_NAME, isLateNight, notifySaved, pillText, recentDates, saveLabel, weekdayOf, weighDay } from "../weighing";
import { PrimaryButton } from "./parts";
import { Sheet } from "./Sheet";

export interface WeighTarget {
  date: string;
  slot: WeighSlot;
  today: string;
  ledger: Ledger;
  avg: number | null;
}

const TICK = 10; // 每 0.1 kg 的像素
const MIN = 200; // 20.0 kg，单位 0.1 kg
const MAX = 4000;

export function WeighSheet({ target, onClose }: { target: WeighTarget | null; onClose(): void }) {
  const { data, context } = useRuntime();
  const client = useQueryClient();
  const { date: now } = useNow();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<WeighSlot>("am");
  const [picking, setPicking] = useState(false);
  const [tenths, setTenths] = useState(700);
  const [typing, setTyping] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setDate(target.date);
    setSlot(target.slot);
    setPicking(false);
    setTyping(null);
  }, [target]);
  const day = target && date ? weighDay(target.ledger, date) : null;
  useEffect(() => {
    if (!target || !date) return;
    const d = weighDay(target.ledger, date);
    const start = d[slot] ?? d.previous[slot] ?? (slot === "pm" ? d.am : null) ?? target.avg ?? 65;
    setTenths(Math.round(start * 10));
    setTyping(null);
  }, [target, date, slot]);

  const today = target?.today ?? "";
  const value = typing != null ? (typing.trim() ? Number(typing) : NaN) : tenths / 10;
  const valid = Number.isFinite(value) && value >= 20 && value <= 400;
  const existing = day?.[slot] != null;
  const reference = slot === "pm" ? day?.am ?? null : day?.previous.am ?? null;
  const lateNight = target != null && date === addDays(today, -1) && target.date === date && isLateNight(now);

  const save = async () => {
    if (!target || !day || !valid || saving) return;
    setSaving(true);
    try {
      await data.saveWeigh(date, slot, value);
      if (context.signal.aborted) return;
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      notifySaved(data, client, { date, slot, kg: value, before: day[slot] }, today);
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      const weigh = (await data.listWeighs(date, date)).find(w => w.slot === slot);
      if (!weigh) return;
      await data.deleteWeigh(weigh);
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      toast.success("已删除这次称重", {
        action: {
          label: "撤销",
          onClick: () =>
            void data
              .saveWeigh(weigh.date, weigh.slot, weigh.kg)
              .then(() => client.invalidateQueries({ queryKey: WEIGHT_KEY })),
        },
      });
      onClose();
    } catch {
      toast.error("删除失败");
    }
  };

  // 选了某天，时段跳到那天还缺的那一个
  const pick = (next: string) => {
    if (!target) return;
    const d = weighDay(target.ledger, next);
    setDate(next);
    setSlot(d.am == null ? "am" : d.pm == null ? "pm" : slot);
    setPicking(false);
  };
  const past = date !== today;
  return (
    <Sheet
      open={target != null}
      onClose={onClose}
      title="称重"
      subtitle={
        date ? (
          <button
            type="button"
            aria-expanded={picking}
            aria-label="换一天"
            onClick={() => setPicking(!picking)}
            className={cn(
              "wt:flex wt:h-7 wt:items-center wt:gap-0.5 wt:rounded-full wt:pr-1.5 wt:pl-2.5 wt:text-[12.5px] wt:font-medium wt:[&>svg]:size-[15px]",
              past
                ? "wt:bg-accent-soft wt:text-accent-text wt:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
                : "wt:text-ink-1 wt:shadow-[inset_0_0_0_1px_var(--tau-line-1)] wt:[&>svg]:text-ink-3"
            )}
          >
            {pillText(date, today)}
            {picking ? <ChevronUp /> : <ChevronDown />}
          </button>
        ) : undefined
      }
      trailing={
        existing ? (
          <button type="button" onClick={() => void remove()} className="wt:text-danger wt:text-[13px] wt:font-medium">
            删除这次
          </button>
        ) : typing != null ? (
          <button type="button" onClick={() => setTyping(null)} className="wt:text-accent-text wt:text-[13px] wt:font-medium">
            刻度尺
          </button>
        ) : null
      }
    >
      {picking && target && <DayStrip ledger={target.ledger} today={today} value={date} onPick={pick} />}
      {lateNight && !picking && (
        <p className="wt:bg-accent-soft wt:text-ink-2 wt:mt-2.5 wt:flex wt:items-start wt:gap-2 wt:rounded-[12px] wt:px-3 wt:py-2 wt:text-[12.5px] wt:leading-[1.55]">
          <Clock className="wt:text-accent-text wt:mt-[3px] wt:size-3.5 wt:shrink-0" />
          <span>
            已过午夜，还没睡就算<b className="wt:text-ink-1 wt:font-semibold">昨天</b>的睡前。
            <button
              type="button"
              onClick={() => {
                setDate(today);
                setSlot("am");
              }}
              className="wt:text-accent-text wt:ml-1 wt:font-semibold"
            >
              改成今天
            </button>
          </span>
        </p>
      )}
      <div className="wt:mt-3 wt:mb-3.5 wt:grid wt:grid-cols-2 wt:gap-2" role="radiogroup" aria-label="称重时段">
        {(["am", "pm"] as const).map(key => {
          const on = slot === key;
          const recorded = day?.[key];
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setSlot(key);
                setTyping(null);
              }}
              className={cn(
                "wt:flex wt:h-11 wt:items-center wt:justify-center wt:gap-1.5 wt:rounded-[13px] wt:text-[14px] wt:[&>svg]:size-4",
                on
                  ? "wt:bg-accent-soft wt:text-accent-text wt:font-[650] wt:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
                  : "wt:bg-hover wt:text-ink-2"
              )}
            >
              {key === "am" ? <Sunrise /> : <Sunset />}
              {SLOT_NAME[key]}
              {recorded != null && <small className="wt:text-ink-3 wt:text-[11.5px] wt:font-normal wt:tabular-nums">{recorded.toFixed(1)}</small>}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setTyping(typing == null ? "" : typing)}
        aria-label="直接输入体重"
        className="wt:block wt:w-full wt:text-center wt:leading-none"
      >
        <span className={cn("wt:text-[56px] wt:font-bold wt:tracking-[-0.04em] wt:tabular-nums", typing === "" && "wt:text-ink-3")}>
          {typing == null ? (tenths / 10).toFixed(1) : typing || (tenths / 10).toFixed(1)}
        </span>
        <small className="wt:text-ink-3 wt:ml-1 wt:text-[18px] wt:font-medium">kg</small>
      </button>
      <p className="wt:text-ink-3 wt:mt-2 wt:mb-3 wt:min-h-[19px] wt:text-center wt:text-[12.5px]">
        {valid && reference != null ? (
          <>
            {slot === "pm" ? (past ? "比当天晨重" : "比今早") : "比上次晨重"}{" "}
            <b className={value - reference <= 0 ? "wt:text-info" : "wt:text-danger"}>{signed(value - reference)}</b>
            {slot === "pm" && value - reference > 0.5 ? " · 晚上偏重很正常，趋势只看晨重" : target?.avg != null ? ` · 7 日均值 ${target.avg.toFixed(1)}` : ""}
          </>
        ) : slot === "am" ? (
          "空腹、如厕后称最准"
        ) : (
          "睡前体重只用来看当天吃得多不多"
        )}
      </p>

      {typing == null ? (
        <Ruler tenths={tenths} onChange={setTenths} mark={reference != null ? Math.round(reference * 10) : null} />
      ) : (
        <NumPad value={typing} onChange={setTyping} />
      )}

      <PrimaryButton disabled={!valid || saving} onClick={() => void save()}>
        {saveLabel(date, today, slot, existing)}
      </PrimaryButton>
    </Sheet>
  );
}

/** 近 7 天日期条：每天两颗点，左起床右睡前，实心为已称 */
function DayStrip({ ledger, today, value, onPick }: { ledger: Ledger; today: string; value: string; onPick(date: string): void }) {
  return (
    <div className="wt:mt-2.5 wt:grid wt:grid-cols-7 wt:gap-[5px]" role="radiogroup" aria-label="称重日期">
      {recentDates(today).map(date => {
        const day = ledger.byDate.get(date);
        const on = date === value;
        return (
          <button
            key={date}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(date)}
            className={cn(
              "wt:flex wt:flex-col wt:items-center wt:gap-[3px] wt:rounded-[12px] wt:pt-[7px] wt:pb-1.5 wt:text-[10.5px]",
              on
                ? "wt:bg-accent-soft wt:text-accent-text wt:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
                : "wt:text-ink-3 wt:shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
            )}
          >
            {date === today ? "今天" : weekdayOf(date).slice(1)}
            <b className={cn("wt:text-[15px] wt:font-semibold wt:tabular-nums", on ? "wt:text-accent-text" : "wt:text-ink-1")}>
              {Number(date.slice(8))}
            </b>
            <span className="wt:flex wt:gap-[3px]">
              <Mark done={day?.am != null} />
              <Mark done={day?.pm != null} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Mark({ done }: { done: boolean }) {
  return (
    <i
      aria-hidden
      className={cn(
        "wt:size-[5px] wt:rounded-full",
        done ? "wt:bg-ink-3" : "wt:shadow-[inset_0_0_0_1.2px_var(--tau-ink-3)]"
      )}
    />
  );
}

/** 刻度尺：拖动改值，指针固定在中间；mark 为参照读数的灰点 */
function Ruler({ tenths, onChange, mark }: { tenths: number; onChange(value: number): void; mark: number | null }) {
  const drag = useRef<{ x: number; start: number; id: number } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: tenths, id: e.pointerId };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const next = Math.min(MAX, Math.max(MIN, d.start - Math.round((e.clientX - d.x) / TICK)));
    if (next !== tenths) {
      onChange(next);
      navigator.vibrate?.(next % 10 === 0 ? 12 : 4);
    }
  };
  const onUp = () => {
    drag.current = null;
  };
  const span = 22;
  const ticks = [];
  for (let t = tenths - span; t <= tenths + span; t++) ticks.push(t);
  return (
    <div
      role="slider"
      aria-label="体重刻度尺"
      aria-valuemin={MIN / 10}
      aria-valuemax={MAX / 10}
      aria-valuenow={tenths / 10}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "ArrowLeft") onChange(Math.max(MIN, tenths - 1));
        if (e.key === "ArrowRight") onChange(Math.min(MAX, tenths + 1));
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      data-no-edge-back
      data-no-tab-swipe
      className="wt:relative wt:-mx-[18px] wt:mb-3.5 wt:h-16 wt:touch-none wt:overflow-hidden wt:select-none wt:[mask-image:linear-gradient(90deg,transparent,#000_22%,#000_78%,transparent)]"
    >
      <div className="wt:absolute wt:inset-x-0 wt:top-0 wt:flex wt:h-10 wt:justify-center">
        {ticks.map(t => (
          <i
            key={t}
            className={cn(
              "wt:mx-[4.25px] wt:w-[1.5px] wt:shrink-0 wt:self-start",
              t % 10 === 0 ? "wt:bg-ink-3 wt:h-[34px]" : t % 5 === 0 ? "wt:bg-line-1 wt:h-6" : "wt:bg-line-1 wt:h-4"
            )}
          />
        ))}
      </div>
      <div className="wt:text-ink-3 wt:absolute wt:inset-x-0 wt:top-10 wt:h-5 wt:text-[11px]">
        {ticks
          .filter(t => t % 10 === 0)
          .map(t => (
            <span
              key={t}
              className="wt:absolute wt:-translate-x-1/2 wt:tabular-nums"
              style={{ left: `calc(50% + ${(t - tenths) * TICK}px)` }}
            >
              {t / 10}
            </span>
          ))}
      </div>
      {mark != null && Math.abs(mark - tenths) <= span && (
        <span
          aria-hidden
          className="wt:bg-ink-3 wt:absolute wt:top-0 wt:size-[7px] wt:-translate-x-1/2 wt:rounded-full"
          style={{ left: `calc(50% + ${(mark - tenths) * TICK}px)` }}
        />
      )}
      <span aria-hidden className="wt:bg-accent wt:absolute wt:top-[-2px] wt:left-1/2 wt:h-[42px] wt:w-[3px] wt:-translate-x-1/2 wt:rounded-full" />
    </div>
  );
}

function NumPad({ value, onChange }: { value: string; onChange(value: string): void }) {
  const press = (key: string) => {
    if (key === "del") return onChange(value.slice(0, -1));
    if (key === ".") return value.includes(".") ? undefined : onChange(value ? `${value}.` : "0.");
    const [, decimals] = value.split(".");
    if (decimals != null && decimals.length >= 1) return;
    if (value.replace(".", "").length >= 4) return;
    onChange(value + key);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
  return (
    <div className="wt:mb-2.5 wt:grid wt:grid-cols-3 wt:gap-1.5">
      {keys.map(key => (
        <button
          key={key}
          type="button"
          aria-label={key === "del" ? "删除" : key}
          onClick={() => press(key)}
          className={cn(
            "wt:grid wt:h-[46px] wt:place-items-center wt:rounded-[12px] wt:text-[20px] wt:font-medium wt:active:bg-press",
            key === "." || key === "del" ? "wt:text-ink-2" : "wt:bg-hover"
          )}
        >
          {key === "del" ? <Delete className="wt:size-5" /> : key}
        </button>
      ))}
    </div>
  );
}
