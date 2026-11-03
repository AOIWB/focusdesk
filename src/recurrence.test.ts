import { describe, it, expect } from "vitest";
import { makeEvent } from "./model";
import { expandEvents, updateOccurrence, shiftedEvent } from "./recurrence";
import { localIntake } from "./intake";
const series = () =>
  makeEvent({
    id: "course",
    title: "课",
    start: "2026-11-04T10:00",
    end: "2026-11-04T12:00",
    recurrence: { frequency: "weekly" },
  });
describe("重复日程", () => {
  it("自然语言每周三上课创建一个系列，按周生成实际日期", () => {
    const items = localIntake(
      "每周三上午十点到十二点上课",
      [],
      "auto",
      new Date(2026, 10, 3),
    );
    expect(items[0]).toMatchObject({
      kind: "event",
      value: {
        title: "上课",
        start: "2026-11-04T10:00",
        recurrence: { frequency: "weekly" },
      },
    });
    expect(
      expandEvents([series()], "2026-11-01", "2026-11-30").map((e) =>
        e.start.slice(0, 10),
      ),
    ).toEqual(["2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25"]);
  });
  it("仅本次修改生成例外，不改变其他周；本次及以后切分系列", () => {
    const root = series(),
      second = expandEvents([root], "2026-11-11", "2026-11-11")[0];
    const changed = {
      ...second,
      start: "2026-11-11T14:00",
      end: "2026-11-11T16:00",
    };
    const only = updateOccurrence([root], changed, "this");
    expect(expandEvents(only, "2026-11-11", "2026-11-11")).toHaveLength(1);
    expect(expandEvents(only, "2026-11-18", "2026-11-18")[0].start).toBe(
      "2026-11-18T10:00",
    );
    const future = updateOccurrence([root], changed, "future");
    expect(
      expandEvents(future, "2026-11-04", "2026-11-18").map((e) => e.start),
    ).toEqual(["2026-11-04T10:00", "2026-11-11T14:00", "2026-11-18T14:00"]);
  });
  it("删除本次和后续分别生效；月末与闰日跳过不存在的日期", () => {
    const root = series(),
      second = expandEvents([root], "2026-11-11", "2026-11-11")[0];
    expect(
      expandEvents(
        updateOccurrence([root], second, "this", true),
        "2026-11-01",
        "2026-11-30",
      ),
    ).toHaveLength(3);
    expect(
      expandEvents(
        updateOccurrence([root], second, "future", true),
        "2026-11-01",
        "2026-11-30",
      ),
    ).toHaveLength(1);
    const monthly = makeEvent({
      title: "月末",
      start: "2026-01-31T10:00",
      end: "2026-01-31T11:00",
      recurrence: { frequency: "monthly" },
    });
    expect(
      expandEvents([monthly], "2026-01-01", "2026-04-30").map((e) =>
        e.start.slice(0, 10),
      ),
    ).toEqual(["2026-01-31", "2026-03-31"]);
  });
  it("拖动跨日保持时长，边缘调整不允许反向时段", () => {
    const root = series();
    expect(shiftedEvent(root, 30, 1, "move")).toMatchObject({
      start: "2026-11-05T10:30",
      end: "2026-11-05T12:30",
    });
    expect(shiftedEvent(root, -30, 0, "end").end).toBe("2026-11-04T11:30");
    expect(shiftedEvent(root, 180, 0, "start")).toBe(root);
  });
});
