import { invoke, isTauri } from "@tauri-apps/api/core";
import { readLocal, writeLocal } from "./storage";
export interface SyncSettings {
  enabled: boolean;
  auto: boolean;
  provider: "github" | "gitee";
  token: string;
  owner: string;
  repo: string;
  branch: string;
  directory: string;
}
export interface DeviceSettings {
  root: string;
  sync: SyncSettings;
  notifications: boolean;
  quickCapture: boolean;
}
export const defaultDevice = (): DeviceSettings => ({
  root: "",
  notifications: false,
  quickCapture: false,
  sync: {
    enabled: false,
    auto: false,
    provider: "github",
    token: "",
    owner: "",
    repo: "",
    branch: "main",
    directory: "pinecone",
  },
});
export async function loadDevice(): Promise<DeviceSettings> {
  const value = await readLocal("device");
  return value
    ? {
        ...defaultDevice(),
        ...JSON.parse(value),
        sync: { ...defaultDevice().sync, ...JSON.parse(value).sync },
      }
    : defaultDevice();
}
export const saveDevice = (value: DeviceSettings) =>
  writeLocal("device", JSON.stringify(value));
export async function createProjectDirectory(root: string, name: string) {
  if (!root || !isTauri()) return "";
  return invoke<string>("create_project_directory", { root, name });
}
export async function createWorkspaceDirectory(parent?: string) {
  if (!isTauri()) throw new Error("创建本地工作目录请使用桌面版");
  return invoke<string>("create_workspace_directory", {
    parent: parent || null,
  });
}

export async function createTaskDirectory(
  root: string,
  project: string,
  quadrant: string,
  title: string,
  id: string,
) {
  return invoke<string>("create_task_directory", {
    root,
    project,
    quadrant,
    title,
    id,
  });
}
