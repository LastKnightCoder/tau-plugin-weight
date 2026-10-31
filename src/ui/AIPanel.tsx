/**
 * AI 分析卡：「今天」看余量与还差的运动，「本周」看趋势与破功规律。
 * 点「分析」才请求（不在打开页面时自动消耗额度）；结果按范围缓存到本次打开结束，数据变了提示重新分析。
 */
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button, IconButton, Segmented, cn } from "@tau/ui";
import { aiErrorMessage, needsSetup, type AIScope, type AnalysisInput } from "../ai";
import { useRuntime } from "../runtime";
import { Card } from "./bits";

interface Result {
  text: string;
  /** 生成时的数据指纹，变了说明结果可能过时 */
  stamp: string;
  done: boolean;
}

export function AIPanel({ input, stamp, className }: { input: AnalysisInput; stamp: string; className?: string }) {
  const { ai, context } = useRuntime();
  const [scope, setScope] = useState<AIScope>("today");
  const [results, setResults] = useState<Partial<Record<AIScope, Result>>>({});
  const [error, setError] = useState<{ scope: AIScope; message: string; setup: boolean } | null>(null);
  const [running, setRunning] = useState<AIScope | null>(null);
  const [contentHeight, setContentHeight] = useState(72);
  const content = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => () => controller.current?.abort(), []);

  const run = async (target: AIScope) => {
    if (controller.current && !controller.current.signal.aborted) return;
    setContentHeight(content.current?.getBoundingClientRect().height ?? 72);
    const current = new AbortController();
    controller.current = current;
    setRunning(target);
    setError(null);
    setResults(r => ({ ...r, [target]: { text: "", stamp, done: false } }));
    try {
      let text = "";
      for await (const delta of ai.analyze(target, latest.current, current.signal)) {
        if (current.signal.aborted || context.signal.aborted) return;
        text += delta;
        setResults(r => ({ ...r, [target]: { text, stamp, done: false } }));
      }
      if (current.signal.aborted || context.signal.aborted) return;
      setResults(r => ({ ...r, [target]: { text, stamp, done: true } }));
    } catch (err) {
      if (current.signal.aborted) return;
      const message = aiErrorMessage(err);
      setResults(r => {
        const next = { ...r };
        delete next[target];
        return next;
      });
      if (message) setError({ scope: target, message, setup: needsSetup(err) });
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setRunning(null);
      }
    }
  };

  const result = results[scope];
  const streaming = running === scope;
  const visibleError = error?.scope === scope ? error : null;
  const stale = result?.done && result.stamp !== stamp;
  return (
    <Card className={cn("wt:relative wt:flex wt:flex-col wt:gap-2.5 wt:overflow-hidden wt:px-4 wt:py-3.5", className)}>
      <div
        aria-hidden
        className="wt:pointer-events-none wt:absolute wt:inset-0"
        style={{ background: "radial-gradient(120% 140% at 100% 0%, var(--tau-accent-soft), transparent 55%)" }}
      />
      <div className="wt:relative wt:flex wt:items-center wt:gap-2">
        <span className="wt:bg-accent-soft wt:text-accent-text wt:grid wt:size-[22px] wt:place-items-center wt:rounded-[7px]">
          <Sparkles className="wt:size-[13px]" strokeWidth={1.75} />
        </span>
        <b className="wt:text-[13px] wt:font-semibold">AI</b>
        <span className="wt:flex-1" />
        <Segmented<AIScope> label="分析范围" size="sm" value={scope} onValueChange={next => {
          if (next === scope) return;
          setScope(next);
          setContentHeight(72);
        }}>
          <Segmented.Item value="today" label="今天" />
          <Segmented.Item value="week" label="本周" />
        </Segmented>
        {result?.done && (
          <IconButton aria-label="重新分析" disabled={running !== null} onClick={() => void run(scope)} className="wt:size-[26px]">
            <RefreshCw className="wt:size-[14px]" strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
      <div
        ref={content}
        style={{ minHeight: contentHeight }}
        aria-busy={streaming}
        className="wt:relative wt:min-h-[72px] wt:text-[12.5px] wt:leading-[1.8]"
      >
        {result && (result.text || result.done) ? (
          <Rendered text={result.text} streaming={streaming} />
        ) : (
          <p className="wt:text-ink-2">
            {streaming
              ? "正在分析，请稍候…"
              : visibleError
                ? visibleError.message
                : scope === "today"
                  ? "根据今天已经记下的，看看晚饭还能吃多少、运动还差多少。"
                  : "总结最近两周的趋势，找出容易破功的规律。"}
          </p>
        )}
        {!result?.done && (
          <Button
            className="wt:mt-2"
            size="sm"
            variant={visibleError ? "secondary" : "soft"}
            disabled={running !== null}
            icon={Sparkles}
            onClick={() => visibleError?.setup ? void context.ai.openSettings() : void run(scope)}
          >
            {streaming ? "分析中…" : visibleError?.setup ? "去分配模型" : visibleError ? "重试" : "分析"}
          </Button>
        )}
        {stale && (
          <button
            type="button"
            onClick={() => void run(scope)}
            disabled={running !== null}
            className="wt:text-accent-text wt:mt-1.5 wt:text-[11.5px] wt:hover:underline"
          >
            记录有变化，重新分析
          </button>
        )}
      </div>
      <p className="wt:text-ink-3 wt:relative wt:mt-auto wt:text-[11px]">
        AI 只读取体重、热量和饮食运动的文字，使用「对话功能」的模型
      </p>
    </Card>
  );
}

/** 只渲染 **粗体** 与分段，其余原样显示 */
export function Rendered({ text, streaming }: { text: string; streaming: boolean }) {
  const paragraphs = text.split(/\n{1,}/).filter(p => p.trim());
  return (
    <div className="wt:flex wt:flex-col wt:gap-2">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <b key={k} className="wt:font-semibold">
                {part.slice(2, -2)}
              </b>
            ) : (
              part
            )
          )}
          {streaming && i === paragraphs.length - 1 && <Caret />}
        </p>
      ))}
      {streaming && paragraphs.length === 0 && (
        <p>
          <Caret />
        </p>
      )}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="wt:bg-accent wt:ml-0.5 wt:inline-block wt:h-3.5 wt:w-[7px] wt:animate-pulse wt:rounded-[2px] wt:align-[-2px]"
    />
  );
}
