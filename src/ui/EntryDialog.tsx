/**
 * 修改一笔流水：内容、时间、日期、热量与时长（运动）。日期可改到过去补记。
 * 保存后热量记为已定，饮食记进常吃。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@tau/plugins";
import { Button, DatePicker, Dialog, DialogBody, FormField, Input, toast } from "@tau/ui";
import type { Entry } from "../data/model";
import { WEIGHT_KEY, useRuntime } from "../runtime";
import { messages } from "../i18n";

export function EntryDialog({ entry, today, onClose }: { entry: Entry | null; today: string; onClose(): void }) {
  const runtime = useRuntime();
  const { t } = useI18n(messages);
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
      toast.error(t("common.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={entry != null}
      onOpenChange={open => !open && onClose()}
      title={entry?.estimate === "failed" ? t("dl.fillKcal") : t("es.title")}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid} loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="wt:flex wt:flex-col wt:gap-3">
          <FormField label={t("es.content")}>
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
            <FormField label={t("es.time")}>
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
            <FormField label={t("es.date")}>
              {field => (
                <DatePicker {...field} value={date} onValueChange={v => v && setDate(v)} isDateDisabled={day => day > today} />
              )}
            </FormField>
          </div>
          <div className="wt:grid wt:grid-cols-2 wt:gap-3">
            <FormField label={entry?.kind === "move" ? `${t("ql.burnLabel")}（kcal）` : `${t("mlb.kcalLabel")}（kcal）`}>
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
              <FormField label={`${t("es.duration")}（${t("unit.minutes")}）`}>
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
              ? t("ed.pendingHint")
              : entry?.estimate === "failed"
                ? t("es.failedHint")
                : entry?.kind === "food"
                  ? t("ed.foodHint")
                  : t("es.moveHint")}
          </p>
        </div>
      </DialogBody>
    </Dialog>
  );
}
