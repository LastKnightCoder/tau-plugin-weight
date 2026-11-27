/**
 * 设置：身体数据（算每日预算）、目标体重、运动目标、手动预算。即时校验；保存条、⌘S 与离开确认由 Tau 提供。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n, useSettingsDraft, type PluginSettingsProps, type SettingsDraftChange } from "@tau/plugins";
import { Button, Input, Loading, Segmented, Select, SettingRow, toast } from "@tau/ui";
import { ACTIVITY_LEVELS, DEFAULT_MOVE_GOAL, type Profile, type Sex } from "../data/model";
import { dailyBudget } from "../data/stats";
import { WEIGHT_KEY, useRuntime } from "../runtime";
import { messages, type MessageKey, type Translate } from "../i18n";
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

const LABEL_KEYS: Record<keyof Draft, MessageKey> = {
  sex: "settings.sex",
  heightCm: "settings.heightCm",
  birthYear: "settings.birthYear",
  activity: "settings.activity",
  goalKg: "settings.goalKg",
  moveGoal: "settings.moveGoal",
  budgetOverride: "settings.budgetOverride",
};
const UNITS: Partial<Record<keyof Draft, { raw?: string; key?: MessageKey }>> = {
  heightCm: { raw: "cm" },
  goalKg: { raw: "kg" },
  birthYear: { key: "unit.year" },
  moveGoal: { key: "unit.minutes" },
  budgetOverride: { raw: "kcal" },
};

function show(t: Translate, key: keyof Draft, value: string) {
  if (key === "sex") return t(value === "female" ? "settings.female" : "settings.male");
  if (key === "activity") {
    const level = ACTIVITY_LEVELS.find(item => String(item.value) === value);
    return level ? t(level.labelKey) : value;
  }
  if (!value) return key === "budgetOverride" ? t("settings.auto") : "";
  const unit = UNITS[key];
  return `${value} ${unit?.key ? t(unit.key) : unit?.raw ?? ""}`.replace(/ $/, "");
}

/** 与已保存的值逐项对比，给保存条与离开确认；文案在调用时按当前语言解析 */
export function draftChanges(saved: Draft, draft: Draft, t: Translate): SettingsDraftChange[] {
  return (Object.keys(LABEL_KEYS) as (keyof Draft)[])
    .filter(key => draft[key] !== saved[key])
    .map(key => ({
      label: t(LABEL_KEYS[key]),
      from: show(t, key, saved[key]),
      to: show(t, key, draft[key]),
    }));
}

export function validate(d: Draft, year: number): { profile: Profile | null; errors: Partial<Record<keyof Draft, MessageKey>> } {
  const errors: Partial<Record<keyof Draft, MessageKey>> = {};
  const height = num(d.heightCm);
  const birth = num(d.birthYear);
  const goal = num(d.goalKg);
  const move = num(d.moveGoal);
  const budget = num(d.budgetOverride);
  if (height == null || !(height >= 100 && height <= 250)) errors.heightCm = "settings.errHeight";
  if (birth == null || !Number.isInteger(birth) || birth < 1900 || birth > year - 10) errors.birthYear = "settings.errBirth";
  if (goal != null && !(goal >= 30 && goal <= 300)) errors.goalKg = "settings.errGoal";
  if (move == null || !(move >= 5 && move <= 300)) errors.moveGoal = "settings.errMove";
  if (budget != null && !(budget >= 800 && budget <= 5000)) errors.budgetOverride = "settings.errBudget";
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
  const { t } = useI18n(messages);
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
  const changes = draft && saved ? draftChanges(saved, draft, t) : [];

  const save = async () => {
    if (!next) throw new Error(t("settings.fixErrors"));
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
      toast.success(t("common.saved"));
    } catch {
      toast.error(t("common.saveFailed"));
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
      {touched(key) && errors[key] && <span className="wt:text-danger wt:text-[11.5px]">{t(errors[key])}</span>}
    </div>
  );

  return (
    <div className="wt:flex wt:flex-col">
      <SettingRow title={t("settings.sex")} description={t("settings.sexDesc")}>
        <Segmented<Sex> label={t("settings.sex")} size="sm" value={draft.sex} onValueChange={sex => set({ sex })}>
          <Segmented.Item value="male" label={t("settings.male")} />
          <Segmented.Item value="female" label={t("settings.female")} />
        </Segmented>
      </SettingRow>
      <SettingRow title={t("settings.heightCm")}>{field("heightCm", { unit: "cm", placeholder: "176" })}</SettingRow>
      <SettingRow title={t("settings.birthYear")}>{field("birthYear", { unit: t("unit.year"), placeholder: "1994" })}</SettingRow>
      <SettingRow title={t("settings.activity")} description={t("settings.activityDesc")}>
        <Select
          size="sm"
          aria-label={t("settings.activity")}
          value={draft.activity}
          onValueChange={activity => set({ activity })}
          options={ACTIVITY_LEVELS.map(level => ({
            value: String(level.value),
            label: `${t(level.labelKey)} · ${t(level.descriptionKey)}`,
          }))}
          className="wt:w-[260px]"
        />
      </SettingRow>
      <SettingRow title={t("settings.goalKg")} description={t("settings.goalDesc")}>
        {field("goalKg", { unit: "kg", placeholder: "72" })}
      </SettingRow>
      <SettingRow title={t("settings.moveGoal")} description={t("settings.moveDesc")}>
        {field("moveGoal", { unit: t("unit.minutes") })}
      </SettingRow>
      <SettingRow
        title={t("settings.budgetOverride")}
        description={
          preview != null
            ? t("settings.budgetPreview", { kg: kgNow!.toFixed(1), preview: String(preview) })
            : t("settings.budgetAuto")
        }
      >
        {field("budgetOverride", { unit: "kcal", placeholder: preview != null ? String(preview) : t("settings.auto") })}
      </SettingRow>
      {!hostDraft && (
        <div className="wt:flex wt:justify-end wt:gap-2 wt:px-3 wt:pt-3">
          <Button variant="secondary" disabled={saving} onClick={reset}>
            {t("common.reset")}
          </Button>
          <Button disabled={!next} loading={saving} onClick={() => void saveHere()}>
            {t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
