/**
 * 手机界面共用的写入动作：记一笔（有热量直接定，没有则排入后台估算）、删除并给撤销。
 */
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import type { Entry, EntryInput } from "../../data/model";
import { WEIGHT_KEY, type WeightRuntime } from "../../runtime";

export async function addEntries(
  runtime: Pick<WeightRuntime, "data" | "estimates">,
  client: QueryClient,
  inputs: readonly (Omit<EntryInput, "estimate" | "kcal"> & { kcal: number | null })[]
): Promise<Entry[]> {
  const saved: Entry[] = [];
  for (const input of inputs) {
    const ready = input.kcal != null;
    const entry = await runtime.data.addEntry({
      ...input,
      kcal: input.kcal ?? 0,
      estimate: ready ? "ready" : "pending",
    });
    saved.push(entry);
    if (!ready) void runtime.estimates.enqueue(entry);
  }
  await client.invalidateQueries({ queryKey: WEIGHT_KEY });
  return saved;
}

export async function removeWithUndo(
  runtime: Pick<WeightRuntime, "data" | "estimates">,
  client: QueryClient,
  entry: Entry
) {
  try {
    const latest = (await runtime.data.getEntry(entry.id)) ?? entry;
    await runtime.data.deleteEntry(latest);
    await client.invalidateQueries({ queryKey: WEIGHT_KEY });
    const { id: _id, revision: _revision, ...input } = latest;
    toast.success(`已删除「${latest.text}」`, {
      action: {
        label: "撤销",
        onClick: () =>
          void runtime.data
            .addEntry(input)
            .then(restored => {
              if (restored.estimate === "pending") void runtime.estimates.enqueue(restored);
              return client.invalidateQueries({ queryKey: WEIGHT_KEY });
            })
            .catch(() => toast.error("撤销失败")),
      },
    });
  } catch {
    toast.error("删除失败");
  }
}
