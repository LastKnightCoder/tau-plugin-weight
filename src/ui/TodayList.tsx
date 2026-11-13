/**
 * 今天的流水：按时间排列饮食与运动，点行打开弹窗改一笔（含日期，可挪回昨天）、删除（删除给撤销）。
 * 末尾的占位行提示还没记的晚饭与还差的运动。
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Footprints, Sparkles, Trash2, UtensilsCrossed } from "lucide-react";
import { IconButton, toast } from "@tau/ui";
import type { Entry } from "../data/model";
import { WEIGHT_KEY, useRuntime } from "../runtime";
import { EntryDialog } from "./EntryDialog";
import { Card, CardHead, FOOD_COLOR, MOVE_COLOR } from "./bits";

export function TodayList({
  entries,
  today,
  time,
  remaining,
  moveMinutes,
  moveGoal,
}: {
  entries: readonly Entry[];
  today: string;
  time: string;
  remaining: number | null;
  moveMinutes: number;
  moveGoal: number;
}) {
  const [editing, setEditing] = useState<Entry | null>(null);
  const foods = entries.filter(e => e.kind === "food").length;
  const moves = entries.length - foods;
  const hasDinner = entries.some(e => e.kind === "food" && e.time >= "16:30");
  return (
    <Card>
      <CardHead title="今天" note={`${foods} 条饮食 · ${moves} 次运动`} />
      <div className="wt:flex wt:flex-col wt:px-2.5 wt:pt-1.5 wt:pb-3">
        {entries.map(entry => (
          <Row key={entry.id} entry={entry} onEdit={() => setEditing(entry)} />
        ))}
        {!hasDinner && time < "21:30" && (
          <Placeholder kind="food" label="晚饭">
            {remaining == null
              ? "还没记"
              : remaining > 0
                ? `还没记 · 建议 ≤ ${Math.max(0, remaining - 100)} kcal`
                : "还没记 · 今天已经吃满了"}
          </Placeholder>
        )}
        {moveMinutes < moveGoal && (
          <Placeholder kind="move" label="运动">
            {`还差 ${moveGoal - moveMinutes} 分钟`}
          </Placeholder>
        )}
        {entries.length === 0 && (
          <p className="wt:text-ink-3 wt:px-2 wt:pt-1 wt:text-[12px]">吃东西、运动之前，在上面写一句。</p>
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
      toast.success(`已删除 ${entry.text}`, {
        action: {
          label: "撤销",
          onClick: () => void restore().catch(() => toast.error("撤销失败")),
        },
      });
    } catch {
      toast.error("删除失败");
    }
  };

  return (
    <div className="wt:group wt:hover:bg-hover wt:grid wt:grid-cols-[22px_40px_minmax(0,1fr)_auto_26px] wt:items-center wt:gap-2 wt:rounded-[10px] wt:px-2 wt:py-[5px] wt:text-[12.5px]">
      <Icon kind={entry.kind} />
      <button type="button" onClick={onEdit} title="修改" className="wt:text-ink-3 wt:text-left wt:text-[11px] wt:tabular-nums">
        {entry.time}
      </button>
      <button type="button" onClick={onEdit} title="修改" className="wt:min-w-0 wt:truncate wt:text-left">
        {entry.text}
        {entry.kind === "move" && <span className="wt:text-ink-3"> · {entry.minutes} 分钟</span>}
      </button>
      {entry.estimate === "pending" ? (
        <button
          type="button"
          onClick={onEdit}
          title="还在估算，点开先填"
          className="wt:text-ink-3 wt:hover:text-ink-1 wt:inline-flex wt:items-center wt:gap-1 wt:px-1.5 wt:text-[11.5px]"
        >
          <Sparkles className="wt:size-[11px]" strokeWidth={1.75} />
          估算中
        </button>
      ) : entry.estimate === "failed" ? (
        <button
          type="button"
          onClick={onEdit}
          className="wt:text-accent-text wt:bg-accent-soft wt:rounded-[6px] wt:px-1.5 wt:text-[11.5px] wt:font-medium"
        >
          填热量
        </button>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          title="修改"
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
        aria-label={`删除 ${entry.text}`}
        onClick={() => void remove()}
        className="wt:size-[26px] wt:opacity-0 wt:group-hover:opacity-100 wt:focus-visible:opacity-100"
      >
        <Trash2 className="wt:size-[13px]" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
