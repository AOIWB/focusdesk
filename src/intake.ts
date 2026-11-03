import {
  localParse,
  taskTitle,
  type Task,
  type CalendarEvent,
  type ModelConfig,
  type Recurrence,
} from "./model";
import { completion } from "./ai";
import { parseDate, parseSchedule } from "./scheduleParser";
import { dateKey, validSchedule } from "./calendar";
export type IntakeMode = "auto" | "task" | "event";
export type IntakeItem =
  | { kind: "complete"; value: Task }
  | { kind: "task"; value: Partial<Task> & Pick<Task, "title"> }
  | {
      kind: "event";
      value: Partial<CalendarEvent> &
        Pick<CalendarEvent, "title" | "start" | "end">;
    };
export function matchingTask(title: string, tasks: Task[]) {
  const clean = (s: string) =>
    s
      .replace(
        /^(?:我要|我想|继续|完成|撰写|编写|写|准备|制定|做|一下|\s)+/g,
        "",
      )
      .replace(/[\s，。！？]/g, "");
  const key = clean(title);
  if (key.length < 3) return undefined;
  const matches = tasks.filter(
    (t) =>
      !t.done &&
      clean(t.title).length >= 3 &&
      (key === clean(t.title) || key.includes(clean(t.title))),
  );
  return matches.length === 1 ? matches[0].id : undefined;
}
function completionRequest(
  source: string,
  tasks: Task[],
): IntakeItem | undefined {
  const match = source
    .trim()
    .match(/^(?:请)?(?:把|将)?(.+?)(?:标记为|设为|标为)(?:已)?完成[。！!]?$/);
  if (!match) return;
  const title = taskTitle(match[1]);
  const matches = tasks.filter((t) => !t.done && taskTitle(t.title) === title);
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "有多个同名任务，请在任务详情标记完成"
        : "没有找到对应的待办任务",
    );
  return { kind: "complete", value: matches[0] };
}
export function localIntake(
  input: string,
  tasks: Task[],
  mode: IntakeMode = "auto",
  now = new Date(),
): IntakeItem[] {
  let contextDay: string | undefined;
  return input
    .split(/[；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((source): IntakeItem => {
      const complete =
        mode !== "event" ? completionRequest(source, tasks) : undefined;
      if (complete) return complete;
      const explicitDay = parseDate(source, now);
      if (explicitDay) contextDay = explicitDay;
      const deadline =
        /(?:点|时|:\d{2}|：\d{2})(?:半|\d+分?)?(?:之)?前|截止|最晚/.test(
          source,
        );
      if (mode === "task" || (mode === "auto" && deadline))
        return {
          kind: "task",
          value: {
            ...localParse(source, now),
            due: explicitDay ?? localParse(source, now).due,
          },
        };
      const recurrence: Recurrence | undefined = /每天/.test(source)
        ? { frequency: "daily" }
        : /每(?:周|星期)/.test(source)
          ? { frequency: "weekly" }
          : /每月/.test(source)
            ? { frequency: "monthly" }
            : /每年/.test(source)
              ? { frequency: "yearly" }
              : undefined;
      if (/工作日/.test(source))
        throw new Error("请分别设置每周的具体日期，例如每周一上午十点");
      const recurringSource = source
        .replace(/每(周|星期)/, "$1")
        .replace(/每天|每月|每年/, "");
      const parsed = parseSchedule(
        !explicitDay && contextDay
          ? `${contextDay} ${recurringSource}`
          : recurringSource,
        now,
      );
      if (parsed)
        return {
          kind: "event",
          value: {
            title: parsed.title,
            recurrence,
            ...parsed.schedule,
            taskId: matchingTask(parsed.title, tasks),
          },
        };
      if (mode === "event")
        throw new Error("请补充日程开始时间，例如：明天上午十点上课");
      return { kind: "task", value: localParse(source, now) };
    });
}
export async function parseIntake(
  input: string,
  tasks: Task[],
  config: ModelConfig,
  mode: IntakeMode,
): Promise<IntakeItem[]> {
  if (!config.model.trim()) return localIntake(input, tasks, mode);
  const parts = input
    .split(/[；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    mode !== "event" &&
    parts.some((p) => completionRequest(p, tasks))
  ) {
    const results: IntakeItem[] = [];
    for (const part of parts) {
      const done = completionRequest(part, tasks);
      results.push(
        ...(done ? [done] : await parseIntake(part, tasks, config, mode)),
      );
    }
    return results;
  }
  const text = await completion(config, [
    {
      role: "system",
      content: `你是松果的任务与日程整理助手。现在本地时间 ${new Date().toLocaleString("sv-SE")}。用户选择模式 ${mode}（auto自动判断，task只创建任务，event只创建日程）。只返回JSON：{"items":[{"kind":"task","title":"方案撰写","description":"","quadrant":1,"due":"${dateKey(new Date())}","project":""},{"kind":"event","title":"上课","start":"YYYY-MM-DDTHH:mm","end":"YYYY-MM-DDTHH:mm","description":"","project":""}]}。这是格式示例，不是要创建的内容。任务是要完成的成果，截止日期或几点前完成属于任务；日程是特定时间要进行的活动，明确开始时间应创建日程。只有日期没有时刻默认创建任务。日程结束未明确则默认一小时，不虚构开始时间；event模式缺少开始时间时返回 {"error":"请补充开始时间"}。支持拆分多项，中文相对日期转本地时间。quadrant 0重要紧急1重要不紧急2紧急不重要3均不；默认1。重复日程提供 recurrence:{frequency:"daily"|"weekly"|"monthly"|"yearly",until:"YYYY-MM-DD"}，until可省略；每周指定星期将start设为下一次该星期。任务title只保留工作本身：完成论文撰写→论文撰写，完成明日科技执行材料报名→科技执行材料报名；时间放入due，去掉我要、帮我、完成等指令前缀，但保留完成情况报告这类名称中的实义词。项目未说明留空，不创建文件路径，不执行任务。`,
    },
    { role: "user", content: input },
  ]);
  const result = JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, ""),
  );
  if (result.error) throw new Error(String(result.error));
  if (!Array.isArray(result.items) || !result.items.length)
    throw new Error("没有识别出任务或日程，请补充描述");
  return result.items.map((item: Record<string, unknown>): IntakeItem => {
    const title = String(item.title || "").trim();
    if (!title) throw new Error("模型返回内容缺少标题");
    const common = {
      title,
      description: String(item.description || ""),
      project: String(item.project || ""),
    };
    if (item.kind === "event" && mode !== "task") {
      const schedule = {
        start: String(item.start || ""),
        end: String(item.end || ""),
      };
      if (!validSchedule(schedule))
        throw new Error("日程时间不完整或结束早于开始，请补充时间");
      return {
        kind: "event",
        value: {
          ...common,
          ...schedule,
          taskId: matchingTask(title, tasks),
          recurrence:
            item.recurrence &&
            ["daily", "weekly", "monthly", "yearly"].includes(
              (item.recurrence as Recurrence).frequency,
            )
              ? (item.recurrence as Recurrence)
              : undefined,
        },
      };
    }
    if (mode === "event") throw new Error("请补充日程开始时间");
    return {
      kind: "task",
      value: {
        ...common,
        title: taskTitle(title),
        quadrant: ([0, 1, 2, 3].includes(Number(item.quadrant))
          ? Number(item.quadrant)
          : 1) as Task["quadrant"],
        due: String(item.due || ""),
      },
    };
  });
}
