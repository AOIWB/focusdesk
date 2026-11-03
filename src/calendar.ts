import type { CalendarEvent } from "./model";

export type CalendarMode = "day" | "week" | "month" | "year";
export interface Schedule {
  start: string;
  end: string;
}
export const pad = (value: number) => String(value).padStart(2, "0");
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function localDateTime(date: Date) {
  return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export const dateFromKey = (date: string) => new Date(`${date}T12:00:00`);
export function addDays(day: string, count: number) {
  const date = dateFromKey(day);
  date.setDate(date.getDate() + count);
  return dateKey(date);
}
export function weekDays(day: string) {
  const start = addDays(day, -((dateFromKey(day).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
export function monthDays(day: string) {
  const start = weekDays(`${day.slice(0, 7)}-01`)[0];
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}
export function shiftPeriod(day: string, mode: CalendarMode, amount: number) {
  if (mode === "day" || mode === "week")
    return addDays(day, amount * (mode === "week" ? 7 : 1));
  const date = dateFromKey(day),
    originalDay = date.getDate();
  date.setDate(1);
  if (mode === "month") date.setMonth(date.getMonth() + amount);
  else date.setFullYear(date.getFullYear() + amount);
  const lastDay = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return dateKey(date);
}
export function validSchedule(value?: Schedule): value is Schedule {
  if (!value) return false;
  return (
    [value.start, value.end].every(
      (time) =>
        typeof time === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time) &&
        Number.isFinite(new Date(time).getTime()) &&
        localDateTime(new Date(time)) === time,
    ) && value.end > value.start
  );
}
export function defaultSchedule(day = dateKey(new Date()), hour = 9): Schedule {
  const start = new Date(`${day}T${pad(hour)}:00`);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start: localDateTime(start), end: localDateTime(end) };
}
export function scheduledOn(event: Schedule, day: string) {
  return event.start < `${addDays(day, 1)}T00:00` && event.end > `${day}T00:00`;
}
export function scheduleLabel(schedule: Schedule) {
  const start = schedule.start,
    end = schedule.end;
  return `${start.slice(5, 10).replace("-", "/")} ${start.slice(11)}–${start.slice(0, 10) === end.slice(0, 10) ? "" : `${end.slice(5, 10).replace("-", "/")} `}${end.slice(11)}`;
}
export interface DayEvent {
  event: CalendarEvent;
  start: number;
  end: number;
  column: number;
  columns: number;
}
export function layoutDayEvents(
  items: CalendarEvent[],
  day: string,
): DayEvent[] {
  const minutes = (time: string) =>
    Number(time.slice(11, 13)) * 60 + Number(time.slice(14, 16));
  const events = items
    .filter((event) => scheduledOn(event, day))
    .map((event) => ({
      event,
      start: event.start.slice(0, 10) < day ? 0 : minutes(event.start),
      end: event.end.slice(0, 10) > day ? 1440 : minutes(event.end),
      column: 0,
      columns: 1,
    }))
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.end - a.end ||
        a.event.id.localeCompare(b.event.id),
    );
  let group: DayEvent[] = [],
    ends: number[] = [],
    groupEnd = -1;
  const finish = () => {
    group.forEach((event) => {
      event.columns = ends.length;
    });
    group = [];
    ends = [];
  };
  for (const event of events) {
    if (event.start >= groupEnd) {
      finish();
      groupEnd = -1;
    }
    let column = ends.findIndex((end) => end <= event.start);
    if (column < 0) column = ends.length;
    ends[column] = event.end;
    event.column = column;
    group.push(event);
    groupEnd = Math.max(groupEnd, event.end);
  }
  finish();
  return events;
}
