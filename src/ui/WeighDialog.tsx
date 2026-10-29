/**
 * 称重弹窗：只记体重。按当前时间默认选起床（14 点前）或睡前，预填同时段最近一次读数。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sunrise, Sunset } from "lucide-react";
import { Button, Dialog, DialogBody, Segmented, toast } from "@tau/ui";
import type { WeighSlot } from "../data/model";
import { WEIGHT_KEY, useRuntime } from "../runtime";
import { kg } from "./bits";

export interface WeighDialogState {
  date: string;
  slot: WeighSlot;
  /** 预填值 */
  initial: number | null;
  /** 同时段的上一次读数，作为参考 */
  previous: number | null;
}

export function WeighDialog({
  state,
  onClose,
  title,
}: {
  state: WeighDialogState | null;
  onClose(): void;
  title: string;
}) {
  const { data, context } = useRuntime();
  const client = useQueryClient();
  const [slot, setSlot] = useState<WeighSlot>("am");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!state) return;
    setSlot(state.slot);
    setValue(state.initial != null ? state.initial.toFixed(1) : "");
  }, [state]);

  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 20 && parsed <= 400;
  const save = async () => {
    if (!state || !valid || saving) return;
    setSaving(true);
    try {
      await data.saveWeigh(state.date, slot, parsed);
      if (context.signal.aborted) return;
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      toast.success(`已记录 ${parsed.toFixed(1)} kg`);
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={state != null}
      onOpenChange={open => !open && onClose()}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!valid} loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </>
      }
    >
      <DialogBody>
        <Segmented<WeighSlot> label="称重时段" value={slot} onValueChange={setSlot}>
          <Segmented.Item value="am" label="起床" icon={Sunrise} />
          <Segmented.Item value="pm" label="睡前" icon={Sunset} />
        </Segmented>
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
            {state?.previous != null && <>上次 {kg(state.previous)}<br /></>}
            <span className="wt:text-ink-3">
              {slot === "am" ? "空腹、如厕后称最准" : "只用来看日内波动"}
            </span>
          </span>
        </div>
        <p className="wt:text-ink-3 wt:mt-3 wt:flex wt:items-center wt:gap-1.5 wt:text-[12px]">
          {slot === "am" ? <Sunrise className="wt:size-3.5" /> : <Sunset className="wt:size-3.5" />}
          趋势只看晨重；同一天同一时段再称一次会覆盖。
        </p>
      </DialogBody>
    </Dialog>
  );
}
