import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type Task,
  type Quadrant,
  outlineGroups,
  tasksToMarkdown,
} from "./model";

interface Props {
  tasks: Task[];
  project: string;
  projects: string[];
  onUpdate: (id: string, changes: Partial<Task>) => void;
  onCreate: (quadrant: Quadrant) => string;
  onDelete: (id: string) => void;
  onPickFolder: (task: Task) => void;
  onOpenFolder: (path: string) => void;
}
export default function Outline({
  tasks,
  project,
  projects,
  onUpdate,
  onCreate,
  onDelete,
  onPickFolder,
  onOpenFolder,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const fields = useRef(new Map<string, HTMLInputElement>());
  useEffect(() => {
    if (focusId) {
      fields.current.get(focusId)?.focus();
      setFocusId(null);
    }
  }, [tasks, focusId]);
  function add(quadrant: Quadrant) {
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(quadrant);
      return next;
    });
    setFocusId(onCreate(quadrant));
  }
  function toggleTask(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exportMarkdown() {
    const url = URL.createObjectURL(
      new Blob([tasksToMarkdown(tasks, project || "任务笔记")], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "FocusDesk-notes.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="outline-view" aria-label="任务笔记">
      <div className="outline-document">
        <div className="outline-document-header">
          <h2>{project || "任务笔记"}</h2>
          <button
            className="icon-button"
            onClick={exportMarkdown}
            title="导出 Markdown"
          >
            <Download size={17} />
          </button>
        </div>
        {outlineGroups.map((group) => {
          const items = tasks.filter((t) => t.quadrant === group.quadrant);
          const folded = collapsed.has(group.quadrant);
          return (
            <section className="outline-group" key={group.quadrant}>
              <div className="outline-group-heading">
                <button
                  className="icon-button"
                  aria-label={`${folded ? "展开" : "折叠"}${group.title}`}
                  aria-expanded={!folded}
                  onClick={() =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(group.quadrant)) next.delete(group.quadrant);
                      else next.add(group.quadrant);
                      return next;
                    })
                  }
                >
                  {folded ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
                <h3>{group.title}</h3>
                <span className="outline-count">{items.length}</span>
                <button
                  className="icon-button add-outline-task"
                  title={`在${group.title}下添加任务`}
                  onClick={() => add(group.quadrant)}
                >
                  <Plus size={17} />
                </button>
              </div>
              {!folded && (
                <div className="outline-children">
                  {items.map((task) => (
                    <article key={task.id} className="outline-task">
                      <div className="outline-task-row">
                        <button
                          className="outline-bullet"
                          title={`${expanded.has(task.id) ? "收起" : "展开"}${task.title || "新任务"}详情`}
                          aria-expanded={expanded.has(task.id)}
                          onClick={() => toggleTask(task.id)}
                        >
                          <span />
                        </button>
                        <input
                          ref={(node) => {
                            if (node) fields.current.set(task.id, node);
                            else fields.current.delete(task.id);
                          }}
                          className="outline-task-title"
                          aria-label={`笔记任务：${task.title || "新任务"}`}
                          value={task.title}
                          placeholder="新任务"
                          onChange={(e) =>
                            onUpdate(task.id, { title: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              add(task.quadrant);
                            }
                          }}
                        />
                        {task.due && (
                          <button
                            className="outline-date"
                            onClick={() => toggleTask(task.id)}
                          >
                            {task.due.slice(5).replace("-", "/")}
                          </button>
                        )}
                        {task.folder && (
                          <button
                            className="icon-button"
                            title={`打开${task.title}文件夹`}
                            onClick={() => onOpenFolder(task.folder)}
                          >
                            <Folder size={14} />
                          </button>
                        )}
                        <button
                          className="icon-button outline-complete"
                          title={`完成${task.title}`}
                          onClick={() => onUpdate(task.id, { done: true })}
                        >
                          <Check size={15} />
                        </button>
                      </div>
                      {expanded.has(task.id) && (
                        <div className="outline-task-details">
                          <textarea
                            aria-label={`${task.title}的笔记`}
                            placeholder="笔记"
                            value={task.description}
                            onChange={(e) =>
                              onUpdate(task.id, { description: e.target.value })
                            }
                          />
                          <div className="outline-fields">
                            <label>
                              象限
                              <select
                                aria-label={`${task.title}的象限`}
                                value={task.quadrant}
                                onChange={(e) =>
                                  onUpdate(task.id, {
                                    quadrant: Number(
                                      e.target.value,
                                    ) as Quadrant,
                                  })
                                }
                              >
                                {outlineGroups.map((g) => (
                                  <option key={g.quadrant} value={g.quadrant}>
                                    {g.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              日期
                              <input
                                aria-label={`${task.title}的日期`}
                                type="date"
                                value={task.due}
                                onChange={(e) =>
                                  onUpdate(task.id, { due: e.target.value })
                                }
                              />
                            </label>
                            <label>
                              项目
                              <select
                                aria-label={`${task.title}的项目`}
                                value={task.project}
                                onChange={(e) =>
                                  onUpdate(task.id, { project: e.target.value })
                                }
                              >
                                <option value="">未分类</option>
                                {projects.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="outline-folder">
                            <button onClick={() => onPickFolder(task)}>
                              <FolderOpen size={15} />
                              {task.folder ? "更换文件夹" : "关联文件夹"}
                            </button>
                            <input
                              aria-label={`${task.title}的文件夹路径`}
                              placeholder="文件夹路径"
                              value={task.folder}
                              onChange={(e) =>
                                onUpdate(task.id, { folder: e.target.value })
                              }
                            />
                            {task.folder && (
                              <button onClick={() => onOpenFolder(task.folder)}>
                                打开
                              </button>
                            )}
                            <button
                              className="icon-button"
                              title={`删除${task.title}`}
                              onClick={() => onDelete(task.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                  <button
                    className="outline-add-row"
                    onClick={() => add(group.quadrant)}
                  >
                    <Plus size={14} />
                    添加任务
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
