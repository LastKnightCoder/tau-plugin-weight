/**
 * AI：沿用用户为「对话功能」分配的模型（manifest 声明 ai:chat，首次使用时 Tau 询问授权）。
 * 只发送插件算好的汇总：每日体重、摄入、运动与饮食文字，不发送照片，也不读取其他笔记。
 */
import type { PluginAICapabilityClient, PluginContext } from "@tau/plugins";
import {
  ESTIMATE_SYSTEM,
  ORGANIZE_SYSTEM,
  estimatePrompt,
  organizePrompt,
  parseEstimate,
  parseOrganized,
  type Draft,
  type Estimate,
  type Organized,
} from "./data/parse";
import type { Entry, Profile } from "./data/model";
import type { DaySummary, Overview } from "./data/stats";
import { compareGroups } from "./data/stats";

export type AIScope = "today" | "week";

export function createAI(context: Pick<PluginContext, "ai">) {
  let client: Promise<PluginAICapabilityClient> | null = null;
  const model = () => {
    // 授权被拒或未配置模型时允许下次重新申请
    client ??= context.ai.requestCapability("chat").catch(error => {
      client = null;
      throw error;
    });
    return client;
  };

  return {
    async estimate(draft: Pick<Draft, "text">, kg: number | null, signal?: AbortSignal): Promise<Estimate> {
      const result = await (await model()).chat({
        messages: [
          { role: "system", content: ESTIMATE_SYSTEM },
          { role: "user", content: estimatePrompt(draft, kg) },
        ],
        maxOutputTokens: 200,
        signal,
      });
      const estimate = parseEstimate(result.text);
      if (!estimate) throw new Error("AI_BAD_REPLY：没有得到可用的热量估算");
      return estimate;
    },

    /** 语音整理：拆条、估算并给一两句评估 */
    async organize(
      speech: string,
      today: Parameters<typeof organizePrompt>[1],
      kg: number | null,
      signal?: AbortSignal
    ): Promise<Organized> {
      const result = await (await model()).chat({
        messages: [
          { role: "system", content: ORGANIZE_SYSTEM },
          { role: "user", content: organizePrompt(speech, today, kg) },
        ],
        maxOutputTokens: 900,
        signal,
      });
      const organized = parseOrganized(result.text);
      if (!organized) throw new Error("AI_BAD_REPLY：没有整理出可用的记录");
      return organized;
    },

    async *analyze(scope: AIScope, input: AnalysisInput, signal?: AbortSignal) {
      const stream = (await model()).stream({
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM },
          { role: "user", content: analysisPrompt(scope, input) },
        ],
        maxOutputTokens: 700,
        signal,
      });
      for await (const event of stream) if (event.type === "text") yield event.delta;
    },
  };
}

export type WeightAI = ReturnType<typeof createAI>;

export const ANALYSIS_SYSTEM = `你是用户的减重陪伴助手，用户的方法只有两个：少吃（不超过每日热量预算）和多动（运动达到目标分钟数）。
根据用户提供的数据给出简短、具体、可执行的中文反馈：
- 先说结论，再给一到两条下一步建议；总共不超过 120 字，分成 2 段以内。
- 数字直接引用数据，不编造；单日体重波动在 ±0.5 kg 内属于正常，提醒用户看均值。
- 语气平实、鼓励但不吹捧，不做医学诊断；不要使用 Markdown 标题和列表符号，可以用 **粗体** 强调关键数字。`;

export interface AnalysisInput {
  now: string;
  profile: Profile | null;
  overview: Overview;
  days: readonly DaySummary[];
  todayEntries: readonly Entry[];
}

const fmt = (v: number | null, digits = 1) => (v == null ? "无" : v.toFixed(digits));

export function analysisPrompt(scope: AIScope, input: AnalysisInput): string {
  const { overview: o, profile, days, todayEntries, now } = input;
  const t = o.today;
  const lines = [
    `现在：${t.date} ${now}`,
    `目标体重：${fmt(profile?.goalKg ?? null)} kg；运动目标：每天 ${profile?.moveGoal ?? 30} 分钟`,
    `7 日均值：${fmt(o.latestAvg, 2)} kg；近两周速率：${fmt(o.rate, 2)} kg/周；距目标：${fmt(o.toGoal)} kg`,
    `少吃连续 ${o.eatStreak} 天；本周多动 ${o.weekMoveDays} 天`,
  ];
  if (scope === "today") {
    lines.push(
      `今天：晨重 ${fmt(t.am)}，预算 ${t.budget} kcal，已吃 ${t.intake}，运动消耗 ${t.burn}，还能吃 ${t.remaining}，运动 ${t.moveMinutes} 分钟`,
      "今天的记录：",
      ...(todayEntries.length
        ? todayEntries.map(e =>
            e.kind === "food"
              ? `- ${e.time} 吃 ${e.text}（${e.kcal} kcal）`
              : `- ${e.time} ${e.text}（${e.minutes} 分钟，消耗 ${e.kcal} kcal）`
          )
        : ["- 还没有记录"]),
      "请针对今天剩下的时间给建议（晚饭吃多少、还差多少运动）。"
    );
  } else {
    lines.push("最近 14 天（日期 晨重 均值 摄入/预算 运动分钟 次日晨重变化）：");
    for (const d of days.slice(-14))
      lines.push(
        `- ${d.date} ${fmt(d.am)} ${fmt(d.avg, 2)} ${d.foodCount ? d.intake : "未记"}/${d.budget} ${d.moveMinutes} ${d.next == null ? "无" : d.next.toFixed(1)}`
      );
    const groups = compareGroups(days);
    lines.push(
      "按做到情况分组的次日晨重平均变化：" +
        groups.map(g => `${g.name} ${g.mean == null ? "无" : g.mean.toFixed(2)}（${g.days} 天）`).join("，"),
      "请总结这段时间的趋势，指出容易破功的规律（例如周几、哪类食物），给出下周的建议。"
    );
  }
  return lines.join("\n");
}

/** 错误代码 → 给用户看的提示；返回 null 表示不用提示（已取消） */
export function aiErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/AI_ABORTED|AbortError/.test(message) || (error instanceof Error && error.name === "AbortError"))
    return null;
  if (message.startsWith("AI_NOT_CONFIGURED")) return "还没有为「对话功能」分配模型";
  if (message.startsWith("AI_DISABLED")) return "没有授权使用 AI";
  if (message.startsWith("AI_QUOTA_EXCEEDED")) return "今天的 AI 额度已用完";
  if (message.startsWith("AI_CONCURRENCY_LIMIT")) return "AI 正忙，稍后再试";
  if (message.startsWith("AI_UNAVAILABLE")) return "当前设备不支持 AI";
  if (message.startsWith("AI_BAD_REPLY")) return "AI 没给出可用的热量，请手动填写";
  return "AI 请求失败";
}

export const needsSetup = (error: unknown) =>
  error instanceof Error && /^AI_NOT_CONFIGURED/.test(error.message);
