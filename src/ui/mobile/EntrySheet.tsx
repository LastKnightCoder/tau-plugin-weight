/**
 * 改一笔：文字、时间、热量（± 步进，点数字可直接输入）。保存后热量记为已定，饮食记进常吃。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "@tau/ui";
import type { Entry } from "../../data/model";
import { WEIGHT_KEY, useRuntime } from "../../runtime";
import { PrimaryButton, Stepper } from "./parts";
import { Sheet } from "./Sheet";
import { removeWithUndo } from "./actions";

const FIELD = "wt:flex wt:min-h-[50px] wt:items-center wt:gap-2.5 wt:text-[14.5px]";

export function EntrySheet({ entry, onClose }: { entry: Entry | null; onClose(): void }) {
  const runtime = useRuntime();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [kcal, setKcal] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!entry) return;
    setText(entry.text);
    setTime(entry.time);
    setKcal(entry.kcal);
    setMinutes(entry.minutes);
  }, [entry]);

  const unsettled = entry != null && entry.estimate !== "ready";
  const save = async () => {
    if (!entry || !text.trim() || saving) return;
    setSaving(true);
    try {
      const latest = (await runtime.data.getEntry(entry.id)) ?? entry;
      await runtime.data.updateEntry(latest, {
        text: text.trim(),
        time: /^\d{2}:\d{2}$/.test(time) ? time : entry.time,
        kcal,
        minutes: entry.kind === "move" ? Math.max(1, minutes) : 0,
        estimate: "ready",
      });
      if (entry.kind === "food") await runtime.data.rememberFood(text.trim(), kcal);
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      onClose();
    } catch {
      toast.error("修改失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={entry != null}
      onClose={onClose}
      title={unsettled ? "填热量" : "改一笔"}
      trailing={
        entry ? (
          <button
            type="button"
            aria-label="删除这一笔"
            onClick={() => {
              onClose();
              void removeWithUndo(runtime, client, entry);
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
          <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">内容</span>
          <input
            value={text}
            onChange={e => setText(e.target.value.slice(0, 60))}
            className="wt:min-w-0 wt:flex-1 wt:bg-transparent wt:font-medium wt:outline-none"
          />
        </label>
        <label className={FIELD}>
          <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">时间</span>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="wt:min-w-0 wt:flex-1 wt:bg-transparent wt:outline-none"
          />
        </label>
        {entry?.kind === "move" && (
          <div className={FIELD}>
            <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">时长</span>
            <span className="wt:flex-1" />
            <Stepper value={minutes} onChange={setMinutes} step={5} unit="分钟" label="运动时长" />
          </div>
        )}
        <div className={FIELD}>
          <span className="wt:text-ink-3 wt:w-11 wt:shrink-0">{entry?.kind === "move" ? "消耗" : "热量"}</span>
          <span className="wt:flex-1" />
          <Stepper value={kcal} onChange={setKcal} label="热量" />
        </div>
      </div>
      <p className="wt:text-ink-3 wt:px-1 wt:pt-1.5 wt:text-[11.5px] wt:leading-[1.6]">
        {entry?.estimate === "failed"
          ? "AI 没估算出来，填一个大概的数就行。"
          : entry?.kind === "food"
            ? `改过的数字会记进常吃，下次写「${text.trim() || "这个"}」直接用。`
            : "运动消耗会加回当天还能吃的热量。"}
      </p>
      <PrimaryButton className="wt:mt-3.5" disabled={!text.trim() || saving} onClick={() => void save()}>
        保存
      </PrimaryButton>
    </Sheet>
  );
}
