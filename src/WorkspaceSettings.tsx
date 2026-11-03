import { Overlay } from "./Motion";
import { useEffect, useState } from "react";
import { X, FolderOpen, ArchiveRestore, RotateCcw } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type { Workspace } from "./model";
import type { DeviceSettings } from "./device";
import { createWorkspaceDirectory } from "./device";
import {
  createBackup,
  listBackups,
  loadBackup,
  restoreTrash,
  type Backup,
} from "./recovery";
import { testRepository } from "./sync";
import "./WorkspaceSettings.css";
import { readLocal } from "./storage";
export default function WorkspaceSettings({
  workspace,
  device,
  onDevice,
  onWorkspace,
  onClose,
  onError,
  onSync,
  syncStatus,
  onRoot,
  onTaskFolders,
}: {
  workspace: Workspace;
  device: DeviceSettings;
  onDevice: (device: DeviceSettings) => Promise<void>;
  onWorkspace: (workspace: Workspace) => void;
  onClose: () => void;
  onError: (message: string) => void;
  onSync: () => void;
  syncStatus: string;
  onRoot: (root: string) => Promise<void>;
  onTaskFolders: () => Promise<void>;
}) {
  const [tab, setTab] = useState("folders"),
    [draft, setDraft] = useState(device),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [backups, setBackups] = useState<Backup[]>([]),
    [restoreId, setRestoreId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ date: string; target: string }[]>(
    [],
  );
  useEffect(() => {
    if (tab === "sync")
      void readLocal("sync-history")
        .then((text) => setHistory(JSON.parse(text || "[]")))
        .catch(onError);
  }, [tab, syncStatus]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  const syncField = (field: string, value: string | boolean) =>
    setDraft((d) => ({ ...d, sync: { ...d.sync, [field]: value } }));
  async function root(custom: boolean) {
    if (!isTauri()) throw new Error("工作目录需要桌面版");
    const parent = custom
      ? await open({
          directory: true,
          multiple: false,
          title: "选择松果工作目录的存放位置",
        })
      : undefined;
    if (custom && !parent) return;
    const path = await createWorkspaceDirectory(
      typeof parent === "string" ? parent : undefined,
    );
    await onRoot(path);
    setDraft((d) => ({ ...d, root: path }));
    setMessage("已创建工作目录，并为现有项目建立文件夹");
  }
  return (
    <Overlay className="modal-backdrop" onClick={onClose}>
      <section
        className="workspace-settings"
        role="dialog"
        aria-modal="true"
        aria-label="工作台设置"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>工作台设置</h2>
          <button
            className="icon-button"
            aria-label="关闭工作台设置"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <nav>
          {[
            ["folders", "文件夹"],
            ["sync", "云端同步"],
            ["recovery", "备份与恢复"],
            ["archive", "项目归档"],
            ["preferences", "快捷键与提醒"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id);
                setMessage("");
                if (id === "recovery")
                  void listBackups().then(setBackups).catch(onError);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="workspace-settings-body">
          {tab === "folders" && (
            <>
              <h3>松果工作目录</h3>
              {device.root ? (
                <>
                  <p className="settings-path">{device.root}</p>
                  <button
                    className="secondary-button"
                    onClick={() => void openPath(device.root).catch(onError)}
                  >
                    <FolderOpen size={16} />
                    打开目录
                  </button>
                </>
              ) : (
                <p>选择一次存放位置，新项目会自动拥有自己的文件夹。</p>
              )}
              <div className="settings-actions">
                <button
                  disabled={busy}
                  className="primary-button"
                  onClick={() => void run(() => root(false))}
                >
                  使用文稿目录
                </button>
                <button
                  disabled={busy}
                  className="secondary-button"
                  onClick={() => void run(() => root(true))}
                >
                  选择其他位置
                </button>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onTaskFolders();
                    setMessage("任务文件夹已补齐");
                  })
                }
              >
                为已有任务补建文件夹
              </button>
              <p>更换工作目录只影响新建文件夹，现有文件保持原位。</p>
            </>
          )}
          {tab === "sync" && (
            <>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={draft.sync.enabled}
                  onChange={(e) => syncField("enabled", e.target.checked)}
                />
                启用云端同步
              </label>
              {draft.sync.enabled && (
                <>
                  <div className="settings-fields">
                    <label className="field-label">
                      平台
                      <select
                        value={draft.sync.provider}
                        onChange={(e) => syncField("provider", e.target.value)}
                      >
                        <option value="github">GitHub</option>
                        <option value="gitee">Gitee</option>
                      </select>
                    </label>
                    <label className="field-label">
                      访问令牌
                      <input
                        type="password"
                        autoComplete="off"
                        value={draft.sync.token}
                        onChange={(e) => syncField("token", e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      仓库所有者
                      <input
                        value={draft.sync.owner}
                        onChange={(e) =>
                          syncField("owner", e.target.value.trim())
                        }
                      />
                    </label>
                    <label className="field-label">
                      私有仓库名称
                      <input
                        value={draft.sync.repo}
                        onChange={(e) =>
                          syncField("repo", e.target.value.trim())
                        }
                      />
                    </label>
                    <label className="field-label">
                      分支
                      <input
                        value={draft.sync.branch}
                        onChange={(e) =>
                          syncField("branch", e.target.value.trim())
                        }
                      />
                    </label>
                    <label className="field-label">
                      仓库目录
                      <input
                        value={draft.sync.directory}
                        onChange={(e) =>
                          syncField("directory", e.target.value.trim())
                        }
                      />
                    </label>
                  </div>
                  <p>
                    先创建私有仓库并初始化分支。GitHub 令牌需该仓库的 Contents
                    读写权限；Gitee
                    令牌需仓库读写权限。关联文件夹里的文件不会上传。
                  </p>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={draft.sync.auto}
                      onChange={(e) => syncField("auto", e.target.checked)}
                    />
                    自动同步（停止编辑 30 秒后）
                  </label>
                  <div className="settings-actions">
                    <button
                      disabled={busy}
                      className="secondary-button"
                      onClick={() =>
                        void run(async () =>
                          setMessage(await testRepository(draft.sync)),
                        )
                      }
                    >
                      测试连接
                    </button>
                    {device.sync.enabled && (
                      <button
                        disabled={busy}
                        className="secondary-button"
                        onClick={onSync}
                      >
                        立即同步
                      </button>
                    )}
                  </div>
                  <p>{syncStatus}</p>
                  {history.slice(0, 5).map((entry) => (
                    <div className="settings-list-row" key={entry.date}>
                      <span>
                        {new Date(entry.date).toLocaleString()}
                        <small>{entry.target}</small>
                      </span>
                      <span>已同步</span>
                    </div>
                  ))}
                </>
              )}
              <button
                disabled={busy}
                className="primary-button"
                onClick={() =>
                  void run(async () => {
                    await onDevice(draft);
                    setMessage("同步设置已保存");
                  })
                }
              >
                保存同步设置
              </button>
            </>
          )}
          {tab === "recovery" && (
            <>
              <div className="settings-section-title">
                <h3>本地备份</h3>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await createBackup(workspace);
                      setBackups(await listBackups());
                      setMessage("已备份");
                    })
                  }
                >
                  立即备份
                </button>
              </div>
              <p>每 6 小时在有修改时自动备份，保留最近 30 份，包含笔记图片。</p>
              {backups.map((b) => (
                <div className="settings-list-row" key={b.id}>
                  <span>
                    {new Date(b.date).toLocaleString()} · {b.label}
                    <small>
                      {b.tasks} 个任务 · {b.events} 项日程 · {b.ideas ?? 0}{" "}
                      条灵感
                    </small>
                  </span>
                  <button onClick={() => setRestoreId(b.id)}>恢复</button>
                </div>
              ))}
              {restoreId && (
                <div className="restore-confirm">
                  <p>恢复将替换当前工作数据，替换前会自动备份当前内容。</p>
                  <button
                    disabled={busy}
                    className="primary-button"
                    onClick={() =>
                      void run(async () => {
                        await createBackup(workspace, "恢复前备份");
                        onWorkspace(await loadBackup(restoreId, workspace));
                        setRestoreId(null);
                        setBackups(await listBackups());
                        setMessage("已恢复");
                      })
                    }
                  >
                    恢复这份备份
                  </button>
                  <button onClick={() => setRestoreId(null)}>取消</button>
                </div>
              )}
              <h3>回收站</h3>
              {workspace.trash.length ? (
                workspace.trash.map((item) => (
                  <div className="settings-list-row" key={item.id}>
                    <span>
                      {item.title}
                      <small>
                        {item.kind === "idea"
                          ? "灵感"
                          : item.kind === "task"
                            ? "任务"
                            : item.kind === "event"
                              ? "日程"
                              : "项目"}{" "}
                        · {new Date(item.deletedAt).toLocaleString()}
                      </small>
                    </span>
                    <button
                      onClick={() =>
                        onWorkspace(restoreTrash(workspace, item.id))
                      }
                    >
                      <RotateCcw size={14} />
                      恢复
                    </button>
                  </div>
                ))
              ) : (
                <p>回收站为空</p>
              )}
            </>
          )}
          {tab === "archive" && (
            <>
              <h3>已归档项目</h3>
              {workspace.archivedProjects.length ? (
                workspace.archivedProjects.map((name) => (
                  <div className="settings-list-row" key={name}>
                    <span>{name}</span>
                    <button
                      onClick={() =>
                        onWorkspace({
                          ...workspace,
                          archivedProjects: workspace.archivedProjects.filter(
                            (p) => p !== name,
                          ),
                        })
                      }
                    >
                      <ArchiveRestore size={15} />
                      恢复项目
                    </button>
                  </div>
                ))
              ) : (
                <p>还没有归档项目，可在项目设置中归档。</p>
              )}
            </>
          )}
          {tab === "preferences" && (
            <>
              <h3>快速记录</h3>
              <p>应用内使用 ⌘ / Ctrl + Shift + A 聚焦输入框。</p>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={draft.quickCapture}
                  onChange={(e) =>
                    setDraft({ ...draft, quickCapture: e.target.checked })
                  }
                />
                启用桌面全局快捷键（⌘ / Ctrl + Shift + Space）
              </label>
              <h3>日程提醒</h3>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={draft.notifications}
                  onChange={(e) =>
                    setDraft({ ...draft, notifications: e.target.checked })
                  }
                />
                启用系统通知
              </label>
              <p>
                在日程内设置提前提醒时间。当前版本需要松果保持运行，关闭应用后不会提醒。
              </p>
              <button
                disabled={busy}
                className="primary-button"
                onClick={() =>
                  void run(async () => {
                    await onDevice(draft);
                    setMessage("已保存");
                  })
                }
              >
                保存
              </button>
            </>
          )}
          {message && (
            <p className="settings-message" role="status">
              {message}
            </p>
          )}
        </div>
      </section>
    </Overlay>
  );
}
