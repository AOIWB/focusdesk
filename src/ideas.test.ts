import { describe, it, expect } from "vitest";
import { initialWorkspace, makeIdea } from "./model";
import { filterIdeas, ideaEdges } from "./ideas";
import {
  normalizeWorkspace,
  mergeWorkspace,
  searchWorkspace,
} from "./workspace";
import { syncDocument, applyDocument } from "./syncModel";
import { trashItem, restoreTrash, backupWorkspace } from "./recovery";
describe("独立灵感空间", () => {
  const ideas = [
    { ...makeIdea("旧想法"), id: "old", createdAt: "2025-11-01T10:00:00" },
    { ...makeIdea("月初灵感"), id: "month", createdAt: "2026-11-01T10:00:00" },
    { ...makeIdea("周内灵感"), id: "week", createdAt: "2026-11-02T10:00:00" },
    {
      ...makeIdea("今天的想法"),
      id: "today",
      createdAt: "2026-11-03T10:00:00",
      notes: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "参考资料",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.com/ideas" },
                  },
                ],
              },
              {
                type: "image",
                attrs: { src: "data:image/png;base64,AA==", alt: "作品图" },
              },
            ],
          },
        ],
      },
    },
  ];
  it("按本地年月周日筛选并按创建顺序连接", () => {
    expect(filterIdeas(ideas, "year", "2026-11-03")).toHaveLength(3);
    expect(filterIdeas(ideas, "month", "2026-11-03")).toHaveLength(3);
    expect(filterIdeas(ideas, "week", "2026-11-03")).toHaveLength(2);
    expect(filterIdeas(ideas, "day", "2026-11-03").map((i) => i.id)).toEqual([
      "today",
    ]);
    expect(
      ideaEdges(filterIdeas([...ideas].reverse(), "week", "2026-11-03")),
    ).toEqual([{ source: "week", target: "today" }]);
  });
  it("搜索链接与正文，备份同步保留图片，删除恢复不改变任务和日程", () => {
    const w = { ...initialWorkspace(), ideas };
    expect(searchWorkspace(w, "example.com").ideas[0].id).toBe("today");
    expect(searchWorkspace(w, "参考资料").ideas).toHaveLength(1);
    const synced = applyDocument({ ...w, ideas: [] }, syncDocument(w));
    expect(synced.ideas).toEqual(ideas);
    expect(backupWorkspace(w).ideas).toEqual(ideas);
    const deleted = trashItem(w, "idea", "today");
    expect(deleted.ideas).toHaveLength(3);
    expect(deleted.tasks).toEqual(w.tasks);
    expect(deleted.events).toEqual(w.events);
    expect(restoreTrash(deleted, deleted.trash[0].id).ideas).toEqual(ideas);
    expect(mergeWorkspace(w, w).ideas).toHaveLength(4);
    const { ideas: _, ...old } = w;
    expect(normalizeWorkspace(old as typeof w).ideas).toEqual([]);
  });
});
