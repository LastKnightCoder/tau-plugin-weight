/**
 * 手机称重面板：默认刻度尺（每格 0.1 kg，左右拖，起点是同时段上次读数）；点大数字切到面板数字键盘。
 * 已记过的时段按钮为「更新」，可删除这一次。睡前的参照是今早晨重。
 */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Delete, Sunrise, Sunset } from "lucide-react";
import { cn, toast } from "@tau/ui";
import type { Weigh, WeighSlot } from "../../data/model";
import { WEIGHT_KEY, useRuntime } from "../../runtime";
import { dayLabel, signed } from "../bits";
import { PrimaryButton } from "./parts";
import { Sheet } from "./Sheet";

export interface WeighTarget {
  date: string;
  slot: WeighSlot;
  am: number | null;
  pm: number | null;
  /** 上一次的晨重 / 睡前（不含今天） */
  previous: { am: number | null; pm: number | null };
  avg: number | null;
  /** 今天已有的体重记录，用于删除 */
  existing: Partial<Record<WeighSlot, Weigh>>;
}

const TICK = 10; // 每 0.1 kg 的像素
const MIN = 200; // 20.0 kg，单位 0.1 kg
const MAX = 4000;

export function WeighSheet({ target, onClose }: { target: WeighTarget | null; onClose(): void }) {
  const { data, context } = useRuntime();
  const client = useQueryClient();
  const [slot, setSlot] = useState<WeighSlot>("am");
  const [tenths, setTenths] = useState(700);
  const [typing, setTyping] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setSlot(target.slot);
    setTyping(null);
  }, [target]);
  useEffect(() => {
    if (!target) return;
    const start = target[slot] ?? target.previous[slot] ?? (slot === "pm" ? target.am : null) ?? target.avg ?? 65;
    setTenths(Math.round(start * 10));
  }, [target, slot]);

  const value = typing != null ? (typing.trim() ? Number(typing) : NaN) : tenths / 10;
  const valid = Number.isFinite(value) && value >= 20 && value <= 400;
  const existing = target?.[slot] != null;
  const reference = slot === "pm" ? target?.am ?? null : target?.previous.am ?? null;

  const save = async () => {
    if (!target || !valid || saving) return;
    setSaving(true);
    try {
      await data.saveWeigh(target.date, slot, value);
      if (context.signal.aborted) return;
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      toast.success(`已记录 ${value.toFixed(1)} kg`);
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const weigh = target?.existing[slot];
    if (!weigh) return;
    try {
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

  return (
    <Sheet
      open={target != null}
      onClose={onClose}
      title="称重"
      subtitle={target ? dayLabel(target.date) : undefined}
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
      <div className="wt:mt-3 wt:mb-3.5 wt:grid wt:grid-cols-2 wt:gap-2" role="radiogroup" aria-label="称重时段">
        {(["am", "pm"] as const).map(key => {
          const on = slot === key;
          const recorded = target?.[key];
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
              {key === "am" ? "起床" : "睡前"}
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
            {slot === "pm" ? "比今早" : "比上次晨重"}{" "}
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
        {existing ? "更新" : "记下"}
      </PrimaryButton>
    </Sheet>
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
