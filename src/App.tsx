import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowUp,
  Undo2,
  Redo2,
  CalendarDays,
  NotebookPen,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
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
import { openPath } from "@tauri-apps/plugin-opener";
import {
  clamp,
  makeEvent,
  type CalendarEvent,
  makeTask,
  nodeDiameter,
  pointToQuadrant,
  quadrants,
  type ModelConfig,
  type Quadrant,
  type Task,
  type Workspace,
} from "./model";
import { loadWorkspace, saveWorkspace, writeLocal, readLocal } from "./storage";
import { completion } from "./ai";
import Outline from "./Outline";
import Calendar from "./CalendarView";
import EventEditor from "./EventEditor";
import {
  dateKey,
  defaultSchedule,
  scheduleLabel,
  validSchedule,
  type Schedule,
  type CalendarMode,
} from "./calendar";
import { parseIntake, type IntakeMode } from "./intake";
import { TaskGraph, TaskConnections } from "./Graph";
import GlobalSearch from "./GlobalSearch";
import ProjectEditor from "./ProjectEditor";
import {
  graphLinks,
  eventDetails,
  eventSearchText,
  projectNames,
  renameProject,
  changeTask,
  connectTasks,
  disconnectTasks,
  resetLinks,
  matchesSearch,
  taskSearchText,
  mergeWorkspace,
} from "./workspace";

import useWorkspace from "./useWorkspace";
import FolderLinks, { folderPaths } from "./FolderLinks";
import WorkspaceSettings from "./WorkspaceSettings";
import SyncReview from "./SyncReview";
import {
  defaultDevice,
  loadDevice,
  saveDevice,
  createProjectDirectory,
  createWorkspaceDirectory,
  type DeviceSettings,
} from "./device";
import { autoBackup, createBackup, trashItem } from "./recovery";
import { prepareSync, uploadSync, targetKey, type SyncPlan } from "./sync";
import { syncDocument, mergeDocuments, applyDocument } from "./syncModel";
import {
  expandEvents,
  updateOccurrence,
  type OccurrenceScope,
} from "./recurrence";
import {
  configureShortcut,
  notificationPermission,
  notifyEvent,
} from "./desktop";

const TaskNotes = lazy(() => import("./TaskNotes"));

export default function App() {
  const {
    workspace,
    current: workspaceRef,
    setWorkspace,
    replaceWorkspace,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useWorkspace();
  const [device, setDevice] = useState<DeviceSettings>(defaultDevice);
  const [workSettings, setWorkSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState("尚未同步");
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const syncing = useRef(false);
  const syncSettingsRef = useRef(device.sync);
  syncSettingsRef.current = device.sync;
  const syncTrigger = useRef<() => void>(() => {});
  const [captureResult, setCaptureResult] = useState<{
    tasks: string[];
    events: string[];
    label: string;
  } | null>(null);
  const [notesTaskId, setNotesTaskId] = useState<string | null>(null);
  const notesTask =
    workspace.tasks.find((task) => task.id === notesTaskId) ??
    workspace.events.find((event) => event.id === notesTaskId);
  const [eventDraft, setEventDraft] = useState<CalendarEvent | null>(null);
  const [calendarDay, setCalendarDay] = useState(dateKey(new Date()));
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("auto");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "outline" | "done" | "calendar">(
    "board",
  );
  const [project, setProject] = useState<string | null>("");
  const projectLabel = project === null ? "未分类" : project;
  const taskProject = project ?? "";
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [projectEditor, setProjectEditor] = useState<string | null>(null);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 680);
  const [notice, setNotice] = useState("");
  const [boardSize, setBoardSize] = useState({
    width: 1000,
    height: 650,
    top: 160,
    viewportHeight: window.innerHeight,
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverHeight, setPopoverHeight] = useState(480);
  const [adjustingPriority, setAdjustingPriority] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<{
    id: string;
    startX: number;
    startY: number;
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
    Promise.all([loadWorkspace(), loadDevice()])
      .then(([w, d]) => {
        replaceWorkspace(w);
        setDevice(d);
        setReady(true);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);
  useEffect(() => {
    if (ready)
      saveWorkspace(workspace)
        .then(() => autoBackup(workspace))
        .catch((e) => notify(`保存失败：${String(e)}`));
  }, [workspace, ready]);
  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setBoardSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
        top: node.getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
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
        setEventDraft(null);
        setWorkSettings(false);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setGlobalSearch(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const finish = () => setAdjustingPriority(false);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, []);
  useEffect(() => setAdjustingPriority(false), [selected, view]);
  useLayoutEffect(() => {
    const node = popoverRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setPopoverHeight(node.offsetHeight),
    );
    setPopoverHeight(node.offsetHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [selected, view]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input,textarea,[contenteditable=true]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => {
    if (ready)
      void configureShortcut(device.quickCapture, () =>
        inputRef.current?.focus(),
      ).catch((e) => notify(String(e)));
  }, [ready, device.quickCapture]);
  useEffect(() => {
    if (!ready || !device.notifications) return;
    let cancelled = false;
    const notified = new Set<string>();
    async function check() {
      const day = dateKey(new Date()),
        events = expandEvents(
          workspaceRef.current.events,
          day,
          dateKey(new Date(Date.now() + 86400000)),
        );
      for (const event of events) {
        if (event.reminder === undefined) continue;
        const start = new Date(event.start).getTime(),
          due = start - event.reminder * 60000,
          key = `reminded:${event.id}:${event.start}:${event.reminder}`;
        if (Date.now() < due || Date.now() > start + 60000 || notified.has(key))
          continue;
        notified.add(key);
        if ((await readLocal(key)) || cancelled) continue;
        await notifyEvent(event.title, scheduleLabel(event));
        await writeLocal(key, "1");
      }
    }
    void check().catch((e) => notify(String(e)));
    const timer = setInterval(
      () => void check().catch((e) => notify(String(e))),
      15000,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ready, device.notifications]);
  const portableText = JSON.stringify(syncDocument(workspace));
  useEffect(() => {
    if (!ready || !device.sync.enabled || !device.sync.auto || syncPlan) return;
    const timer = setTimeout(() => syncTrigger.current(), 30000);
    return () => clearTimeout(timer);
  }, [ready, portableText, device.sync, syncPlan]);
  useEffect(() => {
    if (!ready || !device.sync.enabled || !device.sync.auto) return;
    const timer = setInterval(() => syncTrigger.current(), 5 * 60 * 1000);
    const focus = () => syncTrigger.current();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [ready, device.sync.enabled, device.sync.auto]);
  async function updateDevice(value: DeviceSettings) {
    if (
      value.notifications &&
      !device.notifications &&
      !(await notificationPermission())
    )
      throw new Error("系统未允许通知，请在系统设置中开启");
    if (value.quickCapture !== device.quickCapture)
      await configureShortcut(value.quickCapture, () =>
        inputRef.current?.focus(),
      );
    await saveDevice(value);
    setDevice(value);
    setSyncPlan(null);
  }
  async function ensureProjectFolders(value: Workspace, root = device.root) {
    if (!isTauri()) return value;
    if (!root) {
      root = await createWorkspaceDirectory();
      const nextDevice = { ...device, root };
      await saveDevice(nextDevice);
      setDevice(nextDevice);
    }
    const folders = { ...value.projectFolders };
    for (const name of projectNames(value))
      if (!folders[name]?.length) {
        const path = await createProjectDirectory(root, name);
        folders[name] = [path];
      }
    return { ...value, projectFolders: folders };
  }
  async function setRoot(root: string) {
    const next = await ensureProjectFolders(workspaceRef.current, root);
    await updateDevice({ ...device, root });
    setWorkspace(next);
  }
  async function finishSync(
    plan: SyncPlan,
    choices: Record<string, "local" | "remote">,
  ) {
    if (syncing.current) return;
    syncing.current = true;
    setSyncBusy(true);
    setSyncStatus("同步中…");
    const settings = { ...device.sync };
    try {
      if (!settings.enabled || plan.target !== targetKey(settings))
        throw new Error("同步配置已变化，请重新同步");
      const latest = syncDocument(workspaceRef.current);
      if (JSON.stringify(latest) !== JSON.stringify(plan.local)) {
        setSyncPlan({ ...plan, local: latest });
        throw new Error("本地数据已变化，请重新确认合并结果");
      }
      await createBackup(workspaceRef.current, "同步前备份");
      if (mergeDocuments(plan.base, plan.local, plan.remote).conflicts.length)
        await createBackup(
          applyDocument(workspaceRef.current, plan.remote),
          "冲突时云端版本",
        );
      if (
        !syncSettingsRef.current.enabled ||
        targetKey(syncSettingsRef.current) !== plan.target
      )
        throw new Error("同步已关闭或配置已变化");
      const uploaded = await uploadSync(settings, plan, choices);
      const current = workspaceRef.current;
      const concurrent = mergeDocuments(
        plan.local,
        syncDocument(current),
        uploaded,
      );
      const next = applyDocument(current, concurrent.document);
      if (concurrent.conflicts.length) {
        const fresh = await prepareSync(
          settings,
          syncDocument(workspaceRef.current),
        );
        setSyncPlan({ ...fresh, base: plan.local, first: false });
        setSyncStatus("同步期间有新修改，请确认冲突");
        return;
      }
      const withFolders = await ensureProjectFolders(next);
      const finalMerge = mergeDocuments(
        syncDocument(current),
        syncDocument(workspaceRef.current),
        syncDocument(withFolders),
      );
      if (finalMerge.conflicts.length) {
        const fresh = await prepareSync(
          settings,
          syncDocument(workspaceRef.current),
        );
        setSyncPlan({ ...fresh, base: plan.local, first: false });
        setSyncStatus("同步期间有新修改，请确认冲突");
        return;
      }
      setWorkspace({
        ...applyDocument(workspaceRef.current, finalMerge.document),
        projectFolders: {
          ...withFolders.projectFolders,
          ...workspaceRef.current.projectFolders,
        },
      });
      await saveWorkspace(workspaceRef.current);
      await writeLocal(`sync-base:${plan.target}`, JSON.stringify(uploaded));
      const syncedAt = new Date().toISOString();
      await writeLocal(`sync-date:${plan.target}`, syncedAt);
      const history = JSON.parse((await readLocal("sync-history")) || "[]");
      await writeLocal(
        "sync-history",
        JSON.stringify(
          [{ date: syncedAt, target: plan.target }, ...history].slice(0, 30),
        ),
      );
      setSyncPlan(null);
      setSyncStatus(
        concurrent.conflicts.length
          ? "本地有新修改，待下次同步"
          : `已同步 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      );
    } catch (e) {
      setSyncStatus(`同步失败：${String(e instanceof Error ? e.message : e)}`);
      notify(String(e instanceof Error ? e.message : e));
    } finally {
      syncing.current = false;
      setSyncBusy(false);
    }
  }
  async function startSync() {
    if (!device.sync.enabled || syncing.current || syncPlan) return;
    syncing.current = true;
    setSyncBusy(true);
    setSyncStatus("正在读取云端…");
    const settings = { ...device.sync };
    try {
      const plan = await prepareSync(
        settings,
        syncDocument(workspaceRef.current),
      );
      if (
        !syncSettingsRef.current.enabled ||
        targetKey(syncSettingsRef.current) !== plan.target
      )
        return;
      plan.local = syncDocument(workspaceRef.current);
      if (
        !plan.first &&
        JSON.stringify(plan.local) === JSON.stringify(plan.remote)
      ) {
        await writeLocal(
          `sync-base:${plan.target}`,
          JSON.stringify(plan.remote),
        );
        setSyncStatus(
          `已同步 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        );
        return;
      }
      syncing.current = false;
      setSyncBusy(false);
      if (
        plan.first ||
        mergeDocuments(plan.base, plan.local, plan.remote).conflicts.length
      ) {
        setSyncPlan(plan);
        setSyncStatus("等待确认合并");
      } else await finishSync(plan, {});
    } catch (e) {
      setSyncStatus(`同步失败：${String(e instanceof Error ? e.message : e)}`);
    } finally {
      syncing.current = false;
      setSyncBusy(false);
    }
  }
  syncTrigger.current = () => void startSync();
  const updateTask = (id: string, change: Partial<Task>) =>
    setWorkspace((w) => changeTask(w, id, change));
  const visible = workspace.tasks.filter(
    (t) =>
      t.done === (view === "done") &&
      (Boolean(project) || !workspace.archivedProjects.includes(t.project)) &&
      (project === "" || t.project === taskProject) &&
      matchesSearch(
        taskSearchText(t) +
          "\n" +
          (workspace.projectFolders[t.project] ?? []).join("\n"),
        query,
      ),
  );
  const active = workspace.tasks.find((t) => t.id === selected);
  const projects = projectNames(workspace);
  const activeProjects = projects.filter(
    (p) => !workspace.archivedProjects.includes(p),
  );
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
  const projectCount = (name: string) =>
    view === "calendar"
      ? workspace.events.filter(
          (e) => eventDetails(workspace, e).project === name,
        ).length
      : workspace.tasks.filter((t) => !t.done && t.project === name).length;
  const pending = workspace.tasks.filter((t) => !t.done).length;
  const completed = workspace.tasks.filter((t) => t.done).length;
  function addTasks(values: (Partial<Task> & Pick<Task, "title">)[]) {
    const created: string[] = [];
    setWorkspace((w) => {
      const tasks = [...w.tasks];
      for (const value of values) {
        const count = tasks.filter(
          (t) => !t.done && t.quadrant === (value.quadrant ?? 1),
        ).length;
        const nextTask = makeTask({
          x: [0.3, 0.68, 0.48, 0.75, 0.23][count % 5],
          y: [0.45, 0.62, 0.73, 0.35, 0.7][count % 5],
          project: taskProject,
          ...value,
        });
        tasks.push(nextTask);
        created.push(nextTask.id);
      }
      return { ...w, tasks };
    });
    if (view === "done") setView("board");
    setQuery("");
    setProject("");
    return created;
  }
  async function submit() {
    if (!input.trim() || busy) return;
    const source = input.trim();
    setBusy(true);
    try {
      const items = await parseIntake(
        source,
        workspace.tasks,
        workspace.config,
        intakeMode,
      );
      const tasks = items
        .filter((item) => item.kind === "task")
        .map((item) => item.value);
      const events = items
        .filter((item) => item.kind === "event")
        .map((item) =>
          makeEvent({
            ...item.value,
            project: item.value.project || taskProject,
          }),
        );
      const createdIds = tasks.length ? addTasks(tasks) : [];
      if (events.length) {
        setWorkspace((w) => ({ ...w, events: [...w.events, ...events] }));
        setCalendarDay(events[0].start.slice(0, 10));
        setCalendarMode("day");
        setView("calendar");
        setProject("");
        setQuery("");
        setSelected(null);
      } else if (view === "calendar") setView("board");
      try {
        const beforeFolders = workspaceRef.current;
        const withFolders = await ensureProjectFolders(beforeFolders);
        setWorkspace((w) => ({
          ...w,
          projectFolders: {
            ...withFolders.projectFolders,
            ...w.projectFolders,
          },
        }));
      } catch (e) {
        notify(`记录已创建，但项目目录未建立：${String(e)}`);
      }
      setCaptureResult({
        tasks: createdIds,
        events: events.map((e) => e.id),
        label: events.length
          ? `${events[0].title} · ${scheduleLabel(events[0])}${events[0].recurrence ? " · 重复日程" : ""}`
          : tasks.map((t) => t.title).join("、"),
      });
      setInput("");
      notify(
        [
          tasks.length ? `已添加 ${tasks.length} 个任务` : "",
          events.length
            ? `已添加 ${events.length} 项日程 · ${scheduleLabel(events[0])}${events[0].taskId ? " · 已关联任务" : ""}`
            : "",
        ]
          .filter(Boolean)
          .join("；"),
      );
    } catch (e) {
      notify(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  function newEvent(
    schedule: Schedule = defaultSchedule(calendarDay),
    task?: Task,
  ) {
    setEventDraft(
      makeEvent({
        ...schedule,
        title: task?.title || "",
        taskId: task?.id,
        project: task?.project || taskProject,
      }),
    );
    setSelected(null);
  }
  function saveEvent(event: CalendarEvent, scope: OccurrenceScope = "this") {
    const oldEvents = workspaceRef.current.events;
    const next = updateOccurrence(oldEvents, event, scope);
    const saved =
      next.find((e) => !oldEvents.some((old) => old.id === e.id)) ??
      next.find((e) => e.id === (event.seriesId || event.id));
    setWorkspace((w) => ({ ...w, events: next }));
    setCalendarDay(event.start.slice(0, 10));
    setEventDraft(null);
    return saved?.id || event.id;
  }
  function deleteEvent(event: CalendarEvent, scope: OccurrenceScope) {
    setWorkspace((w) => {
      if (!event.recurrence) return trashItem(w, "event", event.id);
      const root = w.events.find((e) => e.id === (event.seriesId || event.id));
      if (!root) return w;
      const removed = trashItem(w, "event", root.id);
      const { seriesId: _s, occurrenceDate: _o, ...saved } = event;
      const restorable = {
        ...saved,
        id: crypto.randomUUID(),
        recurrence: scope === "this" ? undefined : saved.recurrence,
        excludedDates:
          scope === "this"
            ? undefined
            : saved.excludedDates?.filter(
                (d) => d >= (event.occurrenceDate || event.start.slice(0, 10)),
              ),
      };
      return {
        ...removed,
        trash: [
          { ...removed.trash[0], events: [restorable] },
          ...removed.trash.slice(1),
        ],
        events: updateOccurrence(w.events, event, scope, true),
      };
    });
    setEventDraft(null);
  }
  function startGesture(event: PointerEvent, task: Task) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pos = position(task);
    gesture.current = {
      id: task.id,
      startX: event.clientX,
      startY: event.clientY,
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
    updateTask(
      g.id,
      pointToQuadrant(g.x + dx, g.y + dy, boardSize.width, boardSize.height),
    );
  }
  function endGesture(event: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved) chooseTask(g.id);
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
  async function launchFolder(path: string) {
    if (!isTauri()) {
      notify("打开本地文件夹需要运行 松果 Pinecone 桌面版。");
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
      version: 4,
      projectFolders: workspace.projectFolders,
      archivedProjects: workspace.archivedProjects,
      trash: workspace.trash,
      deleted: workspace.deleted,
      events: workspace.events,
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
    link.download = "pinecone-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    notify("已导出任务、日程与模型设置（不包含 API Key）");
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
        throw new Error("文件不是有效的 松果 Pinecone 备份");
      if (
        data.events !== undefined &&
        (!Array.isArray(data.events) ||
          !data.events.every(
            (event: CalendarEvent) =>
              typeof event.id === "string" &&
              typeof event.title === "string" &&
              validSchedule(event),
          ))
      )
        throw new Error("备份中的日程时间无效");
      setWorkspace((w) => mergeWorkspace(w, data));
      notify("备份已合并，相同任务和日程不会重复添加");
    } catch (e) {
      notify(`导入失败：${String(e)}`);
    }
  }
  const activePosition = active ? position(active) : { x: 0, y: 0 };
  const boardTop =
    boardRef.current?.getBoundingClientRect().top ?? boardSize.top;
  const popoverStyle = {
    left: clamp(
      activePosition.x + (active ? nodeDiameter(active.size) : 0) / 2 + 24,
      8,
      Math.max(8, boardSize.width - 340),
    ),
    top: clamp(
      activePosition.y - 85,
      Math.min(8, 80 - boardTop),
      Math.max(
        Math.min(8, 80 - boardTop),
        boardSize.viewportHeight - boardTop - popoverHeight - 16,
      ),
    ),
    maxHeight: boardSize.viewportHeight - 96,
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
            <img className="brand-mark" src="/pinecone.svg" alt="" />
            <strong aria-label="松果 Pinecone">松果</strong>
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
            <Plus size={18} /> 快速记录
          </button>
          <div className="nav-caption">工作空间</div>
          <button
            className={`nav-item ${view === "board" && project === "" ? "chosen" : ""}`}
            onClick={() => {
              setView("board");
              setProject("");
              setSelected(null);
            }}
          >
            <LayoutGrid size={18} /> 四象限 <span>{pending}</span>
          </button>
          <button
            className={`nav-item ${view === "outline" && project === "" ? "chosen" : ""}`}
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
          <button
            className={`nav-item ${view === "calendar" && project === "" ? "chosen" : ""}`}
            onClick={() => {
              setView("calendar");
              setProject("");
              setQuery("");
              setSelected(null);
            }}
          >
            <CalendarDays size={18} /> 日历
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
          <div className="project-row">
            <button
              className={`nav-item project-item ${project === null && view !== "done" ? "chosen" : ""}`}
              onClick={() => {
                setProject(null);
                if (view === "done") setView("board");
                setSelected(null);
                setQuery("");
              }}
            >
              <i style={{ background: "#a6abb3" }} />
              未分类
              <span>{projectCount("")}</span>
            </button>
          </div>
          {activeProjects.map((name, i) => (
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
                <span>{projectCount(name)}</span>
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
            <button className="nav-item" onClick={() => setWorkSettings(true)}>
              <FolderOpen size={18} />
              工作台设置
              <ChevronRight size={15} />
            </button>
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
                : projectLabel ||
                  (view === "calendar"
                    ? "日历"
                    : view === "outline"
                      ? "笔记"
                      : "四象限")}
            </strong>
          </div>
          <div className="top-actions">
            {device.sync.enabled && (
              <button
                className="sync-status"
                disabled={syncBusy}
                onClick={() => void startSync()}
              >
                {syncStatus}
              </button>
            )}
            <button
              className="icon-button"
              title="撤销操作"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="icon-button"
              title="重做操作"
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo2 size={17} />
            </button>
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
              : projectLabel ||
                (view === "calendar"
                  ? "日历"
                  : view === "outline"
                    ? "笔记"
                    : "四象限")}
          </h1>
          <div className="heading-actions">
            {view !== "done" && view !== "calendar" && (
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
                placeholder={view === "calendar" ? "搜索日程" : "搜索任务"}
                aria-label={view === "calendar" ? "搜索日程" : "搜索任务"}
              />
            </label>
          </div>
        </section>
        {view === "calendar" ? (
          <Calendar
            events={workspace.events.filter(
              (event) =>
                (project === "" ||
                  eventDetails(workspace, event).project === taskProject) &&
                (Boolean(project) ||
                  !workspace.archivedProjects.includes(
                    eventDetails(workspace, event).project,
                  )) &&
                matchesSearch(eventSearchText(workspace, event), query),
            )}
            day={calendarDay}
            mode={calendarMode}
            onDay={setCalendarDay}
            onMode={setCalendarMode}
            onCreate={newEvent}
            onOpen={setEventDraft}
            onReschedule={(event) =>
              event.recurrence ? setEventDraft(event) : saveEvent(event)
            }
          />
        ) : view === "board" ? (
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
                          project: taskProject,
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
                    onPointerDown={(e) => startGesture(e, task)}
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
                  </div>
                );
              })}
              {active && !active.done && (
                <div
                  ref={popoverRef}
                  className={`task-popover ${adjustingPriority ? "priority-preview" : ""}`}
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
                      <select
                        aria-label="所属项目"
                        value={active.project}
                        onChange={(e) =>
                          updateTask(active.id, { project: e.target.value })
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
                      onPointerDown={() => setAdjustingPriority(true)}
                      onPointerUp={() => setAdjustingPriority(false)}
                      onPointerCancel={() => setAdjustingPriority(false)}
                      onBlur={() => setAdjustingPriority(false)}
                      onKeyDown={(e) => {
                        if (
                          [
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                            "Home",
                            "End",
                            "PageUp",
                            "PageDown",
                          ].includes(e.key)
                        )
                          setAdjustingPriority(true);
                      }}
                      onKeyUp={() => setAdjustingPriority(false)}
                      type="range"
                      min="72"
                      max="180"
                      value={active.size}
                      onChange={(e) =>
                        updateTask(active.id, { size: Number(e.target.value) })
                      }
                    />
                  </label>
                  <button
                    className="task-schedule-button"
                    onClick={() => newEvent(defaultSchedule(), active)}
                  >
                    <CalendarDays size={15} />
                    安排时间
                  </button>
                  <div className="task-schedule-list">
                    {workspace.events
                      .filter((e) => e.taskId === active.id)
                      .sort((a, b) => a.start.localeCompare(b.start))
                      .map((e) => (
                        <button key={e.id} onClick={() => setEventDraft(e)}>
                          {scheduleLabel(e)} · {e.title}
                        </button>
                      ))}
                  </div>
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
                  <FolderLinks
                    paths={folderPaths(active)}
                    inherited={workspace.projectFolders[active.project] ?? []}
                    onChange={(folders) =>
                      updateTask(active.id, { folder: "", folders })
                    }
                    onError={notify}
                  />
                  <div className="popover-footer">
                    <button
                      className="open-task-notes"
                      onClick={() => setNotesTaskId(active.id)}
                    >
                      <NotebookPen size={16} /> 打开笔记
                    </button>
                    <button
                      className="delete-task icon-button"
                      title="删除任务"
                      onClick={() => {
                        setWorkspace((w) => trashItem(w, "task", active.id));
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
            project={projectLabel}
            projects={projects}
            onUpdate={updateTask}
            onOpenNotes={setNotesTaskId}
            onSchedule={(task) => newEvent(defaultSchedule(), task)}
            onCreate={(quadrant) => {
              const task = makeTask({
                title: "",
                quadrant,
                project: taskProject,
              });
              setWorkspace((w) => ({ ...w, tasks: [...w.tasks, task] }));
              setQuery("");
              return task.id;
            }}
            onDelete={(id) => setWorkspace((w) => trashItem(w, "task", id))}
            projectFolders={workspace.projectFolders}
            onError={notify}
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
                  <button
                    className="icon-button"
                    title="打开笔记"
                    onClick={() => setNotesTaskId(task.id)}
                  >
                    <NotebookPen size={17} />
                  </button>
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
                    onClick={() =>
                      setWorkspace((w) => trashItem(w, "task", task.id))
                    }
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
          {captureResult && (
            <div className="capture-result">
              <span>{captureResult.label}</span>
              <button
                onClick={() => {
                  const task = workspace.tasks.find(
                      (t) => t.id === captureResult.tasks[0],
                    ),
                    event = workspace.events.find(
                      (e) => e.id === captureResult.events[0],
                    );
                  if (event) setEventDraft(event);
                  else if (task) {
                    setView("board");
                    setSelected(task.id);
                  }
                }}
              >
                修改
              </button>
              <button
                onClick={() => {
                  setWorkspace((w) => {
                    let next = w;
                    for (const id of captureResult.tasks)
                      next = trashItem(next, "task", id);
                    for (const id of captureResult.events)
                      next = trashItem(next, "event", id);
                    return next;
                  });
                  setCaptureResult(null);
                }}
              >
                撤销
              </button>
              <button
                className="icon-button"
                aria-label="关闭记录结果"
                onClick={() => setCaptureResult(null)}
              >
                <X size={13} />
              </button>
            </div>
          )}
          <div className={`composer ${busy ? "is-busy" : ""}`}>
            <textarea
              ref={inputRef}
              aria-label="输入任务或日程"
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
              placeholder="记下任务，或说：明天上午十点到十二点上课…"
              rows={1}
            />
            <div className="composer-bottom">
              <button className="model-chip" onClick={() => setSettings(true)}>
                <Sparkles size={14} />
                {workspace.config.model || "本地快速记录"}
                <ChevronRight size={12} />
              </button>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <select
                  className="intake-mode"
                  aria-label="记录类型"
                  value={intakeMode}
                  onChange={(e) => setIntakeMode(e.target.value as IntakeMode)}
                >
                  <option value="auto">自动识别</option>
                  <option value="task">任务</option>
                  <option value="event">日程</option>
                </select>
                <button
                  className="send-button"
                  aria-label="添加记录"
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
      {notesTask && (
        <Suspense fallback={null}>
          <TaskNotes
            key={notesTask.id}
            task={notesTask}
            onUpdate={(id, change) => {
              if (workspace.tasks.some((t) => t.id === id))
                updateTask(id, change);
              else
                setWorkspace((w) => ({
                  ...w,
                  events: w.events.map((e) =>
                    e.id === id ? { ...e, ...change } : e,
                  ),
                }));
            }}
            onClose={() => setNotesTaskId(null)}
            onError={notify}
          />
        </Suspense>
      )}
      {eventDraft && (
        <EventEditor
          key={eventDraft.id}
          event={eventDraft}
          tasks={workspace.tasks}
          projects={projects}
          existing={workspace.events.some(
            (e) => e.id === (eventDraft.seriesId || eventDraft.id),
          )}
          onClose={() => setEventDraft(null)}
          onSave={saveEvent}
          onDelete={(scope) => deleteEvent(eventDraft, scope)}
          onNotes={(event) => {
            if (
              event.recurrence &&
              !event.taskId &&
              !event.seriesId &&
              !workspace.events.some((e) => e.id === event.id)
            )
              saveEvent(event, "future");
            setNotesTaskId(event.taskId || event.seriesId || event.id);
            setEventDraft(null);
          }}
          projectFolders={workspace.projectFolders}
          onError={notify}
        />
      )}
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
          onEvent={(event) => {
            setGlobalSearch(false);
            setProject("");
            setQuery("");
            setView("calendar");
            setCalendarDay(event.start.slice(0, 10));
            setCalendarMode("day");
            setEventDraft(event);
          }}
          onTask={(task) => {
            setGlobalSearch(false);
            setProject(
              workspace.archivedProjects.includes(task.project)
                ? task.project
                : "",
            );
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
          folders={workspace.projectFolders[projectEditor] ?? []}
          onFolders={(folders) =>
            setWorkspace((w) => ({
              ...w,
              projectFolders: { ...w.projectFolders, [projectEditor]: folders },
            }))
          }
          onError={notify}
          onArchive={() => {
            setWorkspace((w) => ({
              ...w,
              archivedProjects: [
                ...new Set([...w.archivedProjects, projectEditor]),
              ],
            }));
            setProjectEditor(null);
            setProject("");
          }}
          onSave={async (name) => {
            let next = projectEditor
              ? renameProject(workspaceRef.current, projectEditor, name)
              : {
                  ...workspaceRef.current,
                  projects: [...projectNames(workspaceRef.current), name],
                };
            next = await ensureProjectFolders(next);
            setWorkspace(next);
            if (project === projectEditor && projectEditor) setProject(name);
            setProjectEditor(null);
          }}
          onDelete={(contents) => {
            setWorkspace((w) =>
              trashItem(w, "project", projectEditor, contents),
            );
            if (project === projectEditor) setProject("");
            setProjectEditor(null);
            notify("项目已移入回收站，本地文件保持原位");
          }}
        />
      )}
      {workSettings && (
        <WorkspaceSettings
          workspace={workspace}
          device={device}
          onDevice={updateDevice}
          onWorkspace={setWorkspace}
          onClose={() => setWorkSettings(false)}
          onError={notify}
          onSync={() => void startSync()}
          syncStatus={syncStatus}
          onRoot={setRoot}
        />
      )}
      {syncPlan && (
        <SyncReview
          key={JSON.stringify(syncPlan.local)}
          plan={syncPlan}
          busy={syncBusy}
          onClose={() => setSyncPlan(null)}
          onConfirm={(choices) => void finishSync(syncPlan, choices)}
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
