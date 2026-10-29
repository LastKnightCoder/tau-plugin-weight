/**
 * 一句话记录：输入「奶茶一杯」「跑步 30 分钟」，停顿后估算热量并预览记下后的余额，回车记入今天。
 * 热量依次取常吃记忆 → AI 估算；估算失败或不满意时直接改数字，改过的数字会被记住。
 * 页面与首页卡片共用。
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Footprints, SendHorizontal, Sparkles, UtensilsCrossed } from "lucide-react";
import { Button, IconButton, Spinner, cn, toast } from "@tau/ui";
import { aiErrorMessage, needsSetup } from "../ai";
import { fromMemory, type Draft } from "../data/parse";
import { WEIGHT_KEY, useRuntime } from "../runtime";
import { FOOD_COLOR, MOVE_COLOR } from "./bits";
import { useFoods } from "./queries";

const DEBOUNCE = 700;

export function QuickLog({
  today,
  time,
  remaining,
  kg,
  hasProfile,
  examples = [],
  autoFocus,
}: {
  today: string;
  time: string;
  /** 当前余额；没填身体数据时为 null，只显示热量 */
  remaining: number | null;
  kg: number | null;
  hasProfile: boolean;
  examples?: readonly string[];
  autoFocus?: boolean;
}) {
  const { data, ai, context } = useRuntime();
  const client = useQueryClient();
  const foods = useFoods();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kcalText, setKcalText] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  // 文字变化后先本地分类、查记忆；停顿后才请求 AI
  useEffect(() => {
    requestRef.current?.abort();
    setError(null);
    setEstimating(false);
    const base = text.trim() ? fromMemory(text, foods.data ?? {}) : null;
    setDraft(base);
    setKcalText(base?.kcal != null ? String(base.kcal) : "");
    if (!base || base.kcal != null) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => {
      setEstimating(true);
      ai
        .estimate(base, kg, controller.signal)
        .then(estimate => {
          if (controller.signal.aborted || context.signal.aborted) return;
          const next: Draft = {
            ...base,
            kind: estimate.kind,
            minutes: estimate.kind === "move" ? estimate.minutes || base.minutes || 30 : 0,
            kcal: estimate.kcal,
            source: "ai",
          };
          setDraft(next);
          setKcalText(String(estimate.kcal));
        })
        .catch(err => {
          if (controller.signal.aborted) return;
          const message = aiErrorMessage(err);
          if (message) setError({ message, setup: needsSetup(err) });
        })
        .finally(() => {
          if (!controller.signal.aborted) setEstimating(false);
        });
    }, DEBOUNCE);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, foods.data, ai, kg, context.signal]);

  const kcal = kcalText.trim() === "" ? null : Math.max(0, Math.round(Number(kcalText)));
  const valid = draft != null && kcal != null && Number.isFinite(kcal);
  const after = valid && remaining != null ? remaining + (draft.kind === "move" ? kcal : -kcal) : null;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await data.addEntry({
        date: today,
        time,
        kind: draft.kind,
        text: draft.text,
        kcal,
        minutes: draft.kind === "move" ? draft.minutes : 0,
      });
      if (draft.kind === "food" && (draft.source !== "memory" || kcal !== draft.kcal))
        await data.rememberFood(draft.text, kcal);
      if (context.signal.aborted) return;
      toast.success(`已记下 ${draft.text}`);
      setText("");
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      inputRef.current?.focus();
    } catch {
      toast.error("记录失败");
    } finally {
      setSaving(false);
    }
  };

  const isMove = draft?.kind === "move";
  return (
    <div className="wt:flex wt:flex-col wt:gap-2.5">
      <div className="wt:bg-hover wt:focus-within:bg-surface wt:flex wt:h-10 wt:items-center wt:gap-2 wt:rounded-[12px] wt:pr-1.5 wt:pl-3 wt:transition-[box-shadow,background] wt:duration-150 wt:ease-tau-out wt:focus-within:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]">
        <input
          ref={inputRef}
          value={text}
          autoFocus={autoFocus}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape" && text) {
              e.preventDefault();
              e.stopPropagation();
              setText("");
            }
          }}
          placeholder="吃之前先写下来：奶茶一杯 / 跑步 30 分钟"
          aria-label="一句话记录饮食或运动"
          className="wt:text-tau-body wt:placeholder:text-ink-3 wt:min-w-0 wt:flex-1 wt:bg-transparent wt:outline-none"
        />
        <IconButton aria-label="记下" disabled={!valid || saving} onClick={() => void submit()}>
          {saving ? <Spinner /> : <SendHorizontal className="wt:size-[15px]" strokeWidth={1.75} />}
        </IconButton>
      </div>

      {draft && (
        <div className="wt:bg-hover wt:flex wt:flex-col wt:gap-1.5 wt:rounded-[12px] wt:px-3 wt:py-2.5 wt:text-[12.5px]">
          <div className="wt:flex wt:items-center wt:gap-2">
            <span
              className="wt:grid wt:size-5 wt:shrink-0 wt:place-items-center wt:rounded-full"
              style={{
                background: `color-mix(in srgb, ${isMove ? MOVE_COLOR : FOOD_COLOR} 16%, transparent)`,
                color: isMove ? MOVE_COLOR : FOOD_COLOR,
              }}
            >
              {isMove ? (
                <Footprints className="wt:size-[11px]" strokeWidth={2.2} />
              ) : (
                <UtensilsCrossed className="wt:size-[11px]" strokeWidth={2.2} />
              )}
            </span>
            <span className="wt:min-w-0 wt:flex-1 wt:truncate">
              {isMove ? `${draft.text} · ${draft.minutes} 分钟` : draft.text}
            </span>
            {estimating ? (
              <span className="wt:text-ink-3 wt:inline-flex wt:items-center wt:gap-1.5 wt:text-[11.5px]">
                <Spinner />
                估算中
              </span>
            ) : (
              <label className="wt:inline-flex wt:items-baseline wt:gap-1">
                <span className="wt:text-ink-3">{isMove ? "消耗" : "≈"}</span>
                <input
                  value={kcalText}
                  inputMode="numeric"
                  onChange={e => setKcalText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder="?"
                  aria-label="热量（千卡）"
                  className="wt:border-line-1 wt:focus:border-accent wt:w-[52px] wt:rounded-[6px] wt:border wt:bg-transparent wt:px-1.5 wt:text-right wt:font-semibold wt:tabular-nums wt:outline-none"
                />
                <span className="wt:text-ink-3">kcal</span>
              </label>
            )}
          </div>
          {error ? (
            <div className="wt:text-ink-2 wt:flex wt:items-center wt:gap-2 wt:text-[12px]">
              {error.message}，可以直接填热量
              {error.setup && (
                <Button size="sm" variant="ghost" onClick={() => context.ai.openSettings()}>
                  去设置
                </Button>
              )}
            </div>
          ) : (
            valid && (
              <div className="wt:text-ink-2 wt:text-[12px]">
                {after != null ? (
                  <>
                    记下后{after < 0 ? "超出预算" : "还能吃"}{" "}
                    <b className={cn("wt:font-semibold wt:tabular-nums", after < 0 ? "wt:text-danger" : "wt:text-ink-1")}>
                      {Math.abs(after)}
                    </b>{" "}
                    kcal
                  </>
                ) : hasProfile ? null : (
                  "填写身体数据后显示还能吃多少"
                )}
                {!isMove && kcal > 0 && (
                  <span className="wt:text-ink-3">
                    {" "}
                    · 相当于散步 {Math.round(kcal / 4)} 分钟
                  </span>
                )}
                {draft.source === "ai" && (
                  <span className="wt:text-ink-3 wt:inline-flex wt:items-center wt:gap-0.5">
                    {" "}
                    · <Sparkles className="wt:size-[11px]" strokeWidth={1.75} />
                    AI 估算，可修改
                  </span>
                )}
                {draft.source === "memory" && <span className="wt:text-ink-3"> · 上次记的数</span>}
              </div>
            )
          )}
        </div>
      )}

      {!text && examples.length > 0 && (
        <div className="wt:flex wt:flex-wrap wt:gap-1.5">
          {examples.map(example => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setText(example);
                inputRef.current?.focus();
              }}
              className="wt:text-ink-2 wt:hover:text-accent-text wt:h-6 wt:rounded-full wt:px-2.5 wt:text-[11.5px] wt:shadow-[inset_0_0_0_1px_var(--tau-line-1)] wt:hover:shadow-[inset_0_0_0_1px_var(--tau-accent)]"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

