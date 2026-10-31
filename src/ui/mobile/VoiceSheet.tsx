/**
 * 语音整理：识别出的一段话交给 AI 拆成多条、各自估算，再给一两句评估；用户可删可改，「全部记下」一次写入。
 * 等不及时「先记下，后台算」：按本地拆句以估算中记下。没配模型或整理失败时退回本地拆句，热量后台估算。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { aiErrorMessage } from "../../ai";
import { splitSpeech, type OrganizedItem } from "../../data/parse";
import { useRuntime } from "../../runtime";
import { addEntries } from "./actions";
import { KindIcon, PrimaryButton, Stepper } from "./parts";
import { Sheet } from "./Sheet";

export interface VoiceRequest {
  text: string;
  today: string;
  now: string;
  remaining: number | null;
  moveMinutes: number;
  moveGoal: number;
  kg: number | null;
}

type Phase = { state: "organizing" } | { state: "ready"; advice: string } | { state: "fallback"; reason: string };

export function VoiceSheet({ request, onClose }: { request: VoiceRequest | null; onClose(): void }) {
  const runtime = useRuntime();
  const client = useQueryClient();
  const [items, setItems] = useState<OrganizedItem[]>([]);
  const [phase, setPhase] = useState<Phase>({ state: "organizing" });
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!request) return;
    // 先给出本地拆句，AI 结果回来后替换
    setItems(splitSpeech(request.text));
    setPhase({ state: "organizing" });
    setEditing(null);
    const controller = new AbortController();
    runtime.ai
      .organize(
        request.text,
        { now: request.now, remaining: request.remaining, moveMinutes: request.moveMinutes, moveGoal: request.moveGoal },
        request.kg,
        controller.signal
      )
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setPhase({ state: "ready", advice: result.advice });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        const message = aiErrorMessage(error);
        if (message === null) return;
        setPhase({ state: "fallback", reason: `${message}，热量记下后在后台估算` });
      });
    return () => controller.abort();
  }, [request, runtime.ai]);

  const save = async () => {
    if (!request || !items.length || saving) return;
    setSaving(true);
    try {
      await addEntries(
        runtime,
        client,
        items.map(item => ({
          date: request.today,
          time: item.time ?? request.now,
          kind: item.kind,
          text: item.text,
          // 整理中就记下时热量都还没有，后台估算
          kcal: phase.state === "ready" ? item.kcal : null,
          minutes: item.kind === "move" ? item.minutes : 0,
        }))
      );
      for (const item of items)
        if (phase.state === "ready" && item.kind === "food" && item.kcal != null)
          await runtime.data.rememberFood(item.text, item.kcal);
      toast.success(`已记下 ${items.length} 条`);
      onClose();
    } catch {
      toast.error("记录失败");
    } finally {
      setSaving(false);
    }
  };

  const organizing = phase.state === "organizing";
  const patch = (index: number, next: Partial<OrganizedItem>) =>
    setItems(list => list.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <Sheet
      open={request != null}
      onClose={onClose}
      title={organizing ? "正在整理" : `整理成 ${items.length} 条`}
      trailing={organizing ? <Dots /> : null}
    >
      <p className="wt:text-ink-3 wt:mb-1.5 wt:text-[12px] wt:leading-[1.6]">
        听到：<span className="wt:text-ink-2">{request?.text}</span>
      </p>
      <ul className="wt:divide-y wt:divide-line-2">
        {items.map((item, index) => (
          <li key={index} className="wt:flex wt:min-h-[52px] wt:items-center wt:gap-2.5">
            <KindIcon kind={item.kind} />
            {editing === index ? (
              <input
                autoFocus
                value={item.text}
                onChange={e => patch(index, { text: e.target.value.slice(0, 40) })}
                onBlur={() => setEditing(null)}
                onKeyDown={e => e.key === "Enter" && setEditing(null)}
                className="wt:border-accent wt:min-w-0 wt:flex-1 wt:rounded-[8px] wt:border wt:bg-transparent wt:px-2 wt:py-1 wt:text-[14px] wt:outline-none"
              />
            ) : (
              <button type="button" onClick={() => setEditing(index)} className="wt:min-w-0 wt:flex-1 wt:text-left">
                <span className="wt:block wt:truncate wt:text-[14px]">{item.text}</span>
                <small className="wt:text-ink-3 wt:text-[11px]">
                  {item.time ?? request?.now}
                  {item.kind === "move" ? ` · ${item.minutes} 分钟` : ""}
                </small>
              </button>
            )}
            {organizing ? (
              <span className="wt:bg-track wt:h-3 wt:w-10 wt:animate-pulse wt:rounded-full" aria-label="估算中" />
            ) : phase.state === "ready" && item.kcal != null ? (
              <Stepper value={item.kcal} onChange={kcal => patch(index, { kcal })} label={`${item.text} 的热量`} />
            ) : (
              <span className="wt:text-ink-3 wt:text-[11.5px]">后台估算</span>
            )}
            <button
              type="button"
              aria-label={`去掉 ${item.text}`}
              onClick={() => setItems(list => list.filter((_, i) => i !== index))}
              className="wt:text-ink-3 wt:grid wt:size-8 wt:shrink-0 wt:place-items-center"
            >
              <X className="wt:size-[15px]" />
            </button>
          </li>
        ))}
      </ul>
      {phase.state !== "fallback" ? (
        <div
          className={cn(
            "wt:my-3 wt:flex wt:gap-2 wt:rounded-[14px] wt:px-3 wt:py-2.5 wt:text-[12.5px] wt:leading-[1.7]",
            organizing ? "wt:bg-hover wt:text-ink-3" : "wt:bg-accent-soft wt:text-ink-1"
          )}
        >
          <Sparkles className="wt:text-accent-text wt:mt-[3px] wt:size-3.5 wt:shrink-0" />
          <span>{organizing ? "热量算好后给出评估…" : phase.advice || "已按你说的整理好。"}</span>
        </div>
      ) : (
        <p className="wt:text-ink-3 wt:my-3 wt:text-[12px]">{phase.reason}</p>
      )}
      {organizing ? (
        <PrimaryButton ghost disabled={!items.length || saving} onClick={() => void save()}>
          先记下，后台算
        </PrimaryButton>
      ) : (
        <PrimaryButton disabled={!items.length || saving} onClick={() => void save()}>
          全部记下
        </PrimaryButton>
      )}
    </Sheet>
  );
}

function Dots() {
  return (
    <span aria-hidden className="wt:inline-flex wt:gap-[3px]">
      {[0, 1, 2].map(i => (
        <i key={i} className="wt:bg-ink-3 wt:size-[5px] wt:animate-pulse wt:rounded-full" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
