/**
 * 一句话记录的解析：先在本地判断是饮食还是运动、抽出分钟数；热量依次取常吃记忆 → AI 估算。
 * AI 的回复只接受约定的 JSON 形状，解析失败视为估算失败，由用户手填。
 */
import { foodKey, type EntryKind } from "./model";

export interface Draft {
  kind: EntryKind;
  text: string;
  minutes: number;
  /** null = 还没有估算 */
  kcal: number | null;
  source: "memory" | "ai" | "manual" | null;
}

const MOVE_WORDS =
  /跑步|慢跑|散步|快走|走路|步行|骑车|骑行|单车|游泳|跳绳|健身|撸铁|力量|瑜伽|爬山|爬楼|羽毛球|篮球|足球|网球|乒乓|操|拉伸|椭圆机|划船|动感|运动|锻炼/;
const MINUTES_RE = /(\d+(?:\.\d+)?)\s*(分钟|min|分|小时|h|个小时)/i;

/** 本地判断：含运动词或「N 分钟」的算运动；分钟数缺省 30 */
export function classify(raw: string): Pick<Draft, "kind" | "text" | "minutes"> {
  const text = raw.trim().replace(/\s+/g, " ");
  const minuteMatch = text.match(MINUTES_RE);
  const isMove = MOVE_WORDS.test(text);
  if (!isMove) return { kind: "food", text, minutes: 0 };
  let minutes = 30;
  if (minuteMatch) {
    const value = Number(minuteMatch[1]);
    minutes = /小时|h/i.test(minuteMatch[2]) ? value * 60 : value;
  }
  return { kind: "move", text, minutes: Math.max(1, Math.round(minutes)) };
}

export function fromMemory(raw: string, foods: Record<string, number>): Draft | null {
  const base = classify(raw);
  if (!base.text) return null;
  const known = base.kind === "food" ? foods[foodKey(base.text)] : undefined;
  return { ...base, kcal: known ?? null, source: known != null ? "memory" : null };
}

export const ESTIMATE_SYSTEM = `你是营养与运动热量估算助手。用户会用一句中文描述吃了什么或做了什么运动。
只输出一个 JSON 对象，不要任何其他文字：
{"kind":"food"|"move","kcal":整数,"minutes":整数,"label":"简短名称"}
- food：kcal 为这份食物的总摄入热量，按中国常见份量估算；minutes 为 0。
- move：kcal 为这次运动的消耗热量（只算运动本身，不含基础代谢）；minutes 为时长，没写时按 30。
- 用户给出体重时按体重估算运动消耗。
- label 保留用户的说法，去掉语气词，不超过 20 个字。`;

export function estimatePrompt(draft: Pick<Draft, "text">, kg: number | null): string {
  return kg != null ? `体重 ${kg.toFixed(1)} kg。${draft.text}` : draft.text;
}

export interface Estimate {
  kind: EntryKind;
  kcal: number;
  minutes: number;
  label: string;
}

export function parseEstimate(reply: string): Estimate | null {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { kind, kcal, minutes, label } = value as Record<string, unknown>;
  if (kind !== "food" && kind !== "move") return null;
  if (typeof kcal !== "number" || !Number.isFinite(kcal) || kcal < 0 || kcal > 6000) return null;
  return {
    kind,
    kcal: Math.round(kcal),
    minutes:
      kind === "move" && typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
        ? Math.round(minutes)
        : 0,
    label: typeof label === "string" ? label.trim().slice(0, 40) : "",
  };
}
