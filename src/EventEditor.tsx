import { useState } from "react";
import { X, NotebookPen, FolderOpen, Trash2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { CalendarEvent, Task } from "./model";
import { validSchedule } from "./calendar";
export default function EventEditor({
  event,
  tasks,
  projects,
  existing,
  onClose,
  onSave,
  onDelete,
  onNotes,
  onFolder,
  onError,
}: {
  event: CalendarEvent;
  tasks: Task[];
  projects: string[];
  existing: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete: () => void;
  onNotes: (event: CalendarEvent) => void;
  onFolder: (path: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(event);
  const [error, setError] = useState("");
  const task = tasks.find((t) => t.id === draft.taskId);
  const change = (value: Partial<CalendarEvent>) =>
    setDraft((d) => ({ ...d, ...value }));
  function commit(notes = false) {
    if (!draft.title.trim()) {
      setError("请输入日程名称");
      return;
    }
    if (!validSchedule(draft)) {
      setError("请选择有效的开始和结束时间，结束需晚于开始");
      return;
    }
    const value = { ...draft, title: draft.title.trim() };
    onSave(value);
    if (notes) onNotes(value);
  }
  async function pickFolder() {
    if (!isTauri()) {
      onError("文件夹选择请使用桌面版；网页中可填写路径");
      return;
    }
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: "选择日程文件夹",
      });
      if (typeof path === "string") change({ folder: path });
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal event-editor"
        role="dialog"
        aria-modal="true"
        aria-label={existing ? "编辑日程" : "新建日程"}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <div className="event-editor-heading">
          <h2>{existing ? "编辑日程" : "新建日程"}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭日程"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <label className="field-label">
          日程名称
          <input
            autoFocus
            value={draft.title}
            onChange={(e) => change({ title: e.target.value })}
            placeholder="要做什么？"
          />
        </label>
        <div className="event-time-fields">
          <label className="field-label">
            开始时间
            <input
              type="datetime-local"
              value={draft.start}
              onChange={(e) => change({ start: e.target.value })}
            />
          </label>
          <label className="field-label">
            结束时间
            <input
              type="datetime-local"
              value={draft.end}
              onChange={(e) => change({ end: e.target.value })}
            />
          </label>
        </div>
        <label className="field-label">
          关联任务
          <select
            value={draft.taskId || ""}
            onChange={(e) => {
              if (!e.target.value && task)
                change({
                  taskId: undefined,
                  notes: task.notes,
                  project: task.project,
                  folder: task.folder,
                });
              else change({ taskId: e.target.value || undefined });
            }}
          >
            <option value="">独立日程</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || "新任务"}
                {t.done ? "（已完成）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          所属项目
          <select
            disabled={Boolean(task)}
            value={task?.project ?? draft.project}
            onChange={(e) => change({ project: e.target.value })}
          >
            <option value="">未分类</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          日程说明
          <textarea
            rows={2}
            value={draft.description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </label>
        <div className="event-resources">
          <button type="button" onClick={() => commit(true)}>
            <NotebookPen size={16} />
            {task ? "打开任务笔记" : "打开日程笔记"}
          </button>
          {!task && (
            <button type="button" onClick={() => void pickFolder()}>
              <FolderOpen size={16} />
              选择文件夹
            </button>
          )}
          {(task?.folder || (!task && draft.folder)) && (
            <button
              type="button"
              onClick={() => onFolder(task?.folder || draft.folder)}
            >
              <FolderOpen size={16} />
              打开{task ? "任务" : "本地"}文件夹
            </button>
          )}
        </div>
        {!task && (
          <input
            className="event-folder-path"
            aria-label="日程文件夹路径"
            placeholder="文件夹路径（可选）"
            value={draft.folder}
            onChange={(e) => change({ folder: e.target.value })}
          />
        )}
        {error && (
          <p className="event-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {existing && (
            <button type="button" className="delete-task" onClick={onDelete}>
              <Trash2 size={16} />
              删除日程
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button">
            保存日程
          </button>
        </div>
      </form>
    </div>
  );
}
