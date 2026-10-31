/**
 * 手机首次打开的引导，两步：身体数据（含「现在体重」，实时预览预算）→ 三行用法 +「在今天页显示」。
 * 随时可以跳过；跳过或完成都记为已引导。也用作主卡「去填写」打开的表单（只走第一步）。
 */
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChartLine, ChevronLeft, Flame, Scale, Sunrise, UtensilsCrossed } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { ACTIVITY_LEVELS, type Sex } from "../../data/model";
import { dailyBudget, dailyBurn } from "../../data/stats";
import { WEIGHT_KEY, useRuntime } from "../../runtime";
import { toDraft, validate, type Draft } from "../SettingsForm";
import { FOOD_COLOR, MOVE_COLOR } from "../bits";
import { MCard, PrimaryButton } from "./parts";

export function Onboarding({
  profileOnly,
  today,
  latestKg,
  onDone,
  onClose,
}: {
  /** 只填身体数据（主卡「去填写」），不显示第二步 */
  profileOnly?: boolean;
  today: string;
  latestKg: number | null;
  /** 完成；weigh 为 true 时接着打开称重 */
  onDone(options: { weigh: boolean }): void;
  onClose(): void;
}) {
  const { data } = useRuntime();
  const client = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [weight, setWeight] = useState(latestKg != null ? latestKg.toFixed(1) : "");
  const [homeCard, setHomeCard] = useState(true);
  const [saving, setSaving] = useState(false);
  const year = Number(today.slice(0, 4));
  const { profile, errors } = validate(draft, year);
  const kgValue = Number(weight);
  const kgValid = weight.trim() !== "" && kgValue >= 20 && kgValue <= 400;
  const kgForBudget = kgValid ? kgValue : latestKg;
  const budget = profile && kgForBudget != null ? dailyBudget(profile, kgForBudget, year) : null;
  const burn = profile && kgForBudget != null ? Math.round(dailyBurn(profile, kgForBudget, year) / 10) * 10 : null;
  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }));

  const skip = async () => {
    await data.savePrefs({ onboarded: true }).catch(() => undefined);
    await client.invalidateQueries({ queryKey: WEIGHT_KEY });
    onClose();
  };

  const saveProfile = async () => {
    if (!profile || saving) return false;
    setSaving(true);
    try {
      await data.saveProfile(profile);
      // 「现在体重」当作今天的晨重；今天已经称过就不覆盖
      if (kgValid && latestKg == null) await data.saveWeigh(today, "am", kgValue);
      await client.invalidateQueries({ queryKey: WEIGHT_KEY });
      return true;
    } catch {
      toast.error("保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finish = async (weigh: boolean) => {
    await data.savePrefs({ onboarded: true, homeCard }).catch(() => undefined);
    await client.invalidateQueries({ queryKey: WEIGHT_KEY });
    onDone({ weigh });
  };

  return (
    <div className="wt:bg-page wt:fixed wt:inset-0 wt:z-[55] wt:flex wt:flex-col wt:pt-[env(safe-area-inset-top)]">
      <div className="wt:flex wt:h-12 wt:shrink-0 wt:items-center wt:px-1.5">
        <button
          type="button"
          aria-label={step === 2 ? "上一步" : "返回"}
          onClick={() => (step === 2 ? setStep(1) : profileOnly ? onClose() : void skip())}
          className="wt:grid wt:size-10 wt:place-items-center wt:rounded-[12px]"
        >
          <ChevronLeft className="wt:size-[23px]" />
        </button>
        <span className="wt:flex-1" />
        {!profileOnly && (
          <button type="button" onClick={() => void skip()} className="wt:text-ink-3 wt:px-3 wt:text-[14px]">
            跳过
          </button>
        )}
      </div>
      <div className="wt:min-h-0 wt:flex-1 wt:overflow-y-auto wt:overscroll-contain wt:px-4 wt:pb-3">
        {!profileOnly && (
          <div className="wt:mb-1 wt:flex wt:justify-center wt:gap-[5px]" aria-label={`第 ${step} 步，共 2 步`}>
            <i className={cn("wt:h-1 wt:rounded-full", step === 1 ? "wt:bg-accent wt:w-7" : "wt:bg-line-1 wt:w-[18px]")} />
            <i className={cn("wt:h-1 wt:rounded-full", step === 2 ? "wt:bg-accent wt:w-7" : "wt:bg-line-1 wt:w-[18px]")} />
          </div>
        )}
        {step === 1 ? (
          <>
            <Heading title="先算出你每天能吃多少" note="按身高、年龄、性别和体重估算日常消耗，再减 500 kcal" />
            <MCard className="wt:divide-y wt:divide-line-2 wt:py-0.5">
              <NumberRow label="身高" unit="cm" value={draft.heightCm} placeholder="170" error={draft.heightCm ? errors.heightCm : undefined} onChange={heightCm => set({ heightCm })} />
              <NumberRow label="出生年份" unit="年" value={draft.birthYear} placeholder="1994" error={draft.birthYear.length >= 4 ? errors.birthYear : undefined} onChange={birthYear => set({ birthYear })} />
              <Row label="性别">
                <Choice<Sex>
                  value={draft.sex}
                  onChange={sex => set({ sex })}
                  options={[
                    ["male", "男"],
                    ["female", "女"],
                  ]}
                />
              </Row>
              <NumberRow label="现在体重" unit="kg" value={weight} placeholder="70.0" onChange={setWeight} />
              <Row label="日常活动">
                <select
                  value={draft.activity}
                  onChange={e => set({ activity: e.target.value })}
                  aria-label="日常活动"
                  className="wt:text-ink-2 wt:bg-transparent wt:text-right wt:outline-none"
                >
                  {ACTIVITY_LEVELS.map(level => (
                    <option key={level.value} value={String(level.value)}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </Row>
              <NumberRow label="目标体重" unit="kg" value={draft.goalKg} placeholder="选填" error={draft.goalKg ? errors.goalKg : undefined} onChange={goalKg => set({ goalKg })} />
            </MCard>
            <MCard className="wt:bg-accent-soft wt:mt-3 wt:flex wt:items-center wt:gap-3 wt:shadow-none">
              <Flame className="wt:text-accent-text wt:size-[22px] wt:shrink-0" />
              <div className="wt:flex-1">
                <div className="wt:text-accent-text wt:text-[12px]">每日预算</div>
                <div className="wt:text-accent-text wt:text-[22px] wt:font-bold wt:tabular-nums">
                  {budget != null ? budget.toLocaleString() : "—"} <small className="wt:text-[12px] wt:font-medium">kcal</small>
                </div>
              </div>
              <div className="wt:text-accent-text wt:text-right wt:text-[11.5px] wt:leading-[1.5]">
                {burn != null ? (
                  <>
                    消耗约 {burn.toLocaleString()}
                    <br />
                    体重降了会自动下调
                  </>
                ) : (
                  "填好身高、年份和体重后显示"
                )}
              </div>
            </MCard>
          </>
        ) : (
          <>
            <Heading title="每天只做三件小事" note="少吃、多动不用打卡，记录会自动判定" />
            <MCard className="wt:py-1">
              <Tip icon={<Sunrise />} tone="var(--tau-tag-1)" title="起床称一次">
                趋势只看晨重的 7 日均值，单日波动不用在意。睡前可以再称一次，看当天吃得多不多。
              </Tip>
              <Tip icon={<UtensilsCrossed />} tone={FOOD_COLOR} title="吃之前写一句或说一句">
                「奶茶一杯」「跑步 30 分钟」，AI 在后台估算热量，常吃的东西记一次以后自动带出。
              </Tip>
              <Tip icon={<ChartLine />} tone={MOVE_COLOR} title="一两周后看效果">
                比较少吃、多动的日子第二天轻多少，看哪样对你更管用。
              </Tip>
            </MCard>
            <MCard className="wt:mt-3 wt:py-1">
              <Row label="在今天页显示减重卡片">
                <button
                  type="button"
                  role="switch"
                  aria-checked={homeCard}
                  onClick={() => setHomeCard(v => !v)}
                  className={cn("wt:relative wt:h-7 wt:w-[46px] wt:rounded-full wt:transition-colors", homeCard ? "wt:bg-accent" : "wt:bg-line-1")}
                >
                  <i className={cn("wt:absolute wt:top-[3px] wt:size-[22px] wt:rounded-full wt:bg-white wt:shadow wt:transition-[left]", homeCard ? "wt:left-[21px]" : "wt:left-[3px]")} />
                </button>
              </Row>
            </MCard>
          </>
        )}
      </div>
      <div className="wt:shrink-0 wt:px-4 wt:pt-1.5 wt:pb-[max(10px,env(safe-area-inset-bottom))]">
        {step === 1 ? (
          <PrimaryButton
            disabled={!profile || saving}
            onClick={() =>
              void saveProfile().then(ok => {
                if (!ok) return;
                if (profileOnly) onDone({ weigh: false });
                else setStep(2);
              })
            }
          >
            {profileOnly ? "保存" : "下一步"}
          </PrimaryButton>
        ) : (
          <>
            <PrimaryButton onClick={() => void finish(!kgValid)}>
              {kgValid ? (
                "开始记录"
              ) : (
                <>
                  <Scale />
                  现在称一下
                </>
              )}
            </PrimaryButton>
            {!kgValid && (
              <button type="button" onClick={() => void finish(false)} className="wt:text-ink-2 wt:block wt:w-full wt:pt-2.5 wt:text-[13px]">
                先看看
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Heading({ title, note }: { title: string; note: string }) {
  return (
    <div className="wt:px-2 wt:pt-1.5 wt:pb-3.5 wt:text-center">
      <h1 className="wt:text-[21px] wt:font-[750] wt:tracking-[-0.01em]">{title}</h1>
      <p className="wt:text-ink-3 wt:mt-1.5 wt:text-[12.5px] wt:leading-[1.6]">{note}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wt:flex wt:min-h-[50px] wt:items-center wt:gap-2.5 wt:text-[14.5px]">
      <span className="wt:min-w-0 wt:flex-1">{label}</span>
      {children}
    </div>
  );
}

function NumberRow({
  label,
  unit,
  value,
  placeholder,
  error,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  placeholder: string;
  error?: string;
  onChange(value: string): void;
}) {
  return (
    <label className="wt:flex wt:min-h-[50px] wt:flex-col wt:justify-center wt:text-[14.5px]">
      <span className="wt:flex wt:items-center wt:gap-2.5">
        <span className="wt:min-w-0 wt:flex-1">{label}</span>
        <input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          aria-invalid={error != null}
          onChange={e => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
          className="wt:placeholder:text-ink-3 wt:w-24 wt:bg-transparent wt:text-right wt:font-semibold wt:tabular-nums wt:outline-none"
        />
        <span className="wt:text-ink-3 wt:w-6 wt:text-[12.5px]">{unit}</span>
      </span>
      {error && <span className="wt:text-danger wt:pb-1.5 wt:text-right wt:text-[11.5px]">{error}</span>}
    </label>
  );
}

function Choice<T extends string>({ value, onChange, options }: { value: T; onChange(v: T): void; options: [T, string][] }) {
  return (
    <span className="wt:flex wt:gap-1.5" role="radiogroup">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "wt:h-[30px] wt:rounded-full wt:px-3.5 wt:text-[13px]",
            value === key ? "wt:bg-ink-1 wt:text-ink-inverse" : "wt:text-ink-2 wt:shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
          )}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function Tip({ icon, tone, title, children }: { icon: ReactNode; tone: string; title: string; children: ReactNode }) {
  return (
    <div className="wt:flex wt:items-start wt:gap-3 wt:py-3 wt:not-last:border-b wt:not-last:border-line-2">
      <span
        className="wt:grid wt:size-[34px] wt:shrink-0 wt:place-items-center wt:rounded-[12px] wt:[&>svg]:size-[18px]"
        style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
      >
        {icon}
      </span>
      <div>
        <b className="wt:block wt:text-[14px] wt:font-[650]">{title}</b>
        <p className="wt:text-ink-2 wt:mt-0.5 wt:text-[12.5px] wt:leading-[1.6]">{children}</p>
      </div>
    </div>
  );
}
