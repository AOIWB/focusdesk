import { notesMarkdown, type TaskNotes } from "./notes";
export type Quadrant = 0 | 1 | 2 | 3;
export interface Task {
  id: string;
  title: string;
  description: string;
  notes?: TaskNotes;
  quadrant: Quadrant;
  x: number;
  y: number;
  size: number;
  due: string;
  project: string;
  folder: string;
  folders?: string[];
  taskFolder?: string;
  done: boolean;
  createdAt: string;
}
export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  until?: string;
}
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  notes?: TaskNotes;
  project: string;
  folder: string;
  folders?: string[];
  taskId?: string;
  recurrence?: Recurrence;
  excludedDates?: string[];
  seriesId?: string;
  occurrenceDate?: string;
  reminder?: number;
  createdAt: string;
}
export type NoteDocument = Pick<Task, "id" | "title" | "notes" | "project">;
export function makeEvent(
  values: Pick<CalendarEvent, "title" | "start" | "end"> &
    Partial<CalendarEvent>,
): CalendarEvent {
  return {
    id: crypto.randomUUID(),
    description: "",
    project: "",
    folder: "",
    createdAt: new Date().toISOString(),
    ...values,
  };
}
export interface Idea {
  id: string;
  title: string;
  notes?: TaskNotes;
  createdAt: string;
  x?: number;
  y?: number;
}
export function makeIdea(title: string): Idea {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
  };
}
export interface ModelConfig {
  url: string;
  key: string;
  model: string;
}
export interface TaskLink {
  id: string;
  source: string;
  target: string;
}
export interface TrashEntry {
  id: string;
  kind: "task" | "event" | "project" | "idea";
  ideas?: Idea[];
  memberships?: { tasks: string[]; events: string[] };
  title: string;
  deletedAt: string;
  tasks: Task[];
  events: CalendarEvent[];
  links: TaskLink[];
  project?: string;
  folders?: string[];
}
export interface Workspace {
  ideas: Idea[];
  projects: string[];
  projectFolders: Record<string, string[]>;
  archivedProjects: string[];
  trash: TrashEntry[];
  deleted: Record<string, string>;
  links: TaskLink[];
  manualQuadrants: Quadrant[];
  tasks: Task[];
  events: CalendarEvent[];
  config: ModelConfig;
  welcomed: boolean;
}
export const quadrants = [
  {
    title: "立即行动",
    subtitle: "重要且紧急",
    color: "coral",
    hint: "把注意力留给眼前最重要的事",
  },
  {
    title: "计划安排",
    subtitle: "重要 · 不紧急",
    color: "sage",
    hint: "为长期有价值的事留出时间",
  },
  {
    title: "高效处理",
    subtitle: "紧急 · 不重要",
    color: "amber",
    hint: "集中处理，或者交给合适的人",
  },
  {
    title: "稍后再说",
    subtitle: "不重要 · 不紧急",
    color: "blue",
    hint: "先记下来，不必现在就行动",
  },
] as const;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const nodeDiameter = (size: number) =>
  10 + (clamp(size, 72, 180) - 72) / 6;
export function makeTask(values: Partial<Task> & Pick<Task, "title">): Task {
  return {
    id: crypto.randomUUID(),
    description: "",
    quadrant: 1,
    x: 0.5,
    y: 0.5,
    size: 106,
    due: "",
    project: "",
    folder: "",
    done: false,
    createdAt: new Date().toISOString(),
    ...values,
  };
}
export const initialWorkspace = (): Workspace => ({
  config: { url: "https://api.openai.com/v1", key: "", model: "" },
  welcomed: false,
  projectFolders: {},
  archivedProjects: [],
  trash: [],
  deleted: {},
  projects: ["工作", "个人成长", "生活"],
  links: [],
  manualQuadrants: [],
  events: [],
  ideas: [],
  tasks: [
    makeTask({
      title: "完成本周提案",
      description:
        "这是一个示例任务。点击圆点编辑详情；拖动圆点移动，在详情中使用优先级滑杆调整大小。",
      quadrant: 0,
      x: 0.43,
      y: 0.48,
      size: 126,
      project: "工作",
    }),
    makeTask({
      title: "学习一项新技能",
      description:
        "重要但不紧急的事情，值得提前安排。你可以编辑或删除这些示例。",
      quadrant: 1,
      x: 0.53,
      y: 0.47,
      size: 146,
      project: "个人成长",
    }),
    makeTask({
      title: "回复待办消息",
      quadrant: 2,
      x: 0.57,
      y: 0.52,
      size: 94,
      project: "工作",
    }),
    makeTask({
      title: "整理灵感收藏",
      quadrant: 3,
      x: 0.42,
      y: 0.52,
      size: 104,
      project: "生活",
    }),
  ],
});
export function taskTitle(input: string): string {
  let title = input
    .trim()
    .replace(/^(?:请帮我|帮我|我想要|我想|我要|请|需要)\s*/, "");
  const datePrefix =
    /^(?:(?:今天|明天|明日|后天|今晚|本周|下周)(?:上午|下午|晚上)?(?:[零一二两三四五六七八九十\d]+(?:点|时)(?:半|\d+分)?)?(?:之前|前)?|20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}日?(?:之前|前)?)\s*/;
  title = title
    .replace(datePrefix, "")
    .replace(/^完成(?!情况|度|率|状态|时间|标准|条件|报告|品)\s*/, "")
    .replace(datePrefix, "");
  title = title
    .replace(/[，,](?:很重要|不重要|不紧急|不着急|优先级低).*$/, "")
    .trim();
  return title || input.trim();
}
export function localParse(
  input: string,
  now = new Date(),
): Partial<Task> & Pick<Task, "title"> {
  const urgent =
    /紧急|尽快|马上|今天|明天|今晚/.test(input) &&
    !/不紧急|不着急|不急/.test(input);
  const important = !/不重要|优先级低/.test(input);
  let due = "";
  const date = input.match(/\b(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  if (date)
    due = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
  else if (/今天|今晚|明天|后天/.test(input)) {
    const d = new Date(now);
    d.setDate(
      d.getDate() + (/后天/.test(input) ? 2 : /明天/.test(input) ? 1 : 0),
    );
    due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return {
    title: taskTitle(input),
    description: input,
    quadrant: important ? (urgent ? 0 : 1) : urgent ? 2 : 3,
    due,
  };
}
export function pointToQuadrant(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const col = x >= width / 2 ? 1 : 0,
    row = y >= height / 2 ? 1 : 0;
  return {
    quadrant: (row * 2 + 1 - col) as Quadrant,
    x: clamp((x - (col * width) / 2) / (width / 2), 0.08, 0.92),
    y: clamp((y - (row * height) / 2) / (height / 2), 0.12, 0.88),
  };
}
export function completionUrl(url: string) {
  const base = url.trim().replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

export const outlineGroups: { quadrant: Quadrant; title: string }[] = [
  { quadrant: 0, title: "紧急重要" },
  { quadrant: 2, title: "紧急不重要" },
  { quadrant: 1, title: "重要不紧急" },
  { quadrant: 3, title: "不紧急不重要" },
];
export function tasksToMarkdown(tasks: Task[], title = "任务笔记") {
  const text = [title, ""];
  for (const group of outlineGroups) {
    text.push(`# ${group.title}`, "");
    for (const task of tasks.filter((t) => t.quadrant === group.quadrant)) {
      text.push(
        `- [${task.done ? "x" : " "}] ${task.title.replace(/\n/g, " ")}`,
      );
      if (task.description)
        text.push(...task.description.split("\n").map((line) => `  ${line}`));
      if (task.notes)
        text.push(
          ...notesMarkdown(task.notes)
            .split("\n")
            .map((line) => `  ${line}`),
        );
      if (task.due) text.push(`  - 日期：${task.due}`);
      if (task.project) text.push(`  - 项目：${task.project}`);
      for (const folder of new Set(
        [...(task.folders ?? []), task.folder].filter(Boolean),
      ))
        text.push(`  - 文件夹：${folder}`);
    }
    text.push("");
  }
  return text.join("\n");
}
