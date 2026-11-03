import { readBrowserWorkspace, writeBrowserWorkspace } from "./browserStorage";
import { isTauri } from "@tauri-apps/api/core";
import type { Workspace } from "./model";
import { initialWorkspace } from "./model";
import { normalizeWorkspace } from "./workspace";
import Database from "@tauri-apps/plugin-sql";
let database: Promise<Database> | undefined;
const db = () => (database ??= Database.load("sqlite:focusdesk.db"));
export async function loadWorkspace(): Promise<Workspace> {
  if (isTauri()) {
    const rows = await (
      await db()
    ).select<{ value: string }[]>("SELECT value FROM workspace WHERE id = 1");
    return rows.length
      ? normalizeWorkspace(JSON.parse(rows[0].value))
      : initialWorkspace();
  }
  const value = await readBrowserWorkspace();
  return value ? normalizeWorkspace(JSON.parse(value)) : initialWorkspace();
}
let queue = Promise.resolve();
export function saveWorkspace(workspace: Workspace) {
  const value = JSON.stringify(workspace);
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (isTauri())
        await (
          await db()
        ).execute(
          "INSERT INTO workspace (id, value) VALUES (1, $1) ON CONFLICT(id) DO UPDATE SET value = excluded.value",
          [value],
        );
      else await writeBrowserWorkspace(value);
    });
  return queue;
}

export async function readLocal(key: string): Promise<string | null> {
  if (!isTauri()) return readBrowserWorkspace(`local:${key}`);
  const rows = await (
    await db()
  ).select<{ value: string }[]>(
    "SELECT value FROM local_state WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}
export async function writeLocal(key: string, value: string) {
  if (!isTauri()) return writeBrowserWorkspace(value, `local:${key}`);
  await (
    await db()
  ).execute(
    "INSERT INTO local_state (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
