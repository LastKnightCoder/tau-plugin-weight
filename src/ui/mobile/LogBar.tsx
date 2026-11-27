/**
 * 页底记录条：一句话 + 麦克风 + 发送。常吃命中时浮出预览（± 步进与记下后的余额）；
 * 没记过的直接发送，以「估算中」记下、AI 在后台补热量。按住麦克风说一段话交给 VoiceSheet 整理。
 */
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@tau/plugins";
import { ArrowUp, History, Mic, Sparkles } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { classify, fromMemory } from "../../data/parse";
import { dateKey, foodKey, timeKey } from "../../data/model";
import { useRuntime } from "../../runtime";
import { messages } from "../../i18n";
import { FOOD_COLOR } from "../bits";
import { useFoods } from "../queries";
import { addEntries } from "./actions";
import { KindIcon, Stepper } from "./parts";
import { useHoldToTalk, type HoldToTalk } from "./useHoldToTalk";

export interface LogBarHandle {
  /** 预填文字并聚焦（占位行「晚饭」、首页卡片「记一笔」） */
  fill(text: string): void;
}

/** 常吃胶囊：按最近记住的顺序（记忆对象后写入的在后） */
function recentFoods(foods: Record<string, number>, limit = 8) {
  return Object.entries(foods).slice(-limit).reverse();
}

export function LogBar({
  ref,
  remaining,
  eaten,
  onVoice,
  chips = true,
}: {
  ref?: Ref<LogBarHandle>;
  /** 当前余额；没填身体数据时为 null */
  remaining: number | null;
  eaten: number;
  /** 语音识别出文字后交给整理面板 */
  onVoice(text: string): void;
  chips?: boolean;
}) {
  const runtime = useRuntime();
  const { t } = useI18n(messages);
  const client = useQueryClient();
  const foods = useFoods();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [kcal, setKcal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    fill(value) {
      setText(value);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      });
    },
  }));

  // 常吃命中时带出热量；没命中留空，发送后后台估算
  const memory = text.trim() ? fromMemory(text, foods.data ?? {}) : null;
  const memoryKcal = memory?.kcal ?? null;
  useEffect(() => setKcal(memoryKcal), [memoryKcal, text]);
  const typed = text.match(/(\d{2,4})\s*(kcal|千卡|大卡|卡)?\s*$/i);
  const draft = memory ?? (text.trim() ? { ...classify(text), kcal: null, source: null } : null);
  // 句末写了数字（「奶茶一杯 380」）就用这个数
  const manualKcal = draft && draft.kind === "food" && typed && memoryKcal == null ? Number(typed[1]) : null;
  const effective = kcal ?? manualKcal;
  const after = effective != null && remaining != null && draft ? remaining + (draft.kind === "move" ? effective : -effective) : null;

  const talk = useHoldToTalk({
    onText: onVoice,
    onError: message => toast.info(message),
  });

  const submit = async (value = text, presetKcal = effective) => {
    const base = value.trim() ? classify(value) : null;
    if (!base || saving) return;
    const label = manualKcal != null && value === text ? base.text.replace(typed![0], "").trim() || base.text : base.text;
    setSaving(true);
    try {
      const now = new Date();
      const [entry] = await addEntries(runtime, client, [
        { date: dateKey(now), time: timeKey(now), kind: base.kind, text: label, kcal: presetKcal, minutes: base.kind === "move" ? base.minutes : 0 },
      ]);
      if (presetKcal != null && base.kind === "food" && presetKcal !== memoryKcal)
        await runtime.data.rememberFood(label, presetKcal);
      setText("");
      inputRef.current?.blur();
      if (presetKcal == null) toast.info(t("mlb.savedPending", { text: entry.text }));
      else if (after != null)
        toast.success(after < 0 ? t("mlb.savedOver", { kcal: -after }) : t("mlb.savedLeft", { kcal: after }), {
          action: {
            label: t("common.undo"),
            onClick: () => void import("./actions").then(m => m.removeWithUndo(runtime, client, entry, t)),
          },
        });
      else toast.success(t("mlb.saved", { text: entry.text }));
    } catch {
      toast.error(t("common.logFailed"));
    } finally {
      setSaving(false);
    }
  };

  const chipList = recentFoods(foods.data ?? {});
  const showChips = chips && !text && chipList.length > 0;
  const showPreview = draft != null && focused;

  return (
    <div data-kb-optout="true" className="wt:bg-page wt:shrink-0 wt:px-3 wt:py-2">
      {talk.active ? (
        <TalkPanel talk={talk} />
      ) : showPreview ? (
        <div className="wt:bg-surface wt:shadow-float wt:mb-2 wt:rounded-[20px] wt:px-3.5 wt:py-3">
          <div className="wt:flex wt:items-center wt:gap-2.5">
            <KindIcon kind={draft.kind} size={34} />
            <span className="wt:min-w-0 wt:flex-1">
              <b className="wt:block wt:truncate wt:text-[14px] wt:font-semibold">
                {draft.kind === "move" ? `${draft.text}` : draft.text}
              </b>
              <small className="wt:text-accent-text wt:flex wt:items-center wt:gap-1 wt:text-[11.5px]">
                {effective != null ? (
                  <>
                    <History className="wt:size-[11px]" />
                    {memoryKcal != null ? t("mlb.memoryHit", { kcal: memoryKcal }) : t("mlb.manualKcal")}
                  </>
                ) : (
                  <>
                    <Sparkles className="wt:size-[11px]" />
                    {draft.kind === "move" ? t("mlb.movePrefix", { minutes: draft.minutes }) : ""}
                    {t("mlb.aiBackground")}
                  </>
                )}
              </small>
            </span>
            {effective != null && <Stepper value={effective} onChange={setKcal} label={t("mlb.kcalLabel")} />}
          </div>
          {after != null && draft.kind === "food" && (
            <div className="wt:border-line-1 wt:text-ink-2 wt:mt-2.5 wt:flex wt:items-center wt:gap-2 wt:border-t wt:border-dashed wt:pt-2.5 wt:text-[12.5px]">
              {after < 0 ? t("mlb.afterOver") : t("mlb.afterLeft")}{" "}
              <b className={cn("wt:tabular-nums", after < 0 ? "wt:text-danger" : "wt:text-ink-1")}>{Math.abs(after)}</b>
              <Meter eaten={eaten} adding={effective!} total={eaten + (remaining ?? 0)} />
            </div>
          )}
        </div>
      ) : showChips ? (
        <div className="wt:scrollbar-none wt:-mx-3 wt:mb-2 wt:flex wt:gap-1.5 wt:overflow-x-auto wt:px-3" data-no-tab-swipe>
          {chipList.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => void submit(key, value)}
              className="wt:bg-surface wt:text-ink-2 wt:flex wt:h-[30px] wt:shrink-0 wt:items-center wt:gap-1.5 wt:rounded-full wt:px-3 wt:text-[12.5px] wt:shadow-[inset_0_0_0_1px_var(--tau-line-1)] wt:active:bg-press"
            >
              {key}
              <span className="wt:text-ink-3 wt:text-[11px] wt:tabular-nums">{value}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="wt:bg-surface wt:shadow-float wt:flex wt:min-h-[52px] wt:items-center wt:gap-1.5 wt:rounded-[24px] wt:py-1.5 wt:pr-1.5 wt:pl-4">
        <input
          ref={inputRef}
          value={text}
          enterKeyHint="send"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={e => setText(e.target.value.slice(0, 60))}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t("mlb.placeholder")}
          aria-label={t("ql.aria")}
          className="wt:placeholder:text-ink-3 wt:min-w-0 wt:flex-1 wt:bg-transparent wt:text-[15px] wt:outline-none"
        />
        {text.trim() ? (
          <button
            type="button"
            aria-label={t("common.saveEntry")}
            disabled={saving}
            // 按下时不让输入框失焦，避免键盘先收起再提交
            onPointerDown={e => e.preventDefault()}
            onClick={() => void submit()}
            className="wt:bg-accent wt:text-ink-inverse wt:grid wt:size-10 wt:shrink-0 wt:place-items-center wt:rounded-full wt:disabled:opacity-40"
          >
            <ArrowUp className="wt:size-[19px]" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("hold.micAria")}
            {...talk.bind}
            className={cn(
              "wt:grid wt:size-10 wt:shrink-0 wt:touch-none wt:place-items-center wt:rounded-full wt:select-none",
              talk.unavailable ? "wt:text-ink-3" : "wt:bg-accent-soft wt:text-accent-text"
            )}
          >
            <Mic className="wt:size-5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Meter({ eaten, adding, total }: { eaten: number; adding: number; total: number }) {
  if (total <= 0) return null;
  const a = Math.min(100, (eaten / total) * 100);
  const b = Math.min(100 - a, (adding / total) * 100);
  return (
    <span className="wt:bg-track wt:relative wt:h-1.5 wt:flex-1 wt:overflow-hidden wt:rounded-full" aria-hidden>
      <i className="wt:absolute wt:inset-y-0 wt:left-0 wt:rounded-full" style={{ width: `${a}%`, background: FOOD_COLOR }} />
      <i
        className="wt:absolute wt:inset-y-0"
        style={{ left: `${a}%`, width: `${b}%`, background: `color-mix(in srgb, ${FOOD_COLOR} 45%, transparent)` }}
      />
    </span>
  );
}

function TalkPanel({ talk }: { talk: HoldToTalk }) {
  const { t } = useI18n(messages);
  return (
    <div className="wt:bg-surface wt:shadow-float wt:mb-2 wt:rounded-[20px] wt:px-3.5 wt:pt-4 wt:pb-3.5 wt:text-center">
      <p className="wt:min-h-[44px] wt:text-left wt:text-[15px] wt:leading-[1.6] wt:font-semibold">
        {talk.preview || <span className="wt:text-ink-3 wt:font-normal">{talk.connecting ? t("hold.connecting") : t("hold.talkHint")}</span>}
      </p>
      <Wave live={!talk.connecting} cancel={talk.cancelArmed} />
      <p className={cn("wt:text-[11.5px]", talk.cancelArmed ? "wt:text-danger" : "wt:text-ink-3")}>
        {talk.cancelArmed ? t("hold.cancelHint") : t("hold.sendHint")}
      </p>
    </div>
  );
}

function Wave({ live, cancel }: { live: boolean; cancel: boolean }) {
  return (
    <div aria-hidden className="wt:my-2.5 wt:flex wt:h-[30px] wt:items-center wt:justify-center wt:gap-[3px]">
      {Array.from({ length: 30 }, (_, i) => (
        <i
          key={i}
          className={cn("wt:block wt:w-[3px] wt:rounded-full", cancel ? "wt:bg-danger" : "wt:bg-accent", !live && "wt:opacity-30")}
          style={{ height: 5 + ((i * 17 + i * i * 3) % 24), animation: live ? `wt-wave 1s ${(i % 7) * 0.08}s ease-in-out infinite alternate` : undefined }}
        />
      ))}
    </div>
  );
}

export { foodKey };
