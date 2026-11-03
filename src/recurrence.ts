import type { CalendarEvent } from "./model";
import {
  addDays,
  dateFromKey,
  dateKey,
  localDateTime,
  scheduledOn,
} from "./calendar";
export type OccurrenceScope = "this" | "future";
function occurrenceDay(event: CalendarEvent, index: number) {
  const start = event.start.slice(0, 10),
    frequency = event.recurrence!.frequency;
  if (frequency === "daily" || frequency === "weekly")
    return addDays(start, index * (frequency === "weekly" ? 7 : 1));
  const date = dateFromKey(start),
    day = date.getDate(),
    month = date.getMonth();
  date.setDate(1);
  if (frequency === "monthly") date.setMonth(month + index);
  else date.setFullYear(date.getFullYear() + index);
  date.setDate(day);
  // A 31st or leap-day recurrence skips months/years without that date.
  if (
    date.getDate() !== day ||
    (frequency === "yearly" && date.getMonth() !== month)
  )
    return null;
  return dateKey(date);
}
export function expandEvents(
  events: CalendarEvent[],
  from: string,
  to: string,
): CalendarEvent[] {
  const output: CalendarEvent[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      if (event.start.slice(0, 10) <= to && event.end.slice(0, 10) >= from)
        output.push(event);
      continue;
    }
    const origin = dateFromKey(event.start.slice(0, 10)),
      lower = dateFromKey(from);
    const span = Math.ceil(
      (new Date(event.end).getTime() - new Date(event.start).getTime()) /
        86400000,
    );
    const firstDay = dateFromKey(addDays(from, -span));
    const frequency = event.recurrence.frequency;
    let index = Math.max(
      0,
      frequency === "daily" || frequency === "weekly"
        ? Math.floor(
            (firstDay.getTime() - origin.getTime()) /
              86400000 /
              (frequency === "weekly" ? 7 : 1),
          ) - 1
        : frequency === "monthly"
          ? (lower.getFullYear() - origin.getFullYear()) * 12 +
            lower.getMonth() -
            origin.getMonth() -
            1
          : lower.getFullYear() - origin.getFullYear() - 1,
    );
    const duration =
      new Date(event.end).getTime() - new Date(event.start).getTime();
    const maxIndex =
      frequency === "daily"
        ? Math.ceil((dateFromKey(to).getTime() - origin.getTime()) / 86400000) +
          2
        : frequency === "weekly"
          ? Math.ceil(
              (dateFromKey(to).getTime() - origin.getTime()) / 86400000 / 7,
            ) + 2
          : frequency === "monthly"
            ? (Number(to.slice(0, 4)) - origin.getFullYear()) * 12 +
              Number(to.slice(5, 7)) -
              origin.getMonth() +
              1
            : Number(to.slice(0, 4)) - origin.getFullYear() + 2;
    for (; index <= maxIndex; index++) {
      const day = occurrenceDay(event, index);
      if (!day) continue;
      if (day > to || (event.recurrence.until && day > event.recurrence.until))
        break;
      if (event.excludedDates?.includes(day)) continue;
      const start = `${day}T${event.start.slice(11)}`,
        end = localDateTime(new Date(new Date(start).getTime() + duration));
      if (end.slice(0, 10) < from) continue;
      output.push({
        ...event,
        id: `${event.id}@${day}`,
        seriesId: event.id,
        occurrenceDate: day,
        start,
        end,
      });
    }
  }
  return output;
}
export function updateOccurrence(
  events: CalendarEvent[],
  value: CalendarEvent,
  scope: OccurrenceScope,
  remove = false,
) {
  const root = events.find((e) => e.id === (value.seriesId || value.id));
  if (!root || !root.recurrence)
    return remove
      ? events.filter((e) => e.id !== value.id)
      : root
        ? events.map((e) => (e.id === value.id ? value : e))
        : [...events, value];
  const day = value.occurrenceDate || root.start.slice(0, 10);
  const { seriesId: _s, occurrenceDate: _o, ...plain } = value;
  if (scope === "this") {
    const updated = events.map((e) =>
      e.id === root.id
        ? {
            ...e,
            excludedDates: [...new Set([...(e.excludedDates ?? []), day])],
          }
        : e,
    );
    return remove
      ? updated
      : [
          ...updated,
          {
            ...plain,
            id: crypto.randomUUID(),
            recurrence: undefined,
            excludedDates: undefined,
          },
        ];
  }
  const updated =
    day === root.start.slice(0, 10)
      ? events.filter((e) => e.id !== root.id)
      : events.map((e) =>
          e.id === root.id
            ? {
                ...e,
                recurrence: { ...e.recurrence!, until: addDays(day, -1) },
              }
            : e,
        );
  return remove
    ? updated
    : [
        ...updated,
        {
          ...plain,
          id: day === root.start.slice(0, 10) ? root.id : crypto.randomUUID(),
          excludedDates: root.excludedDates?.filter((d) => d >= day),
        },
      ];
}
export function shiftedEvent(
  event: CalendarEvent,
  minutes: number,
  days: number,
  edge: "move" | "start" | "end",
): CalendarEvent {
  const shift = (text: string, delta: number) => {
    const d = new Date(text);
    if (edge === "move") d.setDate(d.getDate() + days);
    d.setMinutes(d.getMinutes() + delta);
    return localDateTime(d);
  };
  const start = edge === "end" ? event.start : shift(event.start, minutes),
    end = edge === "start" ? event.end : shift(event.end, minutes);
  return end > start ? { ...event, start, end } : event;
}
export const eventsOn = (events: CalendarEvent[], day: string) =>
  expandEvents(events, day, day).filter((e) => scheduledOn(e, day));
