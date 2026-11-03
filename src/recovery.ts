import type { Workspace, TrashEntry } from "./model";
import {
  normalizeWorkspace,
  removeTask,
  deleteProject,
  eventDetails,
} from "./workspace";
import { readLocal, writeLocal } from "./storage";
export function trashItem(
  w: Workspace,
  kind: TrashEntry["kind"],
  id: string,
  contents = false,
): Workspace {
  const task = w.tasks.find((t) => t.id === id),
    event = w.events.find((e) => e.id === id);
  const tasks =
    kind === "task" && task
      ? [task]
      : kind === "project" && contents
        ? w.tasks.filter((t) => t.project === id)
        : [];
  const events =
    kind === "event" && event
      ? [event]
      : kind === "project" && contents
        ? w.events
            .filter((e) => eventDetails(w, e).project === id)
            .map((e) => eventDetails(w, e))
        : [];
  const entry: TrashEntry = {
    id: crypto.randomUUID(),
    kind,
    ideas: kind === "idea" ? w.ideas.filter((i) => i.id === id) : [],
    title:
      kind === "project"
        ? id
        : task?.title ||
          event?.title ||
          w.ideas.find((i) => i.id === id)?.title ||
          "未命名",
    deletedAt: new Date().toISOString(),
    tasks,
    events,
    links: w.links.filter((l) =>
      tasks.some((t) => t.id === l.source || t.id === l.target),
    ),
    ...(kind === "project"
      ? {
          project: id,
          folders: w.projectFolders[id] ?? [],
          memberships: {
            tasks: w.tasks.filter((t) => t.project === id).map((t) => t.id),
            events: w.events
              .filter((e) => eventDetails(w, e).project === id)
              .map((e) => e.id),
          },
        }
      : {}),
  };
  let next = w;
  for (const t of tasks) next = removeTask(next, t.id);
  next = {
    ...next,
    ideas: kind === "idea" ? next.ideas.filter((i) => i.id !== id) : next.ideas,
    events: next.events.filter(
      (e) => !events.some((removed) => removed.id === e.id),
    ),
  };
  if (kind === "project") next = deleteProject(next, id);
  return { ...next, trash: [entry, ...w.trash] };
}
export function restoreTrash(w: Workspace, id: string): Workspace {
  const item = w.trash.find((e) => e.id === id);
  if (!item) return w;
  const tasks = [
    ...w.tasks.map((t) =>
      item.project && !t.project && item.memberships?.tasks.includes(t.id)
        ? { ...t, project: item.project }
        : t,
    ),
    ...item.tasks.filter((t) => !w.tasks.some((old) => old.id === t.id)),
  ];
  const events = [
    ...w.events.map((e) =>
      item.project && !e.project && item.memberships?.events.includes(e.id)
        ? { ...e, project: item.project }
        : e,
    ),
    ...item.events.filter((e) => !w.events.some((old) => old.id === e.id)),
  ];
  const ids = new Set(tasks.map((t) => t.id));
  const links = [
    ...w.links,
    ...item.links.filter(
      (l) =>
        ids.has(l.source) &&
        ids.has(l.target) &&
        !w.links.some((old) => old.id === l.id),
    ),
  ];
  return normalizeWorkspace({
    ...w,
    tasks,
    events,
    links,
    ideas: [
      ...w.ideas,
      ...(item.ideas ?? []).filter(
        (i) => !w.ideas.some((old) => old.id === i.id),
      ),
    ],
    projects: item.project
      ? [...new Set([...w.projects, item.project])]
      : w.projects,
    projectFolders: item.project
      ? { ...w.projectFolders, [item.project]: item.folders ?? [] }
      : w.projectFolders,
    trash: w.trash.filter((e) => e.id !== id),
  });
}
export interface Backup {
  id: string;
  date: string;
  label: string;
  tasks: number;
  events: number;
  ideas?: number;
}
export const listBackups = async (): Promise<Backup[]> =>
  JSON.parse((await readLocal("backups")) || "[]");
export function backupWorkspace(w: Workspace): Workspace {
  return { ...w, config: { ...w.config, key: "" } };
}
let backupQueue = Promise.resolve();
export function createBackup(w: Workspace, label = "手动备份") {
  const run = backupQueue
    .catch(() => {})
    .then(async () => {
      const list = await listBackups();
      const item: Backup = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        label,
        tasks: w.tasks.length,
        events: w.events.length,
        ideas: w.ideas.length,
      };
      await writeLocal(`backup:${item.id}`, JSON.stringify(backupWorkspace(w)));
      await writeLocal("backups", JSON.stringify([item, ...list].slice(0, 30)));
      for (const old of list.slice(29))
        await writeLocal(`backup:${old.id}`, "");
      return item;
    });
  backupQueue = run.then(() => {});
  return run;
}
let autoBackupAt = 0;
export async function autoBackup(w: Workspace) {
  if (!autoBackupAt)
    autoBackupAt = new Date(
      (await listBackups()).find((b) => b.label === "自动备份")?.date || 0,
    ).getTime();
  if (Date.now() - autoBackupAt < 6 * 60 * 60 * 1000) return;
  autoBackupAt = Date.now();
  try {
    await createBackup(w, "自动备份");
  } catch (e) {
    autoBackupAt = 0;
    throw e;
  }
}
export async function loadBackup(id: string, current: Workspace) {
  const text = await readLocal(`backup:${id}`);
  if (!text) throw new Error("备份不存在");
  const restored = normalizeWorkspace(JSON.parse(text));
  return { ...restored, config: current.config };
}
