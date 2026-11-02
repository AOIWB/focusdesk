import { describe, it, expect } from "vitest";
import { initialWorkspace, makeTask, type Workspace } from "./model";
import {
  graphLinks,
  connectTasks,
  disconnectTasks,
  resetLinks,
  changeTask,
  normalizeWorkspace,
  projectNames,
  renameProject,
  deleteProject,
  searchWorkspace,
  mergeWorkspace,
} from "./workspace";
function fixture(): Workspace {
  return {
    ...initialWorkspace(),
    projects: ["工作", "空项目"],
    tasks: [
      makeTask({
        id: "c",
        title: "第三项",
        createdAt: "2026-11-03",
        quadrant: 0,
      }),
      makeTask({
        id: "a",
        title: "第一项",
        createdAt: "2026-11-01",
        quadrant: 0,
      }),
      makeTask({
        id: "b",
        title: "第二项",
        createdAt: "2026-11-02",
        quadrant: 0,
      }),
      makeTask({ id: "d", title: "其他象限", quadrant: 1 }),
    ],
  };
}
describe("任务图谱", () => {
  it("按创建时间自动连接，同象限不包含已完成任务", () => {
    const w = fixture();
    expect(graphLinks(w).map((l) => [l.source, l.target])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(
      graphLinks(changeTask(w, "b", { done: true })).map((l) => [
        l.source,
        l.target,
      ]),
    ).toEqual([["a", "c"]]);
  });
  it("手动添加保留现有关系，断开不会自动补回，支持恢复时间顺序", () => {
    const w = connectTasks(fixture(), "a", "c");
    expect(w.manualQuadrants).toEqual([0]);
    expect(graphLinks(w)).toHaveLength(3);
    const removed = disconnectTasks(w, "a", "b");
    expect(graphLinks(removed).map((l) => [l.source, l.target])).toEqual([
      ["b", "c"],
      ["a", "c"],
    ]);
    const reset = resetLinks(removed, 0);
    expect(graphLinks(reset).map((l) => [l.source, l.target])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
  });
  it("不重复连接，不跨象限，移动任务清理其手动关系", () => {
    const w = connectTasks(fixture(), "a", "c");
    expect(connectTasks(w, "a", "c").links).toHaveLength(3);
    expect(connectTasks(w, "a", "d")).toBe(w);
    expect(
      graphLinks(changeTask(w, "a", { quadrant: 1 })).every(
        (l) => l.source !== "a" || l.automatic,
      ),
    ).toBe(true);
  });
});
describe("项目与迁移", () => {
  it("旧数据迁移保留项目，空项目可重命名和删除，任务不会被删除", () => {
    const w = fixture();
    w.tasks[0].project = "工作";
    const renamed = renameProject(w, "工作", "课程");
    expect(renamed.tasks[0].project).toBe("课程");
    expect(projectNames(renameProject(w, "空项目", "新项目"))).toContain(
      "新项目",
    );
    const deleted = deleteProject(renamed, "课程");
    expect(deleted.tasks).toHaveLength(4);
    expect(deleted.tasks[0].project).toBe("");
    const old = {
      tasks: w.tasks,
      config: w.config,
      welcomed: false,
    } as Workspace;
    expect(normalizeWorkspace(old)).toMatchObject({
      projects: ["工作"],
      links: [],
      manualQuadrants: [],
    });
  });
  it("备份合并保留空项目、关系与手动模式且不会重复", () => {
    const w = connectTasks(fixture(), "a", "c");
    const result = mergeWorkspace(w, w);
    expect(result.tasks).toHaveLength(4);
    expect(result.links).toHaveLength(3);
    expect(result.projects).toContain("空项目");
    expect(result.manualQuadrants).toEqual([0]);
  });
});
describe("全局搜索", () => {
  it("搜索笔记深处、已完成任务、路径、日期、项目与多个关键词", () => {
    const w = fixture();
    w.tasks[0] = {
      ...w.tasks[0],
      done: true,
      description: "开头\n".repeat(100) + "课程机器人",
      folder: "/资料/课程/教案",
      due: "2026-12-05",
      project: "教学",
    };
    expect(searchWorkspace(w, "机器人").tasks[0].id).toBe("c");
    expect(searchWorkspace(w, "教案 已完成").tasks[0].id).toBe("c");
    expect(searchWorkspace(w, "2026-12-05").tasks).toHaveLength(1);
    expect(searchWorkspace(w, "空项目").projects).toEqual(["空项目"]);
    expect(searchWorkspace(w, "教学").projects).toEqual(["教学"]);
    expect(searchWorkspace(w, "不存在").tasks).toEqual([]);
  });
});
