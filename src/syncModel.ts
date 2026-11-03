import type { Workspace, Task, CalendarEvent, TrashEntry } from "./model";
import { normalizeWorkspace } from "./workspace";
export type RecordValue = Record<string, unknown>;
export interface SyncDocument {
  schema: 1;
  records: Record<string, RecordValue>;
  deleted: Record<string, string>;
}
export interface SyncConflict {
  key: string;
  field: string;
  title: string;
  local: unknown;
  remote: unknown;
}
export const emptyDocument = (): SyncDocument => ({
  schema: 1,
  records: {},
  deleted: {},
});
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function portable<T extends { folder?: string; folders?: string[] }>(item: T) {
  const { folder: _folder, folders: _folders, ...value } = item;
  return clean(value);
}
export function syncDocument(w: Workspace): SyncDocument {
  const records: SyncDocument["records"] = {};
  w.tasks.forEach((t) => {
    records[`task:${t.id}`] = portable(t);
  });
  w.events.forEach((e) => {
    records[`event:${e.id}`] = portable(e);
  });
  w.projects.forEach((name) => {
    records[`project:${name}`] = {
      name,
      archived: w.archivedProjects.includes(name),
    };
  });
  w.links.forEach((l) => {
    records[`link:${l.id}`] = { ...l };
  });
  for (const q of w.manualQuadrants) records[`manual:${q}`] = { quadrant: q };
  for (const entry of w.trash)
    records[`trash:${entry.id}`] = {
      ...portable(entry),
      tasks: entry.tasks.map(portable),
      events: entry.events.map(portable),
    };
  return { schema: 1, records, deleted: { ...w.deleted } };
}
export function trackDeletions(before: Workspace, after: Workspace): Workspace {
  const old = syncDocument(before).records,
    next = syncDocument(after).records;
  const deleted = { ...after.deleted };
  for (const key of Object.keys(old))
    if (!next[key]) deleted[key] = new Date().toISOString();
  for (const key of Object.keys(next)) delete deleted[key];
  return { ...after, deleted };
}
export function applyDocument(
  current: Workspace,
  doc: SyncDocument,
): Workspace {
  const values = (prefix: string) =>
    Object.entries(doc.records)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  const tasks = values("task:").map((v) => ({
    ...v,
    folder: current.tasks.find((t) => t.id === v.id)?.folder ?? "",
    folders: current.tasks.find((t) => t.id === v.id)?.folders ?? [],
  })) as unknown as Task[];
  const events = values("event:").map((v) => ({
    ...v,
    folder: current.events.find((e) => e.id === v.id)?.folder ?? "",
    folders: current.events.find((e) => e.id === v.id)?.folders ?? [],
  })) as unknown as CalendarEvent[];
  const projects = values("project:");
  return normalizeWorkspace({
    ...current,
    tasks,
    events,
    projects: projects.map((p) => String(p.name)),
    archivedProjects: projects
      .filter((p) => p.archived)
      .map((p) => String(p.name)),
    links: values("link:") as unknown as Workspace["links"],
    manualQuadrants: values("manual:").map((q) =>
      Number(q.quadrant),
    ) as Workspace["manualQuadrants"],
    trash: values("trash:").map((v) => {
      const old = current.trash.find((e) => e.id === v.id);
      return {
        ...v,
        folders: old?.folders,
        tasks: (v.tasks as Task[]).map((t) => ({
          ...t,
          folder: old?.tasks.find((a) => a.id === t.id)?.folder ?? "",
          folders: old?.tasks.find((a) => a.id === t.id)?.folders ?? [],
        })),
        events: (v.events as CalendarEvent[]).map((e) => ({
          ...e,
          folder: old?.events.find((a) => a.id === e.id)?.folder ?? "",
          folders: old?.events.find((a) => a.id === e.id)?.folders ?? [],
        })),
      };
    }) as TrashEntry[],
    deleted: doc.deleted,
  });
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function mergeDocuments(
  base: SyncDocument,
  local: SyncDocument,
  remote: SyncDocument,
  choices: Record<string, "local" | "remote"> = {},
) {
  const result = emptyDocument(),
    conflicts: SyncConflict[] = [];
  result.deleted = { ...local.deleted, ...remote.deleted };
  for (const key of new Set([
    ...Object.keys(base.records),
    ...Object.keys(local.records),
    ...Object.keys(remote.records),
    ...Object.keys(result.deleted),
  ])) {
    const b = base.records[key],
      l = local.records[key],
      r = remote.records[key];
    const select = (field: string, lv: unknown, rv: unknown) => {
      const choice = choices[`${key}/${field}`];
      if (!choice)
        conflicts.push({
          key,
          field,
          title: String(l?.title || r?.title || l?.name || r?.name || key),
          local: lv,
          remote: rv,
        });
      return choice === "remote" ? rv : lv;
    };
    let value: RecordValue | undefined;
    if (equal(l, r)) value = l;
    else if (b && equal(l, b)) value = r;
    else if (b && equal(r, b)) value = l;
    else if (!b && !l && !local.deleted[key]) value = r;
    else if (!b && !r && !remote.deleted[key]) value = l;
    else if (!l || !r)
      value = select("$record", l, r) as RecordValue | undefined;
    else {
      value = {};
      for (const field of new Set([
        ...Object.keys(b ?? {}),
        ...Object.keys(l),
        ...Object.keys(r),
      ])) {
        const bv = b?.[field],
          lv = l[field],
          rv = r[field];
        const merged = equal(lv, rv)
          ? lv
          : equal(lv, bv)
            ? rv
            : equal(rv, bv)
              ? lv
              : select(field, lv, rv);
        if (merged !== undefined) value[field] = merged;
      }
    }
    if (value) {
      result.records[key] = value;
      delete result.deleted[key];
    } else if (b || l || r) result.deleted[key] ??= new Date().toISOString();
  }
  return { document: result, conflicts };
}
