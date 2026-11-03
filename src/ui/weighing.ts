/**
 * 称重面板共用（手机与桌面）：默认记到哪天哪个时段、某天的已有读数与参照、日期叫法与按钮文案。
 * 凌晨 0–4 点称重默认记到前一天睡前（睡前称重过了午夜），其余时间按 14 点分起床 / 睡前。
 */
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import { addDays, dateKey, parseDateKey, type WeighSlot } from "../data/model";
import type { Ledger } from "../data/stats";
import type { WeightData } from "../data/store";
import { WEIGHT_KEY } from "../runtime";
import { dayLabel } from "./bits";

export const LATE_NIGHT_HOUR = 4;
/** 面板里可直接换的天数（含今天），更早的从趋势页补 */
export const PICK_DAYS = 7;

export const SLOT_NAME: Record<WeighSlot, string> = { am: "起床", pm: "睡前" };

export const isLateNight = (now: Date) => now.getHours() < LATE_NIGHT_HOUR;
export const isMorning = (now: Date) => !isLateNight(now) && now.getHours() < 14;

/** slot 为空时按时间推断；凌晨点「睡前」，或未指定且昨晚还没称时，归到昨天睡前 */
export function defaultWeigh(now: Date, ledger: Ledger, slot?: WeighSlot): { date: string; slot: WeighSlot } {
  const today = dateKey(now);
  const yesterday = addDays(today, -1);
  if (isLateNight(now) && (slot === "pm" || (slot == null && ledger.byDate.get(yesterday)?.pm == null)))
    return { date: yesterday, slot: "pm" };
  return { date: today, slot: slot ?? (now.getHours() < 14 ? "am" : "pm") };
}

export interface WeighDay {
  am: number | null;
  pm: number | null;
  /** 这一天之前最近一次的晨重 / 睡前 */
  previous: { am: number | null; pm: number | null };
}

export function weighDay(ledger: Ledger, date: string): WeighDay {
  const day = ledger.byDate.get(date);
  const before = ledger.days.filter(d => d.date < date).reverse();
  return {
    am: day?.am ?? null,
    pm: day?.pm ?? null,
    previous: {
      am: before.find(d => d.am != null)?.am ?? null,
      pm: before.find(d => d.pm != null)?.pm ?? null,
    },
  };
}

export const recentDates = (today: string) =>
  Array.from({ length: PICK_DAYS }, (_, k) => addDays(today, k - PICK_DAYS + 1));

export function relativeDay(date: string, today: string): string {
  if (date === today) return "今天";
  if (date === addDays(today, -1)) return "昨天";
  return dayLabel(date);
}

/** 日期胶囊上的文字：今天、昨天带上具体日期 */
export function pillText(date: string, today: string): string {
  if (date === today) return `今天 · ${dayLabel(date)}`;
  return date === addDays(today, -1) ? `昨天 · ${dayLabel(date)}` : dayLabel(date);
}

export const weekdayOf = (date: string) => `周${"日一二三四五六"[parseDateKey(date).getDay()]}`;

/** 保存按钮：今天「记下」，其他日子写明记到哪天；已有读数为「更新」 */
export function saveLabel(date: string, today: string, slot: WeighSlot, existing: boolean): string {
  if (existing) return "更新";
  if (date === today) return "记下";
  if (date === addDays(today, -1)) return `记到昨天 · ${SLOT_NAME[slot]}`;
  const [, m, d] = date.split("-").map(Number);
  return `补记到 ${m} 月 ${d} 日 · ${SLOT_NAME[slot]}`;
}

/** 保存成功的吐司：写明记到哪天，可撤销（原来有读数就改回去，没有就删掉新记的） */
export function notifySaved(
  data: WeightData,
  client: QueryClient,
  saved: { date: string; slot: WeighSlot; kg: number; before: number | null },
  today: string
) {
  const { date, slot, kg, before } = saved;
  const text =
    date === today ? `已记录 ${kg.toFixed(1)} kg` : `已记到${relativeDay(date, today)}${SLOT_NAME[slot]} · ${kg.toFixed(1)} kg`;
  const undo = async () => {
    try {
      if (before != null) await data.saveWeigh(date, slot, before);
      else {
        const created = (await data.listWeighs(date, date)).find(w => w.slot === slot);
        if (created) await data.deleteWeigh(created);
      }
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
    } catch {
      toast.error("撤销失败");
    }
  };
  toast.success(text, { action: { label: "撤销", onClick: () => void undo() } });
}
