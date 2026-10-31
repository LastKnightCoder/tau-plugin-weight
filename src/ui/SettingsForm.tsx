/**
 * 设置：身体数据（算每日预算）、目标体重、运动目标、手动预算。即时校验；保存条、⌘S 与离开确认由 Tau 提供。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsDraft, type PluginSettingsProps, type SettingsDraftChange } from "@tau/plugins";
import { Button, Input, Loading, Segmented, Select, SettingRow, toast } from "@tau/ui";
import { ACTIVITY_LEVELS, DEFAULT_MOVE_GOAL, type Profile, type Sex } from "../data/model";
import { dailyBudget } from "../data/stats";
import { WEIGHT_KEY, useRuntime } from "../runtime";
import { useLedger, useNow, useProfile } from "./queries";

export interface Draft {
  heightCm: string;
  birthYear: string;
  sex: Sex;
  activity: string;
  goalKg: string;
  moveGoal: string;
  budgetOverride: string;
}

export const toDraft = (p: Profile | null): Draft => ({
  heightCm: p ? String(p.heightCm) : "",
  birthYear: p ? String(p.birthYear) : "",
  sex: p?.sex ?? "male",
  activity: String(p?.activity ?? ACTIVITY_LEVELS[0].value),
  goalKg: p?.goalKg != null ? String(p.goalKg) : "",
  moveGoal: String(p?.moveGoal ?? DEFAULT_MOVE_GOAL),
  budgetOverride: p?.budgetOverride != null ? String(p.budgetOverride) : "",
});

const num = (s: string) => (s.trim() === "" ? null : Number(s));

const LABELS: Record<keyof Draft, string> = {
  sex: "性别",
  heightCm: "身高",
  birthYear: "出生年份",
  activity: "日常活动",
  goalKg: "目标体重",
  moveGoal: "运动目标",
  budgetOverride: "每日热量预算",
};
const UNITS: Partial<Record<keyof Draft, string>> = { heightCm: " cm", goalKg: " kg", moveGoal: " 分钟", budgetOverride: " kcal" };

function show(key: keyof Draft, value: string) {
  if (key === "sex") return value === "female" ? "女" : "男";
  if (key === "activity") return ACTIVITY_LEVELS.find(level => String(level.value) === value)?.label ?? value;
  if (!value) return key === "budgetOverride" ? "自动" : "";
  return value + (UNITS[key] ?? "");
}

/** 与已保存的值逐项对比，给保存条与离开确认 */
export function draftChanges(saved: Draft, draft: Draft): SettingsDraftChange[] {
  return (Object.keys(LABELS) as (keyof Draft)[])
    .filter(key => draft[key] !== saved[key])
    .map(key => ({ label: LABELS[key], from: show(key, saved[key]), to: show(key, draft[key]) }));
}

export function validate(d: Draft, year: number): { profile: Profile | null; errors: Partial<Record<keyof Draft, string>> } {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const height = num(d.heightCm);
  const birth = num(d.birthYear);
  const goal = num(d.goalKg);
  const move = num(d.moveGoal);
  const budget = num(d.budgetOverride);
  if (height == null || !(height >= 100 && height <= 250)) errors.heightCm = "填 100–250 之间的身高";
  if (birth == null || !Number.isInteger(birth) || birth < 1900 || birth > year - 10) errors.birthYear = "填四位出生年份";
  if (goal != null && !(goal >= 30 && goal <= 300)) errors.goalKg = "填 30–300 之间的体重";
  if (move == null || !(move >= 5 && move <= 300)) errors.moveGoal = "填 5–300 分钟";
  if (budget != null && !(budget >= 800 && budget <= 5000)) errors.budgetOverride = "填 800–5000 之间的热量";
  if (Object.keys(errors).length) return { profile: null, errors };
  return {
    profile: {
      heightCm: height!,
      birthYear: birth!,
      sex: d.sex,
      activity: Number(d.activity),
      goalKg: goal,
      moveGoal: Math.round(move!),
      budgetOverride: budget != null ? Math.round(budget) : null,
    },
    errors,
  };
}

export function SettingsForm(_: PluginSettingsProps) {
  const { data, context } = useRuntime();
  const client = useQueryClient();
  const profile = useProfile();
  const { today, date } = useNow();
  const ledger = useLedger(14, today);
  const [draft, setDraft] = useState<Draft | null>(null);
  // 有错误仍点保存后，空字段也标出错误
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (profile.isSuccess && draft == null) setDraft(toDraft(profile.data));
  }, [profile.isSuccess, profile.data, draft]);

  const year = date.getFullYear();
  const saved = profile.isSuccess ? toDraft(profile.data) : null;
  const { profile: next, errors } = draft ? validate(draft, year) : { profile: null, errors: {} };
  const changes = draft && saved ? draftChanges(saved, draft) : [];

  const save = async () => {
    if (!next) throw new Error("请先修正填写有误的项");
    await data.saveProfile(next);
    if (context.signal.aborted) return;
    await client.invalidateQueries({ queryKey: WEIGHT_KEY });
    setDraft(toDraft(next));
  };
  const reset = () => {
    setDraft(saved);
    setShowAll(false);
  };
  // 第一次填写时也没有已存值可比，草稿本身就是待保存的修改
  const hostDraft = useSettingsDraft({
    dirty: changes.length > 0 || (profile.isSuccess && profile.data == null && draft != null),
    errors: Object.keys(errors).length,
    changes,
    onInvalid: () => setShowAll(true),
    save,
    reset,
  });

  if (!draft) return <Loading minHeight={120} />;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const kgNow = ledger.data?.overview.latestAvg ?? null;
  const preview = next && kgNow != null ? dailyBudget({ ...next, budgetOverride: null }, kgNow, year) : null;
  const touched = (key: keyof Draft) => showAll || draft[key] !== "" || profile.data != null;

  // 不在 Tau 设置页里（没有宿主保存条）时用自带按钮
  const saveHere = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save();
      toast.success("已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof Draft, props: { unit: string; placeholder?: string; width?: string }) => (
    <div className="wt:flex wt:flex-col wt:items-end wt:gap-1">
      <div className="wt:flex wt:items-center wt:gap-2">
        <Input
          inputMode="decimal"
          value={draft[key]}
          placeholder={props.placeholder}
          aria-invalid={touched(key) && errors[key] != null}
          onChange={e => set({ [key]: e.target.value.replace(/[^\d.]/g, "") } as Partial<Draft>)}
          wrapperClassName={props.width ?? "wt:w-[96px]"}
          className="wt:text-right wt:tabular-nums"
        />
        <span className="wt:text-ink-3 wt:w-8 wt:text-[12px]">{props.unit}</span>
      </div>
      {touched(key) && errors[key] && <span className="wt:text-danger wt:text-[11.5px]">{errors[key]}</span>}
    </div>
  );

  return (
    <div className="wt:flex wt:flex-col">
      <SettingRow title="性别" description="用于估算基础代谢">
        <Segmented<Sex> label="性别" size="sm" value={draft.sex} onValueChange={sex => set({ sex })}>
          <Segmented.Item value="male" label="男" />
          <Segmented.Item value="female" label="女" />
        </Segmented>
      </SettingRow>
      <SettingRow title="身高">{field("heightCm", { unit: "cm", placeholder: "176" })}</SettingRow>
      <SettingRow title="出生年份">{field("birthYear", { unit: "年", placeholder: "1994" })}</SettingRow>
      <SettingRow title="日常活动" description="不含你记录的运动，运动消耗会另外加回预算">
        <Select
          size="sm"
          aria-label="日常活动"
          value={draft.activity}
          onValueChange={activity => set({ activity })}
          options={ACTIVITY_LEVELS.map(level => ({ value: String(level.value), label: `${level.label} · ${level.description}` }))}
          className="wt:w-[260px]"
        />
      </SettingRow>
      <SettingRow title="目标体重" description="可选，趋势图上显示目标线并估算还要多久">
        {field("goalKg", { unit: "kg", placeholder: "72" })}
      </SettingRow>
      <SettingRow title="运动目标" description="当天运动累计达到这么多分钟算「多动」">
        {field("moveGoal", { unit: "分钟" })}
      </SettingRow>
      <SettingRow
        title="每日热量预算"
        description={
          preview != null
            ? `按当前体重 ${kgNow!.toFixed(1)} kg 自动计算为 ${preview} kcal（日常消耗 − 500），体重下降后自动下调。想固定一个数时填在右边`
            : "留空时按身体数据和最近的体重自动计算（日常消耗 − 500）"
        }
      >
        {field("budgetOverride", { unit: "kcal", placeholder: preview != null ? String(preview) : "自动" })}
      </SettingRow>
      {!hostDraft && (
        <div className="wt:flex wt:justify-end wt:gap-2 wt:px-3 wt:pt-3">
          <Button variant="secondary" disabled={saving} onClick={reset}>
            还原
          </Button>
          <Button disabled={!next} loading={saving} onClick={() => void saveHere()}>
            保存
          </Button>
        </div>
      )}
    </div>
  );
}
