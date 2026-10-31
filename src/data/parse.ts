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

/** 语音整理：一段口语拆成若干条饮食 / 运动，各带估算热量与推断的时间 */
export interface OrganizedItem {
  kind: EntryKind;
  text: string;
  kcal: number | null;
  minutes: number;
  /** HH:MM；说话里没提时间时为 null，记入时用当前时间 */
  time: string | null;
}

export interface Organized {
  items: OrganizedItem[];
  /** 一两句评估：记下后今天怎么样、接下来吃什么、动多少；没有时为空串 */
  advice: string;
}

export const ORGANIZE_SYSTEM = `你是用户的减重记录助手。用户会用中文口语说一段今天吃了什么、做了什么运动。
把它拆成若干条记录，只输出一个 JSON 对象，不要任何其他文字：
{"items":[{"kind":"food"|"move","text":"简短名称","kcal":整数,"minutes":整数,"time":"HH:MM"|null}],"advice":"评估"}
- 每样食物或每次运动一条；同一顿里一起吃的（如「牛肉面加个蛋」）合成一条。最多 12 条。
- food：kcal 为总摄入热量，按中国常见份量估算；minutes 为 0。move：kcal 为运动本身的消耗；minutes 为时长，没说时按 30。
- time：说了「早上」「中午」「下午」「晚上」或具体时间时换算成 HH:MM（早饭 08:00、午饭 12:30、下午 15:30、晚饭 18:30、晚上 20:00），没提时为 null。
- text 保留用户说法，去掉语气词与时间词，不超过 20 个字。
- advice：结合给出的「今天」数据，用一两句话说记下这些后今天还能吃多少、建议接下来吃什么或动多少；不超过 80 字，语气平实，不用 Markdown。`;

export function organizePrompt(
  speech: string,
  today: { now: string; remaining: number | null; moveMinutes: number; moveGoal: number },
  kg: number | null
): string {
  return [
    `现在 ${today.now}`,
    today.remaining == null
      ? "还没有热量预算"
      : `记下之前今天还能吃 ${today.remaining} kcal`,
    `今天已运动 ${today.moveMinutes} 分钟，目标 ${today.moveGoal} 分钟`,
    kg != null ? `体重 ${kg.toFixed(1)} kg` : "",
    `用户说：${speech}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const TIME_RE_STRICT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseOrganized(reply: string): Organized | null {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { items, advice } = value as Record<string, unknown>;
  if (!Array.isArray(items)) return null;
  const parsed: OrganizedItem[] = [];
  for (const raw of items.slice(0, 12)) {
    if (typeof raw !== "object" || raw === null) continue;
    const { kind, text, kcal, minutes, time } = raw as Record<string, unknown>;
    if (kind !== "food" && kind !== "move") continue;
    if (typeof text !== "string" || !text.trim()) continue;
    const validKcal = typeof kcal === "number" && Number.isFinite(kcal) && kcal >= 0 && kcal <= 6000;
    parsed.push({
      kind,
      text: text.trim().slice(0, 40),
      kcal: validKcal ? Math.round(kcal) : null,
      minutes:
        kind === "move"
          ? typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
            ? Math.round(minutes)
            : 30
          : 0,
      time: typeof time === "string" && TIME_RE_STRICT.test(time) ? time : null,
    });
  }
  if (!parsed.length) return null;
  return { items: parsed, advice: typeof advice === "string" ? advice.trim().slice(0, 200) : "" };
}

/** 没有 AI 或整理失败时的退路：按逗号、句号拆句，各自本地分类，热量留空 */
export function splitSpeech(speech: string): OrganizedItem[] {
  return speech
    .split(/[，,。；;、\n]|然后|还有/)
    .map(part =>
      part
        .trim()
        .replace(/^(我|今天|刚才|刚刚)?(早上|上午|中午|下午|晚上|夜里)?(吃了|喝了|去了?)?/, "")
        .replace(/^(一)?(碗|杯|个|份)(?=\S)/, "")
        .trim()
    )
    .filter(part => part.length > 0)
    .slice(0, 12)
    .map(part => {
      const base = classify(part);
      return { kind: base.kind, text: base.text, kcal: null, minutes: base.minutes, time: null };
    });
}
