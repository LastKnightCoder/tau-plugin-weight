/**
 * AI 分析卡：「今天」看余量与还差的运动，「本周」看趋势与破功规律。
 * 点「分析」才请求（不在打开页面时自动消耗额度）；结果按范围缓存到本次打开结束，数据变了提示重新分析。
 */
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button, IconButton, Segmented } from "@tau/ui";
import { aiErrorMessage, needsSetup, type AIScope, type AnalysisInput } from "../ai";
import { useRuntime } from "../runtime";
import { Card } from "./bits";

interface Result {
  text: string;
  /** 生成时的数据指纹，变了说明结果可能过时 */
  stamp: string;
  done: boolean;
}

export function AIPanel({ input, stamp }: { input: AnalysisInput; stamp: string }) {
  const { ai, context } = useRuntime();
  const [scope, setScope] = useState<AIScope>("today");
  const [results, setResults] = useState<Partial<Record<AIScope, Result>>>({});
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => () => controller.current?.abort(), []);

  const run = async (target: AIScope) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setError(null);
    setResults(r => ({ ...r, [target]: { text: "", stamp, done: false } }));
    try {
      let text = "";
      for await (const delta of ai.analyze(target, latest.current, current.signal)) {
        if (current.signal.aborted || context.signal.aborted) return;
        text += delta;
        setResults(r => ({ ...r, [target]: { text, stamp, done: false } }));
      }
      setResults(r => ({ ...r, [target]: { text, stamp, done: true } }));
    } catch (err) {
      if (current.signal.aborted) return;
      const message = aiErrorMessage(err);
      setResults(r => {
        const next = { ...r };
        delete next[target];
        return next;
      });
      if (message) setError({ message, setup: needsSetup(err) });
    }
  };

  const result = results[scope];
  const streaming = result != null && !result.done;
  const stale = result?.done && result.stamp !== stamp;
  return (
    <Card className="wt:relative wt:flex wt:flex-col wt:gap-2.5 wt:overflow-hidden wt:px-4 wt:py-3.5">
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
        <Segmented<AIScope> label="分析范围" size="sm" value={scope} onValueChange={setScope}>
          <Segmented.Item value="today" label="今天" />
          <Segmented.Item value="week" label="本周" />
        </Segmented>
        {result?.done && (
          <IconButton aria-label="重新分析" onClick={() => void run(scope)} className="wt:size-[26px]">
            <RefreshCw className="wt:size-[14px]" strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
      <div className="wt:relative wt:min-h-[72px] wt:text-[12.5px] wt:leading-[1.8]">
        {result ? (
          <Rendered text={result.text} streaming={streaming} />
        ) : error ? (
          <div className="wt:text-ink-2 wt:flex wt:flex-col wt:items-start wt:gap-2">
            {error.message}
            {error.setup ? (
              <Button size="sm" variant="secondary" onClick={() => context.ai.openSettings()}>
                去分配模型
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void run(scope)}>
                重试
              </Button>
            )}
          </div>
        ) : (
          <div className="wt:text-ink-2 wt:flex wt:flex-col wt:items-start wt:gap-2">
            {scope === "today"
              ? "根据今天已经记下的，看看晚饭还能吃多少、运动还差多少。"
              : "总结最近两周的趋势，找出容易破功的规律。"}
            <Button size="sm" variant="soft" icon={Sparkles} onClick={() => void run(scope)}>
              分析
            </Button>
          </div>
        )}
        {stale && (
          <button
            type="button"
            onClick={() => void run(scope)}
            className="wt:text-accent-text wt:mt-1.5 wt:text-[11.5px] wt:hover:underline"
          >
            记录有变化，重新分析
          </button>
        )}
      </div>
      <p className="wt:text-ink-3 wt:relative wt:text-[11px]">
        AI 只读取体重、热量和饮食运动的文字，使用「对话功能」的模型
      </p>
    </Card>
  );
}

/** 只渲染 **粗体** 与分段，其余原样显示 */
function Rendered({ text, streaming }: { text: string; streaming: boolean }) {
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
