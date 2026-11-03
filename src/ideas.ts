import type { Idea } from "./model";
import { dateKey, weekDays } from "./calendar";
import { notesText, notesLinks } from "./notes";
import { matchesSearch } from "./workspace";
export type IdeaPeriod = "all" | "year" | "month" | "week" | "day";
export function filterIdeas(
  ideas: Idea[],
  period: IdeaPeriod,
  day: string,
  query = "",
) {
  const week = weekDays(day);
  return ideas
    .filter((i) => {
      const date = dateKey(new Date(i.createdAt));
      const matches =
        period === "all" ||
        (period === "year" && date.slice(0, 4) === day.slice(0, 4)) ||
        (period === "month" && date.slice(0, 7) === day.slice(0, 7)) ||
        (period === "week" && date >= week[0] && date <= week[6]) ||
        (period === "day" && date === day);
      return (
        matches &&
        matchesSearch(
          [i.title, notesText(i.notes), notesLinks(i.notes)].join("\n"),
          query,
        )
      );
    })
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
}
export function ideaEdges(ideas: Idea[]) {
  return ideas
    .slice(1)
    .map((idea, index) => ({ source: ideas[index].id, target: idea.id }));
}
