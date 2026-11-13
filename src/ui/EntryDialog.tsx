/**
 * 修改一笔流水：内容、时间、日期、热量与时长（运动）。日期可改到过去补记。
 * 保存后热量记为已定，饮食记进常吃。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, DatePicker, Dialog, DialogBody, FormField, Input, toast } from "@tau/ui";
import type { Entry } from "../data/model";
import { WEIGHT_KEY, useRuntime } from "../runtime";

export function EntryDialog({ entry, today, onClose }: { entry: Entry | null; today: string; onClose(): void }) {
  const runtime = useRuntime();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [kcal, setKcal] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!entry) return;
    setText(entry.text);
    setTime(entry.time);
    setDate(entry.date);
    setKcal(String(entry.kcal));
    setMinutes(entry.minutes > 0 ? String(entry.minutes) : "");
  }, [entry]);

  const kcalValue = Number(kcal);
  const minutesValue = Number(minutes);
  const valid =
    text.trim() !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date <= today &&
    /^\d{2}:\d{2}$/.test(time) &&
    Number.isFinite(kcalValue) &&
    kcalValue >= 0 &&
    (entry?.kind !== "move" || (Number.isFinite(minutesValue) && minutesValue >= 1));

  const save = async () => {
    if (!entry || !valid || saving) return;
    setSaving(true);
    try {
      const latest = (await runtime.data.getEntry(entry.id)) ?? entry;
      await runtime.data.updateEntry(latest, {
        text: text.trim(),
        date,
        time,
        kcal: Math.round(kcalValue),
        minutes: entry.kind === "move" ? Math.round(minutesValue) : 0,
        estimate: "ready",
      });
      if (entry.kind === "food") await runtime.data.rememberFood(text.trim(), Math.round(kcalValue));
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      onClose();
    } catch {
      toast.error("修改失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={entry != null}
      onOpenChange={open => !open && onClose()}
      title={entry?.estimate === "failed" ? "填热量" : "修改这一笔"}
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
        <div className="wt:flex wt:flex-col wt:gap-3">
          <FormField label="内容">
            {field => (
              <Input
                {...field}
                data-autofocus
                value={text}
                onChange={e => setText(e.target.value.slice(0, 60))}
                onKeyDown={e => e.key === "Enter" && !e.nativeEvent.isComposing && void save()}
              />
            )}
          </FormField>
          <div className="wt:grid wt:grid-cols-2 wt:gap-3">
            <FormField label="时间">
              {field => (
                <Input
                  {...field}
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="wt:tabular-nums"
                />
              )}
            </FormField>
            <FormField label="日期">
              {field => (
                <DatePicker {...field} value={date} onValueChange={v => v && setDate(v)} isDateDisabled={day => day > today} />
              )}
            </FormField>
          </div>
          <div className="wt:grid wt:grid-cols-2 wt:gap-3">
            <FormField label={entry?.kind === "move" ? "消耗（kcal）" : "热量（kcal）"}>
              {field => (
                <Input
                  {...field}
                  inputMode="numeric"
                  value={kcal}
                  onChange={e => setKcal(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                  className="wt:tabular-nums"
                />
              )}
            </FormField>
            {entry?.kind === "move" && (
              <FormField label="时长（分钟）">
                {field => (
                  <Input
                    {...field}
                    inputMode="numeric"
                    value={minutes}
                    onChange={e => setMinutes(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    className="wt:tabular-nums"
                  />
                )}
              </FormField>
            )}
          </div>
          <p className="wt:text-ink-3 wt:text-[12px]">
            {entry?.estimate === "pending"
              ? "这条还在 AI 估算，保存后按你填的数字算。"
              : entry?.estimate === "failed"
                ? "AI 没估算出来，填一个大概的数就行。"
                : entry?.kind === "food"
                  ? "改过的数字会记进常吃，下次写同样的直接用。"
                  : "运动消耗会加回当天还能吃的热量。"}
          </p>
        </div>
      </DialogBody>
    </Dialog>
  );
}
