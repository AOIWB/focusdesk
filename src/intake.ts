import {
  localParse,
  type Task,
  type CalendarEvent,
  type ModelConfig,
} from "./model";
import { completion } from "./ai";
import { parseDate, parseSchedule } from "./scheduleParser";
import { dateKey, validSchedule } from "./calendar";
export type IntakeMode = "auto" | "task" | "event";
export type IntakeItem =
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
      if (
        /每(?:天|周|星期|月|年)|工作日/.test(source) &&
        (mode === "event" || /[点时]|[：:]\d/.test(source))
      )
        throw new Error("暂不支持重复日程，请指定一次日程的日期和时间");
      const parsed = parseSchedule(
        !explicitDay && contextDay ? `${contextDay} ${source}` : source,
        now,
      );
      if (parsed)
        return {
          kind: "event",
          value: {
            title: parsed.title,
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
  if (/每(?:天|周|星期|月|年)|工作日/.test(input) && mode !== "task")
    throw new Error("暂不支持重复日程，请指定一次日程的日期和时间");
  const text = await completion(config, [
    {
      role: "system",
      content: `你是松果的任务与日程整理助手。现在本地时间 ${new Date().toLocaleString("sv-SE")}。用户选择模式 ${mode}（auto自动判断，task只创建任务，event只创建日程）。只返回JSON：{"items":[{"kind":"task","title":"完成方案","description":"","quadrant":1,"due":"${dateKey(new Date())}","project":""},{"kind":"event","title":"上课","start":"YYYY-MM-DDTHH:mm","end":"YYYY-MM-DDTHH:mm","description":"","project":""}]}。这是格式示例，不是要创建的内容。任务是要完成的成果，截止日期或几点前完成属于任务；日程是特定时间要进行的活动，明确开始时间应创建日程。只有日期没有时刻默认创建任务。日程结束未明确则默认一小时，不虚构开始时间；event模式缺少开始时间时返回 {"error":"请补充开始时间"}。支持拆分多项，中文相对日期转本地时间。quadrant 0重要紧急1重要不紧急2紧急不重要3均不；默认1。项目未说明留空，不创建文件路径，不执行任务。`,
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
        value: { ...common, ...schedule, taskId: matchingTask(title, tasks) },
      };
    }
    if (mode === "event") throw new Error("请补充日程开始时间");
    return {
      kind: "task",
      value: {
        ...common,
        quadrant: ([0, 1, 2, 3].includes(Number(item.quadrant))
          ? Number(item.quadrant)
          : 1) as Task["quadrant"],
        due: String(item.due || ""),
      },
    };
  });
}
