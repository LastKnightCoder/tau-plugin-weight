/**
 * 页面与首页卡片的数据：按窗口读取体重与流水（多读 6 天让均值窗口完整），汇总成 Ledger。
 * 写入后由调用方 invalidate WEIGHT_KEY；跨窗口与同步写入经运行时的事件订阅刷新。
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, dateKey, timeKey } from "../data/model";
import { buildLedger, overview } from "../data/stats";
import { WEIGHT_KEY, useRuntime } from "../runtime";

/** 当前本地日期与时间，每分钟更新；页面恢复与窗口回到前台时立即校时 */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return { today: dateKey(now), time: timeKey(now), date: now };
}

export function useProfile() {
  const { data } = useRuntime();
  return useQuery({ queryKey: [...WEIGHT_KEY, "profile"], queryFn: () => data.getProfile() });
}

export function useLedger(days: number, today: string) {
  const { data } = useRuntime();
  const profile = useProfile();
  const from = addDays(today, -(days - 1));
  return useQuery({
    queryKey: [...WEIGHT_KEY, "ledger", days, today, profile.data ?? null],
    enabled: profile.isSuccess,
    queryFn: async () => {
      const readFrom = addDays(from, -6);
      // 多读明天一天，当天的次日变化才算得出（补记昨天时也能刷新）
      const readTo = addDays(today, 1);
      const [weighs, entries, firstWeigh] = await Promise.all([
        data.listWeighs(readFrom, readTo),
        data.listEntries(readFrom, readTo),
        data.firstWeigh(),
      ]);
      const ledger = buildLedger(from, today, weighs, entries, profile.data ?? null, today);
      return {
        ledger,
        overview: overview(ledger, profile.data ?? null, today, firstWeigh),
        todayEntries: entries.filter(e => e.date === today),
        profile: profile.data ?? null,
      };
    },
    placeholderData: previous => previous,
  });
}

export function useFoods() {
  const { data } = useRuntime();
  return useQuery({ queryKey: [...WEIGHT_KEY, "foods"], queryFn: () => data.getFoods() });
}

export function usePrefs() {
  const { data } = useRuntime();
  return useQuery({ queryKey: [...WEIGHT_KEY, "prefs"], queryFn: () => data.getPrefs() });
}
