import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowUp,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  ExternalLink,
  Folder,
  FolderOpen,
  LayoutGrid,
  ListTree,
  Link2,
  Pencil,
  RotateCcw,
  LoaderCircle,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  clamp,
  initialWorkspace,
  localParse,
  makeTask,
  nodeDiameter,
  pointToQuadrant,
  quadrants,
  type ModelConfig,
  type Quadrant,
  type Task,
  type Workspace,
} from "./model";
import { loadWorkspace, saveWorkspace } from "./storage";
import { completion, parseTasks } from "./ai";
import Outline from "./Outline";
import { TaskGraph, TaskConnections } from "./Graph";
import GlobalSearch from "./GlobalSearch";
import ProjectEditor from "./ProjectEditor";
import {
  graphLinks,
  projectNames,
  renameProject,
  deleteProject,
  changeTask,
  connectTasks,
  disconnectTasks,
  resetLinks,
  matchesSearch,
  taskSearchText,
  mergeWorkspace,
  removeTask,
} from "./workspace";

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "outline" | "done">("board");
  const [project, setProject] = useState("");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [projectEditor, setProjectEditor] = useState<string | null>(null);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 680);
  const [notice, setNotice] = useState("");
  const [boardSize, setBoardSize] = useState({ width: 1000, height: 650 });
  const boardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<{
    id: string;
    type: "move" | "resize";
    startX: number;
    startY: number;
    size: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify = (message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6000);
  };
  useEffect(() => {
    loadWorkspace()
      .then((w) => {
        setWorkspace(w);
        setReady(true);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);
  useEffect(() => {
    if (ready)
      saveWorkspace(workspace).catch((e) => notify(`保存失败：${String(e)}`));
  }, [workspace, ready]);
  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setBoardSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, view]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setSettings(false);
        setGlobalSearch(false);
        setProjectEditor(null);
        setConnectSource(null);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setGlobalSearch(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const updateTask = (id: string, change: Partial<Task>) =>
    setWorkspace((w) => changeTask(w, id, change));
  const visible = workspace.tasks.filter(
    (t) =>
      t.done === (view === "done") &&
      (!project || t.project === project) &&
      matchesSearch(taskSearchText(t), query),
  );
  const active = workspace.tasks.find((t) => t.id === selected);
  const projects = projectNames(workspace);
  const focusedNode = connectSource || hovered || selected;
  const relatedNodes = new Set(
    graphLinks(workspace).flatMap((link) =>
      link.source === focusedNode
        ? [link.target]
        : link.target === focusedNode
          ? [link.source]
          : [],
    ),
  );
  const connect = (source: string, target: string) =>
    setWorkspace((w) => connectTasks(w, source, target));
  function chooseTask(id: string) {
    if (connectSource) {
      const from = workspace.tasks.find((t) => t.id === connectSource),
        to = workspace.tasks.find((t) => t.id === id);
      if (from && to && from.quadrant === to.quadrant && id !== connectSource) {
        connect(connectSource, id);
        setConnectSource(null);
        notify("已连接");
      } else notify("请选择同象限的另一项任务");
    } else setSelected((current) => (current === id ? null : id));
  }
  const pending = workspace.tasks.filter((t) => !t.done).length;
  const completed = workspace.tasks.filter((t) => t.done).length;
  function addTasks(values: (Partial<Task> & Pick<Task, "title">)[]) {
    setWorkspace((w) => {
      const tasks = [...w.tasks];
      for (const value of values) {
        const count = tasks.filter(
          (t) => !t.done && t.quadrant === (value.quadrant ?? 1),
        ).length;
        tasks.push(
          makeTask({
            x: [0.3, 0.68, 0.48, 0.75, 0.23][count % 5],
            y: [0.45, 0.62, 0.73, 0.35, 0.7][count % 5],
            project,
            ...value,
          }),
        );
      }
      return { ...w, tasks };
    });
    if (view === "done") setView("board");
    setQuery("");
    setProject("");
  }
  async function submit() {
    if (!input.trim() || busy) return;
    const source = input.trim();
    setBusy(true);
    try {
      const tasks = workspace.config.model.trim()
        ? await parseTasks(source, workspace.config)
        : [localParse(source)];
      addTasks(tasks);
      setInput("");
      notify(
        `已添加 ${tasks.length} 个任务${workspace.config.model.trim() ? " · AI 已整理" : " · 可点击圆点继续编辑"}`,
      );
    } catch (e) {
      notify(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  function startGesture(
    event: PointerEvent,
    task: Task,
    type: "move" | "resize",
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pos = position(task);
    gesture.current = {
      id: task.id,
      type,
      startX: event.clientX,
      startY: event.clientY,
      size: task.size,
      x: pos.x,
      y: pos.y,
      moved: false,
    };
  }
  function moveGesture(event: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.startX,
      dy = event.clientY - g.startY;
    if (Math.hypot(dx, dy) < 4 && !g.moved) return;
    g.moved = true;
    setSelected(null);
    if (g.type === "resize")
      updateTask(g.id, {
        size: clamp(g.size + ((dx + dy) / Math.SQRT2) * 6, 72, 180),
      });
    else
      updateTask(
        g.id,
        pointToQuadrant(g.x + dx, g.y + dy, boardSize.width, boardSize.height),
      );
  }
  function endGesture(event: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && g.type === "move") chooseTask(g.id);
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function position(task: Task) {
    const width = boardSize.width / 2,
      height = boardSize.height / 2;
    const radius = nodeDiameter(task.size) / 2 + 24;
    return {
      x:
        (1 - (task.quadrant % 2)) * width +
        clamp(task.x * width, radius, Math.max(radius, width - radius)),
      y:
        Math.floor(task.quadrant / 2) * height +
        clamp(
          task.y * height,
          Math.max(radius, 80),
          Math.max(radius, height - radius),
        ),
    };
  }
  async function pickFolder(task: Task) {
    if (!isTauri()) {
      notify("网页预览可填写目录路径；系统文件夹选择与打开请使用桌面版。");
      return;
    }
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: "选择任务文件夹",
      });
      if (typeof path === "string") updateTask(task.id, { folder: path });
    } catch (e) {
      notify(String(e));
    }
  }
  async function launchFolder(path: string) {
    if (!isTauri()) {
      notify("打开本地文件夹需要运行 FocusDesk 桌面版。");
      return;
    }
    try {
      await openPath(path);
    } catch (e) {
      notify(`打开失败：${String(e)}`);
    }
  }
  function exportData() {
    const data = {
      version: 2,
      tasks: workspace.tasks,
      projects,
      links: workspace.links,
      manualQuadrants: workspace.manualQuadrants,
      config: { ...workspace.config, key: "" },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "focusdesk-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    notify("已导出任务与模型设置（不包含 API Key）");
  }
  async function importData(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (
        !Array.isArray(data.tasks) ||
        !data.tasks.every(
          (t: Task) =>
            typeof t.id === "string" &&
            typeof t.title === "string" &&
            [0, 1, 2, 3].includes(t.quadrant) &&
            Number.isFinite(t.x) &&
            Number.isFinite(t.y) &&
            Number.isFinite(t.size),
        )
      )
        throw new Error("文件不是有效的 FocusDesk 备份");
      setWorkspace((w) => mergeWorkspace(w, data));
      notify("备份已合并，相同任务不会重复添加");
    } catch (e) {
      notify(`导入失败：${String(e)}`);
    }
  }
  const activePosition = active ? position(active) : { x: 0, y: 0 };
  const popoverStyle = {
    left: clamp(
      activePosition.x + (active ? nodeDiameter(active.size) : 0) / 2 + 24,
      8,
      Math.max(8, boardSize.width - 340),
    ),
    top: clamp(activePosition.y - 85, 8, Math.max(8, boardSize.height - 470)),
    transformOrigin:
      activePosition.x > boardSize.width / 2 ? "right center" : "left center",
  };
  if (loadError)
    return (
      <div className="startup">
        <h2>工作台未能加载</h2>
        <p>{loadError}</p>
        <button onClick={() => location.reload()}>重新加载</button>
      </div>
    );
  if (!ready)
    return (
      <div className="startup">
        <LoaderCircle className="spin" /> 正在打开工作台…
      </div>
    );
  return (
    <div className={`app ${sidebar ? "" : "collapsed"}`}>
      {sidebar && (
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <span />
              <span />
              <span />
              <span />
            </div>
            <strong>FocusDesk</strong>
            <button
              className="icon-button"
              title="收起侧边栏"
              onClick={() => setSidebar(false)}
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
          <button
            className="global-search-trigger"
            onClick={() => setGlobalSearch(true)}
          >
            <Search size={17} />
            <span>全局搜索</span>
          </button>
          <button
            className="new-task"
            onClick={() => {
              if (view === "done") setView("board");
              inputRef.current?.focus();
            }}
          >
            <Plus size={18} /> 新建任务
          </button>
          <div className="nav-caption">工作空间</div>
          <button
            className={`nav-item ${view === "board" && !project ? "chosen" : ""}`}
            onClick={() => {
              setView("board");
              setProject("");
              setSelected(null);
            }}
          >
            <LayoutGrid size={18} /> 四象限 <span>{pending}</span>
          </button>
          <button
            className={`nav-item ${view === "outline" && !project ? "chosen" : ""}`}
            onClick={() => {
              setView("outline");
              setProject("");
              setSelected(null);
            }}
          >
            <ListTree size={18} /> 笔记
          </button>
          <button
            className={`nav-item ${view === "done" ? "chosen" : ""}`}
            onClick={() => {
              setView("done");
              setProject("");
              setSelected(null);
            }}
          >
            <CheckCheck size={18} /> 已完成 <span>{completed}</span>
          </button>
          <div className="nav-caption projects-heading">
            我的项目
            <button
              className="icon-button"
              title="新建项目"
              onClick={() => setProjectEditor("")}
            >
              <Plus size={15} />
            </button>
          </div>
          {projects.map((name, i) => (
            <div className="project-row" key={name}>
              <button
                className={`nav-item project-item ${project === name && view !== "done" ? "chosen" : ""}`}
                onClick={() => {
                  setProject(name);
                  if (view === "done") setView("board");
                  setSelected(null);
                  setQuery("");
                }}
              >
                <i
                  style={{
                    background: ["#9db7a4", "#cfb48c", "#a5a1ce"][i % 3],
                  }}
                />
                {name}
                <span>
                  {
                    workspace.tasks.filter((t) => !t.done && t.project === name)
                      .length
                  }
                </span>
              </button>
              <button
                className="icon-button project-edit"
                title={`编辑项目：${name}`}
                onClick={() => setProjectEditor(name)}
              >
                <Pencil size={13} />
              </button>
            </div>
          ))}
          <div className="sidebar-bottom">
            <button className="nav-item" onClick={() => setSettings(true)}>
              <Settings2 size={18} /> 模型与设置 <ChevronRight size={15} />
            </button>
          </div>
        </aside>
      )}
      <main className="main">
        <header className="topbar">
          <div>
            {!sidebar && (
              <button
                className="icon-button"
                onClick={() => setSidebar(true)}
                title="展开侧边栏"
              >
                <LayoutGrid size={18} />
              </button>
            )}
            {!sidebar && (
              <button
                className="icon-button"
                title="全局搜索"
                onClick={() => setGlobalSearch(true)}
              >
                <Search size={17} />
              </button>
            )}
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>
              {view === "done"
                ? "已完成"
                : project || (view === "outline" ? "笔记" : "四象限")}
            </strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              title="导出备份"
              onClick={exportData}
            >
              <Download size={17} />
            </button>
            <button
              className="icon-button"
              title="导入备份"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={17} />
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                void importData(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </header>
        <section className="workspace-heading">
          <h1>
            {view === "done"
              ? "已完成"
              : project || (view === "outline" ? "笔记" : "四象限")}
          </h1>
          <div className="heading-actions">
            {view !== "done" && (
              <div className="view-switch" role="group" aria-label="切换视图">
                <button
                  className={view === "outline" ? "active" : ""}
                  aria-pressed={view === "outline"}
                  onClick={() => {
                    setView("outline");
                    setSelected(null);
                  }}
                >
                  <ListTree size={15} />
                  笔记
                </button>
                <button
                  className={view === "board" ? "active" : ""}
                  aria-pressed={view === "board"}
                  onClick={() => {
                    setView("board");
                    setSelected(null);
                  }}
                >
                  <LayoutGrid size={15} />
                  四象限
                </button>
              </div>
            )}
            <label className="search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索任务"
                aria-label="搜索任务"
              />
            </label>
          </div>
        </section>
        {view === "board" ? (
          <div className="board-shell">
            <div
              className="board"
              ref={boardRef}
              onClick={() => setSelected(null)}
            >
              {quadrants.map((q, i) => (
                <section
                  key={q.title}
                  className={`quadrant ${q.color}`}
                  style={{
                    gridColumn: 2 - (i % 2),
                    gridRow: Math.floor(i / 2) + 1,
                  }}
                >
                  <div className="quadrant-header">
                    <div className="quadrant-symbol">
                      {["↗", "◷", "ϟ", "☁"][i]}
                    </div>
                    <div>
                      <h2>
                        {q.title}
                        <span>
                          {visible.filter((t) => t.quadrant === i).length}
                        </span>
                      </h2>
                    </div>
                    {workspace.manualQuadrants.includes(i as Quadrant) && (
                      <button
                        className="icon-button reset-links"
                        title={`恢复${q.title}按时间连接`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setWorkspace((w) => resetLinks(w, i as Quadrant));
                        }}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                    <button
                      title={`添加到${q.title}`}
                      className="quadrant-add icon-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const t = makeTask({
                          title: "新任务",
                          quadrant: i as Quadrant,
                          project,
                        });
                        setWorkspace((w) => ({ ...w, tasks: [...w.tasks, t] }));
                        setSelected(t.id);
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </section>
              ))}
              <div
                className="coordinate-axes"
                aria-label="横轴：紧急性，向右增加；纵轴：重要性，向上增加"
              >
                <div className="x-axis">
                  <span className="axis-label">紧急性</span>
                </div>
                <div className="y-axis">
                  <span className="axis-label">重要性</span>
                </div>
              </div>
              <TaskGraph
                workspace={workspace}
                visible={visible}
                position={position}
                width={boardSize.width}
                height={boardSize.height}
                selected={focusedNode}
              />
              {connectSource && (
                <div className="connect-banner">
                  <Link2 size={14} />
                  选择同象限任务
                  <button
                    title="取消连线"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnectSource(null);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {visible.map((task) => {
                const pos = position(task);
                return (
                  <div
                    key={task.id}
                    className={`task-node ${selected === task.id ? "selected" : ""} ${focusedNode === task.id ? "highlighted" : ""} ${relatedNodes.has(task.id) ? "related" : ""} ${focusedNode && focusedNode !== task.id && !relatedNodes.has(task.id) ? "muted" : ""}`}
                    style={
                      {
                        left: pos.x,
                        top: pos.y,
                        width: Math.max(32, nodeDiameter(task.size)),
                        height: Math.max(32, nodeDiameter(task.size)),
                        "--node-size": `${nodeDiameter(task.size)}px`,
                        "--label-width": `${Math.min(160, boardSize.width / 2 - 24)}px`,
                        "--label-shift": `${clamp(pos.x % (boardSize.width / 2), Math.min(80, boardSize.width / 4 - 12) + 8, boardSize.width / 2 - Math.min(80, boardSize.width / 4 - 12) - 8) - (pos.x % (boardSize.width / 2))}px`,
                      } as CSSProperties
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`任务：${task.title || "新任务"}`}
                    onPointerEnter={() => setHovered(task.id)}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => setHovered(task.id)}
                    onBlur={() => setHovered(null)}
                    onPointerDown={(e) => startGesture(e, task, "move")}
                    onPointerMove={moveGesture}
                    onPointerUp={endGesture}
                    onPointerCancel={() => {
                      gesture.current = null;
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        chooseTask(task.id);
                      }
                    }}
                  >
                    <span className="node-dot" />
                    <span className="node-title">{task.title || "新任务"}</span>
                    <button
                      className="resize-handle"
                      aria-label={`调整${task.title}大小`}
                      title="拖动调整优先级大小"
                      onPointerDown={(e) => startGesture(e, task, "resize")}
                      onPointerMove={moveGesture}
                      onPointerUp={endGesture}
                    >
                      <span />
                    </button>
                  </div>
                );
              })}
              {active && !active.done && (
                <div
                  className="task-popover"
                  style={popoverStyle}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="popover-top">
                    <span
                      className={`pill ${quadrants[active.quadrant].color}`}
                    >
                      {quadrants[active.quadrant].subtitle}
                    </span>
                    <button
                      className="icon-button"
                      title="关闭详情"
                      onClick={() => setSelected(null)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <input
                    className="task-title-input"
                    aria-label="任务名称"
                    value={active.title}
                    onChange={(e) =>
                      updateTask(active.id, { title: e.target.value })
                    }
                  />
                  <textarea
                    className="description-input"
                    aria-label="任务说明"
                    placeholder="任务说明"
                    value={active.description}
                    onChange={(e) =>
                      updateTask(active.id, { description: e.target.value })
                    }
                  />
                  <div className="detail-grid">
                    <label>
                      截止日期
                      <input
                        type="date"
                        value={active.due}
                        onChange={(e) =>
                          updateTask(active.id, { due: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      所属项目
                      <input
                        placeholder="例如：工作"
                        value={active.project}
                        onChange={(e) =>
                          updateTask(active.id, { project: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="field-label">
                    任务象限
                    <select
                      value={active.quadrant}
                      onChange={(e) =>
                        updateTask(active.id, {
                          quadrant: Number(e.target.value) as Quadrant,
                        })
                      }
                    >
                      {quadrants.map((q, i) => (
                        <option key={i} value={i}>
                          {q.title} · {q.subtitle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="priority-control">
                    象限内优先级{" "}
                    <input
                      aria-label="优先级大小"
                      type="range"
                      min="72"
                      max="180"
                      value={active.size}
                      onChange={(e) =>
                        updateTask(active.id, { size: Number(e.target.value) })
                      }
                    />
                  </label>
                  <TaskConnections
                    key={active.id}
                    task={active}
                    workspace={workspace}
                    onConnect={connect}
                    onDisconnect={(a, b) =>
                      setWorkspace((w) => disconnectTasks(w, a, b))
                    }
                    onNavigate={setSelected}
                  />
                  <button
                    className="start-connection"
                    onClick={() => {
                      setConnectSource(active.id);
                      setSelected(null);
                    }}
                  >
                    <Link2 size={14} />
                    在画布上连接
                  </button>
                  <div className="folder-block">
                    <div>
                      <Folder size={15} />
                      <span>关联文件夹</span>
                      <button onClick={() => void pickFolder(active)}>
                        {active.folder ? "更换" : "选择文件夹"}
                      </button>
                    </div>
                    <input
                      aria-label="文件夹路径"
                      placeholder="文件夹路径"
                      value={active.folder}
                      onChange={(e) =>
                        updateTask(active.id, { folder: e.target.value })
                      }
                    />
                    {active.folder && (
                      <button
                        className="open-folder"
                        onClick={() => void launchFolder(active.folder)}
                      >
                        <FolderOpen size={15} /> 打开本地文件夹{" "}
                        <ExternalLink size={13} />
                      </button>
                    )}
                  </div>
                  <div className="popover-footer">
                    <button
                      className="delete-task icon-button"
                      title="删除任务"
                      onClick={() => {
                        setWorkspace((w) => removeTask(w, active.id));
                        setSelected(null);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      className="complete-task"
                      onClick={() => {
                        updateTask(active.id, { done: true });
                        setSelected(null);
                        notify("已完成");
                      }}
                    >
                      <Check size={16} /> 标记完成
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : view === "outline" ? (
          <Outline
            tasks={visible}
            project={project}
            onUpdate={updateTask}
            onCreate={(quadrant) => {
              const task = makeTask({ title: "", quadrant, project });
              setWorkspace((w) => ({ ...w, tasks: [...w.tasks, task] }));
              setQuery("");
              return task.id;
            }}
            onDelete={(id) => setWorkspace((w) => removeTask(w, id))}
            onPickFolder={(task) => void pickFolder(task)}
            onOpenFolder={(path) => void launchFolder(path)}
          />
        ) : (
          <section className="completed-list">
            {visible.length ? (
              visible.map((task) => (
                <article
                  key={task.id}
                  className={selected === task.id ? "search-selected-task" : ""}
                >
                  <span className="completed-icon">
                    <Check size={18} />
                  </span>
                  <div>
                    <h3>{task.title}</h3>
                    {selected === task.id && (
                      <p className="completed-description">
                        {task.description}
                      </p>
                    )}
                    <p>
                      {task.project || "未分类"}
                      {task.due ? ` · ${task.due}` : ""}
                    </p>
                  </div>
                  {task.folder && (
                    <button
                      className="icon-button"
                      title="打开文件夹"
                      onClick={() => void launchFolder(task.folder)}
                    >
                      <FolderOpen size={17} />
                    </button>
                  )}
                  <button onClick={() => updateTask(task.id, { done: false })}>
                    恢复任务
                  </button>
                  <button
                    className="icon-button"
                    title="删除任务"
                    onClick={() => setWorkspace((w) => removeTask(w, task.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <CheckCheck size={36} />
                <h3>暂无已完成任务</h3>
              </div>
            )}
          </section>
        )}
        <footer className="composer-area">
          <div className={`composer ${busy ? "is-busy" : ""}`}>
            <textarea
              ref={inputRef}
              aria-label="输入任务"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="输入任务…"
              rows={1}
            />
            <div className="composer-bottom">
              <button className="model-chip" onClick={() => setSettings(true)}>
                <Sparkles size={14} />
                {workspace.config.model || "本地快速记录"}
                <ChevronRight size={12} />
              </button>
              <div>
                <button
                  className="send-button"
                  aria-label="创建任务"
                  disabled={busy || !input.trim()}
                  onClick={() => void submit()}
                >
                  {busy ? (
                    <LoaderCircle size={19} className="spin" />
                  ) : (
                    <ArrowUp size={20} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button className="icon-button" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {globalSearch && (
        <GlobalSearch
          workspace={workspace}
          onClose={() => setGlobalSearch(false)}
          onTask={(task) => {
            setGlobalSearch(false);
            setProject("");
            setQuery(task.done ? task.title : "");
            setView(task.done ? "done" : "board");
            setSelected(task.id);
          }}
          onProject={(name) => {
            setGlobalSearch(false);
            setProject(name);
            setQuery("");
            setView("board");
            setSelected(null);
          }}
        />
      )}
      {projectEditor !== null && (
        <ProjectEditor
          original={projectEditor}
          names={projects}
          onClose={() => setProjectEditor(null)}
          onSave={(name) => {
            setWorkspace((w) =>
              projectEditor
                ? renameProject(w, projectEditor, name)
                : { ...w, projects: [...projectNames(w), name] },
            );
            if (project === projectEditor && projectEditor) setProject(name);
            setProjectEditor(null);
          }}
          onDelete={() => {
            setWorkspace((w) => deleteProject(w, projectEditor));
            if (project === projectEditor) setProject("");
            setProjectEditor(null);
            notify("项目已删除，任务已移至未分类");
          }}
        />
      )}
      {settings && (
        <Settings
          config={workspace.config}
          onClose={() => setSettings(false)}
          onSave={(config) => {
            setWorkspace((w) => ({ ...w, config }));
            setSettings(false);
            notify("模型配置已保存");
          }}
        />
      )}
    </div>
  );
}
function Settings({
  config,
  onSave,
  onClose,
}: {
  config: ModelConfig;
  onSave: (config: ModelConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(config);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");
  async function test() {
    setTesting(true);
    setResult("");
    try {
      await completion(draft, [{ role: "user", content: "Reply with OK." }]);
      setResult("连接成功");
    } catch (e) {
      setResult(`连接失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <div className="settings-icon">
            <Sparkles size={21} />
          </div>
          <button
            className="icon-button"
            aria-label="关闭设置"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <h2>模型设置</h2>
        <label className="field-label">
          API URL
          <input
            placeholder="https://api.openai.com/v1"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
        </label>
        <label className="field-label">
          API Key
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          />
        </label>
        <label className="field-label">
          Model Name
          <input
            placeholder="模型名称"
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
        </label>
        {result && (
          <div
            className={`connection-result ${result.startsWith("连接成功") ? "success" : ""}`}
            role="status"
          >
            {result}
          </div>
        )}
        <div className="modal-actions">
          <button
            className="secondary-button"
            disabled={testing}
            onClick={() => void test()}
          >
            {testing ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <span className="status-dot" />
            )}
            {testing ? "连接中…" : "测试连接"}
          </button>
          <button
            className="primary-button"
            onClick={() =>
              onSave({
                url: draft.url.trim(),
                key: draft.key.trim(),
                model: draft.model.trim(),
              })
            }
          >
            保存配置 <Check size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
