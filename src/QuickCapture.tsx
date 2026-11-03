import { Overlay } from "./Motion";
import { useState } from "react";
import { X, ListTree, CalendarDays } from "lucide-react";
import { outlineGroups, taskTitle, type Quadrant, type Task } from "./model";
export default function QuickCapture({
  quadrant,
  idea,
  project,
  projects,
  onTask,
  onEvent,
  onIdea,
  onClose,
}: {
  quadrant?: Quadrant;
  idea?: boolean;
  project: string;
  projects: string[];
  onTask: (task: Partial<Task> & Pick<Task, "title">) => void;
  onEvent: () => void;
  onIdea: (title: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<"task" | "idea" | null>(
    idea ? "idea" : quadrant === undefined ? null : "task",
  );
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [group, setGroup] = useState<Quadrant>(quadrant ?? 1);
  const [owner, setOwner] = useState(project);
  return (
    <Overlay className="modal-backdrop" onClick={onClose}>
      <form
        className="modal quick-capture"
        role="dialog"
        aria-modal="true"
        aria-label="快速记录"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && kind === "idea") {
            onIdea(title.trim());
            return;
          }
          if (title.trim() && kind === "task")
            onTask({
              title: taskTitle(title),
              due,
              quadrant: group,
              project: owner,
            });
        }}
      >
        <div className="modal-title">
          <h2>快速记录</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭快速记录"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="capture-tabs">
          <button
            type="button"
            aria-pressed={kind === "task"}
            onClick={() => setKind("task")}
          >
            <ListTree size={16} /> 任务
          </button>
          <button type="button" onClick={onEvent}>
            <CalendarDays size={16} /> 普通日程
          </button>
          <button
            type="button"
            aria-pressed={kind === "idea"}
            onClick={() => setKind("idea")}
          >
            ✧ 灵感
          </button>
        </div>
        {kind === "idea" && (
          <>
            <label className="field-label">
              灵感标题
              <input
                autoFocus
                aria-label="灵感标题"
                placeholder="记下此刻的想法"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={!title.trim()}
              >
                记录灵感
              </button>
            </div>
          </>
        )}
        {kind === "task" && (
          <>
            <label className="field-label">
              任务名称
              <input
                autoFocus
                aria-label="任务名称"
                placeholder="要推进什么工作？"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="capture-fields">
              <label className="field-label">
                所属项目
                <select
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value="">未分类</option>
                  {projects.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                象限
                <select
                  value={group}
                  onChange={(e) => setGroup(Number(e.target.value) as Quadrant)}
                >
                  {outlineGroups.map((g) => (
                    <option value={g.quadrant} key={g.quadrant}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-label">
              截止日期（可选）
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={!title.trim()}
              >
                创建任务
              </button>
            </div>
          </>
        )}
      </form>
    </Overlay>
  );
}
