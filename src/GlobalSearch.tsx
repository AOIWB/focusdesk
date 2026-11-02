import { useState } from "react";
import { CheckCheck, Folder, Search, X } from "lucide-react";
import { type Workspace, type Task, outlineGroups } from "./model";
import { searchWorkspace } from "./workspace";
export default function GlobalSearch({
  workspace,
  onClose,
  onTask,
  onProject,
}: {
  workspace: Workspace;
  onClose: () => void;
  onTask: (task: Task) => void;
  onProject: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const result = searchWorkspace(workspace, query);
  const [cursor, setCursor] = useState(0);
  const count = result.projects.length + result.tasks.length;
  function pick(index: number) {
    if (index < result.projects.length) onProject(result.projects[index]);
    else if (result.tasks[index - result.projects.length])
      onTask(result.tasks[index - result.projects.length]);
  }
  function excerpt(task: Task) {
    const text = [
      task.title,
      task.description,
      task.project,
      task.folder,
      task.due,
    ]
      .filter(Boolean)
      .join(" · ")
      .replaceAll("\n", " · ");
    const words = query.toLocaleLowerCase().trim().split(/\s+/);
    const match = words
      .map((word) => text.toLocaleLowerCase().indexOf(word))
      .filter((i) => i >= 0);
    const start = Math.max(0, (match.length ? Math.min(...match) : 0) - 35);
    return `${start ? "…" : ""}${text.slice(start, start + 150)}`;
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="global-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="global-search-input">
          <Search size={20} />
          <input
            autoFocus
            aria-label="搜索全部内容"
            placeholder="搜索全部内容"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, count - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              }
              if (e.key === "Enter" && count) {
                e.preventDefault();
                pick(Math.max(0, cursor));
              }
            }}
          />
          <button
            className="icon-button"
            title="关闭全局搜索"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="global-search-results">
          {query.trim() ? (
            <>
              <div className="search-result-count">{count} 个结果</div>
              {result.projects.map((name, i) => (
                <button
                  className={`global-result ${cursor === i ? "focused" : ""}`}
                  key={`project:${name}`}
                  onClick={() => onProject(name)}
                >
                  <Folder size={18} />
                  <div>
                    <strong>{name}</strong>
                    <span>项目</span>
                  </div>
                </button>
              ))}
              {result.tasks.map((task, i) => (
                <button
                  className={`global-result ${cursor === result.projects.length + i ? "focused" : ""}`}
                  key={task.id}
                  onClick={() => onTask(task)}
                >
                  {task.done ? (
                    <CheckCheck size={18} />
                  ) : (
                    <span className="search-task-dot" />
                  )}
                  <div>
                    <strong>{task.title || "新任务"}</strong>
                    <p>{excerpt(task)}</p>
                    <span>
                      {task.done ? "已完成" : "待办"} ·{" "}
                      {
                        outlineGroups.find((g) => g.quadrant === task.quadrant)
                          ?.title
                      }
                      {task.project && ` · ${task.project}`}
                    </span>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <div className="search-placeholder">
              搜索任务、笔记、项目、日期、文件夹路径
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
