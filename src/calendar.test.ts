import { describe, expect, it, afterEach, vi } from "vitest";
import {
  layoutDayEvents,
  shiftPeriod,
  scheduledOn,
  weekDays,
} from "./calendar";
import { parseSchedule } from "./scheduleParser";
import { localIntake, matchingTask, parseIntake } from "./intake";
import { initialWorkspace, makeTask, makeEvent, type Workspace } from "./model";
import {
  normalizeWorkspace,
  mergeWorkspace,
  removeTask,
  searchWorkspace,
  eventDetails,
  renameProject,
  deleteProject,
} from "./workspace";
const now = new Date(2026, 10, 3, 8);
describe("自然语言日程", () => {
  it("明天上午十点到十二点上课仅生成独立日程", () => {
    expect(localIntake("明天上午十点到十二点上课", [], "auto", now)).toEqual([
      {
        kind: "event",
        value: {
          title: "上课",
          start: "2026-11-04T10:00",
          end: "2026-11-04T12:00",
          taskId: undefined,
        },
      },
    ]);
    expect(localIntake("我要完成课程方案", [], "auto", now)[0].kind).toBe(
      "task",
    );
    expect(localIntake("明天十点前完成方案", [], "auto", now)[0].kind).toBe(
      "task",
    );
    expect(
      localIntake("明天下午三点半前提交方案", [], "auto", now)[0].kind,
    ).toBe("task");
  });
  it("中文分钟、季度时间、跨年与跨午夜", () => {
    expect(parseSchedule("明天下午三点半讨论", now)?.schedule.start).toBe(
      "2026-11-04T15:30",
    );
    expect(parseSchedule("明天十点一刻开会", now)?.schedule.start).toBe(
      "2026-11-04T10:15",
    );
    expect(parseSchedule("明天十点三刻开会", now)?.schedule.start).toBe(
      "2026-11-04T10:45",
    );
    expect(
      parseSchedule("明天10:00–12:00上课", new Date(2026, 11, 31))?.schedule
        .start,
    ).toBe("2027-01-01T10:00");
    expect(parseSchedule("今晚十一点到凌晨一点值班", now)?.schedule).toEqual({
      start: "2026-11-03T23:00",
      end: "2026-11-04T01:00",
    });
  });
  it("无结束默认一小时，拒绝错误日期和反向范围，不虚构时间或重复规则", () => {
    expect(parseSchedule("明天上午十点上课", now)?.schedule.end).toBe(
      "2026-11-04T11:00",
    );
    expect(() => parseSchedule("2026-02-30十点上课", now)).toThrow("日期");
    expect(() => parseSchedule("明天14:00到12:00上课", now)).toThrow("结束");
    expect(() => localIntake("明天上课", [], "event", now)).toThrow("开始时间");
    expect(() => localIntake("每周一十点上课", [], "auto", now)).toThrow(
      "重复",
    );
  });
  it("拆分日程保留当天上下文，仅唯一匹配才关联已有任务", () => {
    const task = makeTask({ title: "完成课程方案" });
    const items = localIntake(
      "明天上午十点上课；下午两点继续写课程方案",
      [task],
      "auto",
      now,
    );
    expect(items[1]).toMatchObject({
      kind: "event",
      value: { start: "2026-11-04T14:00", taskId: task.id },
    });
    expect(
      matchingTask("继续写课程方案", [task, makeTask({ title: task.title })]),
    ).toBeUndefined();
    expect(matchingTask("写课", [task])).toBeUndefined();
  });
});
describe("日历与日程数据", () => {
  const event = (start: string, end: string) =>
    makeEvent({
      title: "日程",
      start: `2026-11-04T${start}`,
      end: `2026-11-04T${end}`,
    });
  it("重叠日程并列显示，连续时段不重叠；跨天截断", () => {
    const layout = layoutDayEvents(
      [
        event("10:00", "12:00"),
        event("11:00", "13:00"),
        event("13:00", "14:00"),
      ],
      "2026-11-04",
    );
    expect(layout.map((e) => [e.column, e.columns])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
    const overnight = makeEvent({
      title: "值班",
      start: "2026-11-03T23:00",
      end: "2026-11-04T01:00",
    });
    expect(layoutDayEvents([overnight], "2026-11-04")[0]).toMatchObject({
      start: 0,
      end: 60,
    });
    expect(
      scheduledOn({ ...overnight, end: "2026-11-04T00:00" }, "2026-11-04"),
    ).toBe(false);
    expect(weekDays("2026-11-01")[0]).toBe("2026-10-26");
    expect(shiftPeriod("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftPeriod("2024-02-29", "year", 1)).toBe("2025-02-28");
  });
  it("旧备份不产生日程，同一任务能有多个日程，删除任务保留日程资料", () => {
    const w = initialWorkspace();
    const task = makeTask({
      title: "课程方案",
      project: "教学",
      folder: "/课程",
      notes: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "机器人教学" }],
          },
        ],
      },
    });
    w.tasks = [task];
    w.events = [
      { ...event("10:00", "11:00"), taskId: task.id },
      { ...event("14:00", "15:00"), taskId: task.id },
    ];
    const { events: _, ...old } = w;
    expect(normalizeWorkspace(old as Workspace).events).toEqual([]);
    const merged = mergeWorkspace(w, JSON.parse(JSON.stringify(w)));
    expect(merged.events).toHaveLength(2);
    expect(merged.tasks).toHaveLength(1);
    expect(merged.tasks[0].done).toBe(false);
    expect(eventDetails(w, w.events[0]).folder).toBe("/课程");
    expect(searchWorkspace(w, "机器人").events).toHaveLength(2);
    const removed = removeTask(w, task.id);
    expect(removed.events).toHaveLength(2);
    expect(removed.events[0]).toMatchObject({
      taskId: undefined,
      folder: "/课程",
      notes: task.notes,
    });
    expect(renameProject(removed, "教学", "课程").events[0].project).toBe(
      "课程",
    );
    expect(deleteProject(removed, "教学").events[0].project).toBe("");
  });
});
describe("模型统一入口", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("模型混合结果保持任务与日程分开，并关联本地任务", async () => {
    const task = makeTask({ title: "完成课程方案" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      items: [
                        { kind: "task", title: "整理资料" },
                        {
                          kind: "event",
                          title: "继续写课程方案",
                          start: "2026-11-04T14:00",
                          end: "2026-11-04T16:00",
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
          ),
      ),
    );
    const items = await parseIntake(
      "整理资料，明天下午继续写方案",
      [task],
      { url: "http://localhost/v1", key: "", model: "test" },
      "auto",
    );
    expect(items[0].kind).toBe("task");
    expect(items[1]).toMatchObject({
      kind: "event",
      value: { taskId: task.id },
    });
  });
});
