import { Overlay } from "./Motion";
import { useState } from "react";
import { X, NotebookPen, Trash2 } from "lucide-react";
import FolderLinks, { folderPaths } from "./FolderLinks";
import type { OccurrenceScope } from "./recurrence";
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
  projectFolders,
  onError,
}: {
  event: CalendarEvent;
  tasks: Task[];
  projects: string[];
  existing: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent, scope: OccurrenceScope) => string;
  onDelete: (scope: OccurrenceScope) => void;
  onNotes: (event: CalendarEvent) => void;
  projectFolders: Record<string, string[]>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(event);
  const [scope, setScope] = useState<OccurrenceScope>("this");
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
    if (
      value.recurrence?.until &&
      value.recurrence.until < value.start.slice(0, 10)
    ) {
      setError("重复结束日期不能早于开始日期");
      return;
    }
    if (
      notes &&
      existing &&
      value.recurrence &&
      JSON.stringify(draft) === JSON.stringify(event)
    ) {
      onNotes(value);
      return;
    }
    const id = onSave(value, scope);
    if (notes) onNotes({ ...value, id, seriesId: undefined });
  }
  return (
    <Overlay className="modal-backdrop" onClick={onClose}>
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
          备注（可选）
          <textarea
            rows={2}
            value={draft.description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </label>
        <div className="event-time-fields">
          <label className="field-label">
            重复
            <select
              value={draft.recurrence?.frequency ?? ""}
              onChange={(e) =>
                change({
                  recurrence: e.target.value
                    ? {
                        frequency: e.target.value as
                          "daily" | "weekly" | "monthly" | "yearly",
                        until: draft.recurrence?.until,
                      }
                    : undefined,
                })
              }
            >
              <option value="">不重复</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </select>
          </label>
          <label className="field-label">
            提前提醒
            <select
              value={draft.reminder ?? -1}
              onChange={(e) =>
                change({
                  reminder:
                    Number(e.target.value) < 0
                      ? undefined
                      : Number(e.target.value),
                })
              }
            >
              <option value={-1}>不提醒</option>
              <option value={0}>开始时</option>
              <option value={5}>5 分钟</option>
              <option value={15}>15 分钟</option>
              <option value={30}>30 分钟</option>
              <option value={60}>1 小时</option>
            </select>
          </label>
        </div>
        {draft.recurrence && (
          <label className="field-label event-half">
            重复结束日期（可选）
            <input
              type="date"
              value={draft.recurrence.until ?? ""}
              onChange={(e) =>
                change({
                  recurrence: {
                    ...draft.recurrence!,
                    until: e.target.value || undefined,
                  },
                })
              }
            />
          </label>
        )}
        {event.recurrence && existing && (
          <label className="field-label event-half">
            修改范围
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as OccurrenceScope)}
            >
              <option value="this">仅本次</option>
              <option value="future">本次及后续日程</option>
            </select>
          </label>
        )}
        <details className="event-more" open={task ? true : undefined}>
          <summary>关联任务与项目</summary>
          <label className="field-label event-half">
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
                    folders: task.folders,
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
          <label className="field-label event-half">
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
          {task && (
            <button
              type="button"
              className="task-schedule-button"
              onClick={() => commit(true)}
            >
              <NotebookPen size={16} />
              打开任务笔记
            </button>
          )}
        </details>
        {(draft.notes || folderPaths(draft).length > 0) && (
          <details className="event-more">
            <summary>已有笔记与附件</summary>
            <div className="event-resources">
              <button type="button" onClick={() => commit(true)}>
                <NotebookPen size={16} />
                {task ? "打开任务笔记" : "打开日程笔记"}
              </button>
            </div>
            {task ? (
              <FolderLinks
                readOnly
                paths={[]}
                inherited={[
                  ...folderPaths(task),
                  ...(projectFolders[task.project] ?? []),
                ]}
                onChange={() => {}}
                onError={onError}
              />
            ) : (
              <FolderLinks
                paths={folderPaths(draft)}
                inherited={projectFolders[draft.project] ?? []}
                onChange={(folders) => change({ folder: "", folders })}
                onError={onError}
              />
            )}
          </details>
        )}
        {error && (
          <p className="event-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {existing && (
            <button
              type="button"
              className="delete-task"
              onClick={() => onDelete(scope)}
            >
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
    </Overlay>
  );
}
