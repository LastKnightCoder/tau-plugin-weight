/**
 * 每日流水：按时间排列选中日期的饮食与运动，点行修改或删除（删除可撤销）。
 * 今天保留晚饭与运动建议；历史日期提供补录和补晨重入口。
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Footprints, Sparkles, Trash2, UtensilsCrossed } from "lucide-react";
import { useI18n } from "@tau/plugins";
import { IconButton, Loading, toast } from "@tau/ui";
import type { Entry } from "../data/model";
import type { DaySummary } from "../data/stats";
import { WEIGHT_KEY, useRuntime } from "../runtime";
import { messages } from "../i18n";
import { EntryDialog } from "./EntryDialog";
import { Card, CardHead, FOOD_COLOR, MOVE_COLOR, dayLabel } from "./bits";

export function DayList({
  entries,
  date,
  today,
  time,
  day,
  loading,
  error,
  moveGoal,
  onFocusLog,
  onWeigh,
  onRetry,
}: {
  entries: readonly Entry[];
  date: string;
  today: string;
  time: string;
  day: DaySummary | null;
  loading: boolean;
  error: boolean;
  moveGoal: number;
  onFocusLog(): void;
  onWeigh(): void;
  onRetry(): void;
}) {
  const { t } = useI18n(messages);
  const [editing, setEditing] = useState<Entry | null>(null);
  const isToday = date === today;
  const foods = entries.filter(e => e.kind === "food").length;
  const moves = entries.length - foods;
  const hasDinner = entries.some(e => e.kind === "food" && e.time >= "16:30");
  const remaining = day && day.budget > 0 ? day.remaining : null;
  return (
    <Card>
      <CardHead title={isToday ? t("date.today") : dayLabel(t, date)} note={`${t("dl.foodCount", { count: foods })} · ${t("dl.moveCount", { count: moves })}`}>
        {!isToday && day != null && day.am == null && (
          <button type="button" onClick={onWeigh} className="wt:text-accent-text wt:text-[11.5px] wt:font-medium">
            {t("dl.backfillWeigh")}
          </button>
        )}
      </CardHead>
      {day && (
        <div className="wt:text-ink-3 wt:flex wt:flex-wrap wt:gap-x-4 wt:gap-y-1 wt:px-[18px] wt:pt-2 wt:text-[11.5px]">
          <span>{t("dl.intake")} <b className="wt:text-ink-2 wt:font-medium wt:tabular-nums">{day.intake}</b> kcal</span>
          {day.budget > 0 && <span>{t("dl.budget")} <b className="wt:text-ink-2 wt:font-medium wt:tabular-nums">{day.budget}</b> kcal</span>}
          <span>
            {t("dl.move")} <b className="wt:text-ink-2 wt:font-medium wt:tabular-nums">{day.moveMinutes}</b>{" "}
            {t("unit.minutes")}
          </span>
        </div>
      )}
      <div className="wt:flex wt:flex-col wt:px-2.5 wt:pt-1.5 wt:pb-3">
        {loading ? (
          <Loading minHeight={72} />
        ) : error ? (
          <p className="wt:text-ink-3 wt:px-2 wt:py-3 wt:text-[12px]">
            {t("common.loadFailed")}
            <button type="button" onClick={onRetry} className="wt:text-accent-text wt:ml-1 wt:font-medium">{t("common.retry")}</button>
          </p>
        ) : (
          <>
            {entries.map(entry => (
              <Row key={entry.id} entry={entry} onEdit={() => setEditing(entry)} />
            ))}
            {isToday && !hasDinner && time < "21:30" && (
              <Placeholder kind="food" label={t("dl.dinnerLabel")}>
                {remaining == null
                  ? t("dl.notLogged")
                  : remaining > 0
                    ? t("dl.dinnerSuggestion", { kcal: Math.max(0, remaining - 100) })
                    : t("dl.dinnerFull")}
              </Placeholder>
            )}
            {isToday && day != null && day.moveMinutes < moveGoal && (
              <Placeholder kind="move" label={t("dl.move")}>
                {t("dl.moveGap", { minutes: moveGoal - day.moveMinutes })}
              </Placeholder>
            )}
            {entries.length === 0 && (
              <p className="wt:text-ink-3 wt:px-2 wt:pt-1 wt:text-[12px]">
                {isToday ? t("dl.emptyToday") : t("dl.emptyPast")}
                {!isToday && (
                  <button type="button" onClick={onFocusLog} className="wt:text-accent-text wt:ml-1 wt:font-medium">{t("dl.addOne")}</button>
                )}
              </p>
            )}
          </>
        )}
      </div>
      <EntryDialog entry={editing} today={today} onClose={() => setEditing(null)} />
    </Card>
  );
}

function Icon({ kind, ghost }: { kind: Entry["kind"]; ghost?: boolean }) {
  const color = kind === "move" ? MOVE_COLOR : FOOD_COLOR;
  const Glyph = kind === "move" ? Footprints : UtensilsCrossed;
  return (
    <span
      className="wt:grid wt:size-5 wt:place-items-center wt:rounded-full"
      style={
        ghost
          ? { boxShadow: "inset 0 0 0 1px var(--tau-line-1)", color: "var(--tau-ink-3)" }
          : { background: `color-mix(in srgb, ${color} 16%, transparent)`, color }
      }
    >
      <Glyph className="wt:size-[11px]" strokeWidth={2.2} />
    </span>
  );
}

function Placeholder({ kind, label, children }: { kind: Entry["kind"]; label: string; children: string }) {
  return (
    <div className="wt:text-ink-3 wt:grid wt:grid-cols-[22px_40px_minmax(0,1fr)] wt:items-center wt:gap-2 wt:px-2 wt:py-[7px] wt:text-[12.5px]">
      <Icon kind={kind} ghost />
      <span className="wt:text-[11px]">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Row({ entry, onEdit }: { entry: Entry; onEdit(): void }) {
  const { data, context, estimates } = useRuntime();
  const { t } = useI18n(messages);
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: WEIGHT_KEY });

  const remove = async () => {
    try {
      await data.deleteEntry(entry);
      await refresh();
      const { id: _id, revision: _revision, ...input } = entry;
      // 撤销恢复的仍在等估算时，重新排队
      const restore = () =>
        data.addEntry(input).then(restored => {
          if (restored.estimate === "pending") void estimates.enqueue(restored);
          return refresh();
        });
      toast.success(t("dl.deletedToast", { name: entry.text }), {
        action: {
          label: t("common.undo"),
          onClick: () => void restore().catch(() => toast.error(t("common.undoFailed"))),
        },
      });
    } catch {
      toast.error(t("common.deleteFailed"));
    }
  };

  return (
    <div className="wt:group wt:hover:bg-hover wt:grid wt:grid-cols-[22px_40px_minmax(0,1fr)_auto_26px] wt:items-center wt:gap-2 wt:rounded-[10px] wt:px-2 wt:py-[5px] wt:text-[12.5px]">
      <Icon kind={entry.kind} />
      <button type="button" onClick={onEdit} title={t("dl.editTitle")} className="wt:text-ink-3 wt:text-left wt:text-[11px] wt:tabular-nums">
        {entry.time}
      </button>
      <button type="button" onClick={onEdit} title={t("dl.editTitle")} className="wt:min-w-0 wt:truncate wt:text-left">
        {entry.text}
        {entry.kind === "move" && <span className="wt:text-ink-3">{" · "}{t("wt.minutes", { count: entry.minutes })}</span>}
      </button>
      {entry.estimate === "pending" ? (
        <button
          type="button"
          onClick={onEdit}
          title={t("dl.pendingTitle")}
          className="wt:text-ink-3 wt:hover:text-ink-1 wt:inline-flex wt:items-center wt:gap-1 wt:px-1.5 wt:text-[11.5px]"
        >
          <Sparkles className="wt:size-[11px]" strokeWidth={1.75} />
          {t("ql.estimating")}
        </button>
      ) : entry.estimate === "failed" ? (
        <button
          type="button"
          onClick={onEdit}
          className="wt:text-accent-text wt:bg-accent-soft wt:rounded-[6px] wt:px-1.5 wt:text-[11.5px] wt:font-medium"
        >
          {t("dl.fillKcal")}
        </button>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          title={t("dl.editTitle")}
          className={
            entry.kind === "move"
              ? "wt:text-ok wt:rounded-[6px] wt:px-1.5 wt:tabular-nums wt:hover:bg-press"
              : "wt:text-ink-2 wt:rounded-[6px] wt:px-1.5 wt:tabular-nums wt:hover:bg-press"
          }
        >
          {entry.kind === "move" ? `−${entry.kcal}` : entry.kcal}
        </button>
      )}
      <IconButton
        aria-label={t("dl.deleteAria", { name: entry.text })}
        onClick={() => void remove()}
        className="wt:size-[26px] wt:opacity-0 wt:group-hover:opacity-100 wt:focus-visible:opacity-100"
      >
        <Trash2 className="wt:size-[13px]" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
