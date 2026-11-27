/**
 * 改一笔：文字、时间、日期、热量（± 步进，点数字可直接输入）。日期可改到过去补记昨天的饮食或运动。
 * 保存后热量记为已定，饮食记进常吃。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@tau/plugins";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "@tau/ui";
import type { Entry } from "../../data/model";
import { WEIGHT_KEY, useRuntime } from "../../runtime";
import { messages } from "../../i18n";
import { relativeDay } from "../weighing";
import { PrimaryButton, Stepper } from "./parts";
import { Sheet } from "./Sheet";
import { removeWithUndo } from "./actions";

const FIELD = "wt:flex wt:min-h-[50px] wt:items-center wt:gap-2.5 wt:text-[14.5px]";

export function EntrySheet({ entry, today, onClose }: { entry: Entry | null; today: string; onClose(): void }) {
  const runtime = useRuntime();
  const { t } = useI18n(messages);
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [kcal, setKcal] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!entry) return;
    setText(entry.text);
    setTime(entry.time);
    setDate(entry.date);
    setKcal(entry.kcal);
    setMinutes(entry.minutes);
  }, [entry]);

  const unsettled = entry != null && entry.estimate !== "ready";
  const save = async () => {
    if (!entry || !text.trim() || saving) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return;
    setSaving(true);
    try {
      const latest = (await runtime.data.getEntry(entry.id)) ?? entry;
      await runtime.data.updateEntry(latest, {
        text: text.trim(),
        date,
        time: /^\d{2}:\d{2}$/.test(time) ? time : entry.time,
        kcal,
        minutes: entry.kind === "move" ? Math.max(1, minutes) : 0,
        estimate: "ready",
      });
      if (entry.kind === "food") await runtime.data.rememberFood(text.trim(), kcal);
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      onClose();
    } catch {
      toast.error(t("common.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={entry != null}
      onClose={onClose}
      title={unsettled ? t("dl.fillKcal") : t("es.title")}
      trailing={
        entry ? (
          <button
            type="button"
            aria-label={t("es.deleteAria")}
            onClick={() => {
              onClose();
              void removeWithUndo(runtime, client, entry, t);
            }}
            className="wt:text-danger wt:grid wt:size-8 wt:place-items-center"
          >
            <Trash2 className="wt:size-[18px]" />
          </button>
        ) : null
      }
    >
      <div className="wt:mt-1.5 wt:divide-y wt:divide-line-2">
        <label className={FIELD}>
          <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">{t("es.content")}</span>
          <input
            value={text}
            onChange={e => setText(e.target.value.slice(0, 60))}
            className="wt:min-w-0 wt:flex-1 wt:bg-transparent wt:font-medium wt:outline-none"
          />
        </label>
        <label className={FIELD}>
          <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">{t("es.time")}</span>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="wt:min-w-0 wt:flex-1 wt:bg-transparent wt:outline-none"
          />
        </label>
        <label className={FIELD}>
          <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">{t("es.date")}</span>
          <span className="wt:relative wt:flex wt:flex-1 wt:items-center wt:gap-1">
            {date ? relativeDay(t, date, today) : ""}
            <ChevronRight className="wt:text-ink-3 wt:ml-auto wt:size-4" />
            <input
              type="date"
              value={date}
              max={today}
              onChange={e => e.target.value && e.target.value <= today && setDate(e.target.value)}
              aria-label={t("es.date")}
              className="wt:absolute wt:inset-0 wt:opacity-0"
            />
          </span>
        </label>
        {entry?.kind === "move" && (
          <div className={FIELD}>
            <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">{t("es.duration")}</span>
            <span className="wt:flex-1" />
            <Stepper value={minutes} onChange={setMinutes} step={5} unit={t("unit.minutes")} label={t("es.moveAria")} />
          </div>
        )}
        <div className={FIELD}>
          <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">{entry?.kind === "move" ? t("ql.burnLabel") : t("mlb.kcalLabel")}</span>
          <span className="wt:flex-1" />
          <Stepper value={kcal} onChange={setKcal} label="热量" />
        </div>
      </div>
      <p className="wt:text-ink-3 wt:px-1 wt:pt-1.5 wt:text-[11.5px] wt:leading-[1.6]">
        {entry?.estimate === "failed"
          ? t("es.failedHint")
          : entry?.kind === "food"
            ? t("es.foodHint", { text: text.trim() || t("es.thisOne") })
            : t("es.moveHint")}
      </p>
      <PrimaryButton
        className="wt:mt-3.5"
        disabled={!text.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || saving}
        onClick={() => void save()}
      >
        {t("common.save")}
      </PrimaryButton>
    </Sheet>
  );
}
