import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Calendar from "./CalendarView";
import { makeTask, makeEvent } from "./model";
describe("日历截止日期视图", () => {
  const task = makeTask({ title: "论文撰写", due: "2026-11-04" });
  const event = makeEvent({
    title: "上课",
    start: "2026-11-04T10:00",
    end: "2026-11-04T12:00",
  });
  const noop = () => {};
  it("日周月视图显示不同类型，年视图统计截止任务", () => {
    for (const mode of ["day", "week", "month", "year"] as const) {
      const html = renderToStaticMarkup(
        <Calendar
          mode={mode}
          day="2026-11-04"
          events={[event]}
          deadlines={[task]}
          onReschedule={noop}
          onTask={noop}
          onDay={noop}
          onMode={noop}
          onCreate={noop}
          onOpen={noop}
        />,
      );
      if (mode === "year")
        expect(html).toContain("2026-11-04，1 项日程，1 项截止任务");
      else {
        expect(html).toContain("截止 · 论文撰写");
        expect(html).toContain("上课");
        if (mode !== "month")
          expect(html.indexOf("截止 · 论文撰写")).toBeLessThan(
            html.indexOf("calendar-time-scroll"),
          );
      }
    }
    expect(task).not.toHaveProperty("start");
  });
});
