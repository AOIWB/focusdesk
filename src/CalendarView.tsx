import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Link2 } from "lucide-react";
import type { CalendarEvent } from "./model";
import {
  dateKey,
  dateFromKey,
  weekDays,
  monthDays,
  shiftPeriod,
  scheduledOn,
  layoutDayEvents,
  defaultSchedule,
  scheduleLabel,
  type CalendarMode,
  type Schedule,
} from "./calendar";
import "./Calendar.css";
import { expandEvents, shiftedEvent } from "./recurrence";
const modes = { day: "日", week: "周", month: "月", year: "年" };
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
export default function Calendar({
  events: sourceEvents,
  onReschedule,
  day,
  mode,
  onDay,
  onMode,
  onCreate,
  onOpen,
}: {
  events: CalendarEvent[];
  onReschedule: (event: CalendarEvent) => void;
  day: string;
  mode: CalendarMode;
  onDay: (day: string) => void;
  onMode: (mode: CalendarMode) => void;
  onCreate: (schedule: Schedule) => void;
  onOpen: (event: CalendarEvent) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const today = dateKey(new Date());
  const days = mode === "day" ? [day] : weekDays(day);
  const range =
    mode === "year"
      ? [`${day.slice(0, 4)}-01-01`, `${day.slice(0, 4)}-12-31`]
      : mode === "month"
        ? [monthDays(day)[0], monthDays(day)[41]]
        : [days[0], days[days.length - 1]];
  const expanded = expandEvents(sourceEvents, range[0], range[1]);
  const [preview, setPreview] = useState<CalendarEvent | null>(null);
  const events = expanded;
  const previewRef = useRef<CalendarEvent | null>(null);
  const [dragStyle, setDragStyle] = useState({ x: 0, y: 0, height: 0 });
  const drag = useRef<{
    event: CalendarEvent;
    x: number;
    y: number;
    scrollTop: number;
    dayWidth: number;
    edge: "move" | "start" | "end";
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  function begin(e: PointerEvent<HTMLButtonElement>, event: CalendarEvent) {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const edge =
      e.clientY - rect.top < 6
        ? "start"
        : rect.bottom - e.clientY < 6
          ? "end"
          : "move";
    const width = e.currentTarget.parentElement!.getBoundingClientRect().width;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      event,
      x: e.clientX,
      y: e.clientY,
      scrollTop: scroll.current?.scrollTop ?? 0,
      dayWidth: width,
      edge,
      moved: false,
    };
    suppressClick.current = false;
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    const minutes =
      Math.round(
        (e.clientY - d.y + (scroll.current?.scrollTop ?? 0) - d.scrollTop) / 15,
      ) * 15;
    const dayDelta =
      mode === "week" && d.edge === "move"
        ? Math.round((e.clientX - d.x) / d.dayWidth)
        : 0;
    const value = shiftedEvent(d.event, minutes, dayDelta, d.edge);
    previewRef.current = value;
    setPreview(value);
    if (value === d.event) {
      setDragStyle({ x: 0, y: 0, height: 0 });
      return;
    }
    setDragStyle({
      x: dayDelta * d.dayWidth,
      y: d.edge === "end" ? 0 : minutes,
      height: d.edge === "end" ? minutes : d.edge === "start" ? -minutes : 0,
    });
  }
  function finish(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    if (d.moved && previewRef.current) {
      suppressClick.current = true;
      onReschedule(previewRef.current);
    }
    drag.current = null;
    setPreview(null);
    previewRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  useEffect(() => {
    if (scroll.current) {
      const first = events
        .filter((e) => scheduledOn(e, day))
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      const hour =
        first && first.start.slice(0, 10) === day
          ? Number(first.start.slice(11, 13))
          : 8;
      scroll.current.scrollTop = Math.max(0, hour - 1) * 60;
    }
    // Keep scroll stable while editing events.
  }, [day, mode]);
  const openDay = (date: string) => {
    onDay(date);
    onMode("day");
  };
  return (
    <section className="calendar-view" aria-label="日历">
      <div className="calendar-toolbar">
        <div className="calendar-date-nav">
          <button
            className="icon-button"
            aria-label="上一时段"
            onClick={() => onDay(shiftPeriod(day, mode, -1))}
          >
            <ChevronLeft size={17} />
          </button>
          <h2>
            {mode === "year"
              ? `${day.slice(0, 4)}年`
              : mode === "week"
                ? `${days[0].slice(5).replace("-", "/")} — ${days[6].slice(5).replace("-", "/")} · ${day.slice(0, 4)}`
                : dateFromKey(day).toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    ...(mode === "day"
                      ? { day: "numeric", weekday: "long" }
                      : {}),
                  })}
          </h2>
          <button
            className="icon-button"
            aria-label="下一时段"
            onClick={() => onDay(shiftPeriod(day, mode, 1))}
          >
            <ChevronRight size={17} />
          </button>
          <button className="calendar-today" onClick={() => onDay(today)}>
            今天
          </button>
        </div>
        <div className="calendar-controls">
          <div className="calendar-modes" role="group" aria-label="日历视图">
            {Object.entries(modes).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={mode === key}
                onClick={() => onMode(key as CalendarMode)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="calendar-add"
            onClick={() => onCreate(defaultSchedule(day))}
          >
            <Plus size={16} /> 新建日程
          </button>
        </div>
      </div>
      {mode === "day" || mode === "week" ? (
        <>
          <div
            className="calendar-day-head"
            style={{
              gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            <span />
            {days.map((d) => (
              <button
                key={d}
                className={d === today ? "is-today" : ""}
                onClick={() => openDay(d)}
              >
                周{weekdays[(dateFromKey(d).getDay() + 6) % 7]}{" "}
                <strong>{Number(d.slice(8))}</strong>
              </button>
            ))}
          </div>
          <div className="calendar-time-scroll" ref={scroll}>
            <div
              className="calendar-time-grid"
              style={{
                gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
              }}
            >
              <div className="calendar-hours">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} style={{ top: h * 60 }}>
                    {String(h).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  className="calendar-day-column"
                  aria-label={`${d} 时间线`}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div
                      key={hour}
                      className="calendar-hour-slot"
                      title={`${d} ${hour}:00 新建日程`}
                      onClick={() => onCreate(defaultSchedule(d, hour))}
                    />
                  ))}
                  {layoutDayEvents(events, d).map(
                    ({ event, start, end, column, columns }) => (
                      <button
                        key={event.id}
                        className={`calendar-event ${event.taskId ? "linked" : ""} ${preview?.id === event.id ? "is-dragging" : ""}`}
                        aria-label={`${event.title} ${scheduleLabel(event)}`}
                        title={`${event.title}\n${scheduleLabel(event)}`}
                        onClick={() => {
                          if (suppressClick.current) {
                            suppressClick.current = false;
                            return;
                          }
                          onOpen(event);
                        }}
                        onPointerDown={(e) => begin(e, event)}
                        onPointerMove={move}
                        onPointerUp={finish}
                        onPointerCancel={() => {
                          drag.current = null;
                          setPreview(null);
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.altKey &&
                            ["ArrowUp", "ArrowDown"].includes(e.key)
                          ) {
                            e.preventDefault();
                            onReschedule(
                              shiftedEvent(
                                event,
                                e.key === "ArrowUp" ? -15 : 15,
                                0,
                                "move",
                              ),
                            );
                          }
                        }}
                        style={{
                          top: start,
                          transform:
                            preview?.id === event.id
                              ? `translate(${dragStyle.x}px,${dragStyle.y}px)`
                              : undefined,
                          height: Math.max(
                            18,
                            end -
                              start -
                              2 +
                              (preview?.id === event.id ? dragStyle.height : 0),
                          ),
                          left: `calc(${(column / columns) * 100}% + 3px)`,
                          width: `calc(${100 / columns}% - 6px)`,
                        }}
                      >
                        <i className="event-resize start" />
                        <i className="event-resize end" />
                        <strong>
                          {event.taskId && <Link2 size={11} />} {event.title}
                        </strong>
                        {end - start >= 35 && (
                          <span>
                            {event.start.slice(11)}–{event.end.slice(11)}
                          </span>
                        )}
                      </button>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : mode === "month" ? (
        <div className="calendar-month-scroll">
          <div className="calendar-weekdays">
            {weekdays.map((d) => (
              <span key={d}>周{d}</span>
            ))}
          </div>
          <div className="calendar-month-grid">
            {monthDays(day).map((d) => {
              const list = events
                .filter((e) => scheduledOn(e, d))
                .sort((a, b) => a.start.localeCompare(b.start));
              return (
                <div
                  key={d}
                  className={`calendar-month-cell ${d.slice(0, 7) !== day.slice(0, 7) ? "outside" : ""}`}
                >
                  <button
                    className={`calendar-day-number ${d === today ? "is-today" : ""}`}
                    aria-label={`查看 ${d}`}
                    onClick={() => openDay(d)}
                  >
                    {Number(d.slice(8))}
                  </button>
                  {list.slice(0, 3).map((e) => (
                    <button
                      key={e.id}
                      className="calendar-month-event"
                      title={`${e.title} ${scheduleLabel(e)}`}
                      onClick={() => onOpen(e)}
                    >
                      <time>
                        {e.start.slice(0, 10) < d ? "跨日" : e.start.slice(11)}
                      </time>
                      {e.title}
                    </button>
                  ))}
                  {list.length > 3 && (
                    <button
                      className="calendar-more"
                      onClick={() => openDay(d)}
                    >
                      +{list.length - 3} 项
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="calendar-year-grid">
          {Array.from({ length: 12 }, (_, i) => {
            const month = `${day.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
            return (
              <section className="calendar-mini-month" key={month}>
                <button
                  className="calendar-month-title"
                  onClick={() => {
                    onDay(`${month}-01`);
                    onMode("month");
                  }}
                >
                  {i + 1}月
                </button>
                <div className="calendar-mini-grid">
                  {weekdays.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                  {monthDays(`${month}-01`).map((d) => {
                    const count =
                      d.slice(0, 7) === month
                        ? events.filter((e) => scheduledOn(e, d)).length
                        : 0;
                    return (
                      <button
                        key={d}
                        disabled={d.slice(0, 7) !== month}
                        aria-label={`${d}，${count} 项日程`}
                        className={`${d === today ? "is-today" : ""} ${count ? "has-events" : ""}`}
                        onClick={() => openDay(d)}
                      >
                        {d.slice(0, 7) === month ? Number(d.slice(8)) : ""}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
