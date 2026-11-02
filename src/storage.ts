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
  const value = localStorage.getItem("focusdesk.workspace.v1");
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
      else localStorage.setItem("focusdesk.workspace.v1", value);
    });
  return queue;
}
