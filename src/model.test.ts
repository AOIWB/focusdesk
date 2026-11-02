import { describe, expect, it, vi, afterEach } from "vitest";
import {
  completionUrl,
  localParse,
  pointToQuadrant,
  makeTask,
  tasksToMarkdown,
} from "./model";
import { parseTasks } from "./ai";

describe("任务分类与位置", () => {
  it("识别相对日期，跨月也正确", () => {
    expect(
      localParse("明天交提案，很重要", new Date(2026, 10, 30)),
    ).toMatchObject({ quadrant: 0, due: "2026-12-01" });
    expect(localParse("今天回复消息，不重要")).toMatchObject({ quadrant: 2 });
    expect(localParse("学习 Rust，不紧急")).toMatchObject({ quadrant: 1 });
    expect(localParse("整理收藏，不重要不紧急")).toMatchObject({ quadrant: 3 });
  });
  it("拖动跨越坐标轴时更换象限并保留象限内位置", () => {
    expect(pointToQuadrant(250, 200, 1000, 800)).toEqual({
      quadrant: 1,
      x: 0.5,
      y: 0.5,
    });
    expect(pointToQuadrant(750, 200, 1000, 800)).toEqual({
      quadrant: 0,
      x: 0.5,
      y: 0.5,
    });
    expect(pointToQuadrant(250, 600, 1000, 800)).toEqual({
      quadrant: 3,
      x: 0.5,
      y: 0.5,
    });
    expect(pointToQuadrant(750, 600, 1000, 800)).toEqual({
      quadrant: 2,
      x: 0.5,
      y: 0.5,
    });
  });
  it("API 地址支持基础路径和完整端点", () => {
    expect(completionUrl("http://localhost:11434/v1/")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
    expect(completionUrl("https://example.com/v1/chat/completions")).toBe(
      "https://example.com/v1/chat/completions",
    );
  });
});
describe("模型接入协议", () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = {
    url: "http://localhost:11434/v1",
    key: "",
    model: "qwen3:8b",
  };
  it("调用兼容接口并拆解多个任务，支持 Markdown JSON 代码块", async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '```json\n{"tasks":[{"title":"写提案","quadrant":0,"due":"2026-11-03","size":140},{"title":"学习设计","quadrant":1,"size":100}]}\n```',
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", request);
    const tasks = await parseTasks("明天写提案，之后学习设计", config);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      title: "写提案",
      quadrant: 0,
      due: "2026-11-03",
      size: 140,
    });
    expect(request).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("接口失败时保留错误信息，不能把错误当任务创建", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: "Unknown model" } }),
            { status: 400 },
          ),
      ),
    );
    await expect(parseTasks("做海报", config)).rejects.toThrow("Unknown model");
  });
});

describe("笔记视图导出", () => {
  it("按四个一级标题分组，保持任务与元数据", () => {
    const tasks = [
      makeTask({
        title: "规划课程",
        quadrant: 1,
        description: "调研\n整理大纲",
        due: "2026-11-12",
        project: "教学",
        folder: "/demo/course",
      }),
      makeTask({ title: "回复邮件", quadrant: 2 }),
    ];
    const result = tasksToMarkdown(tasks);
    expect(result.match(/^# .+$/gm)).toEqual([
      "# 紧急重要",
      "# 紧急不重要",
      "# 重要不紧急",
      "# 不紧急不重要",
    ]);
    expect(result.indexOf("回复邮件")).toBeLessThan(result.indexOf("规划课程"));
    expect(result).toContain("  调研\n  整理大纲");
    expect(result).toContain("  - 日期：2026-11-12");
    expect(result).toContain("  - 文件夹：/demo/course");
    expect(tasks[0].quadrant).toBe(1);
  });
});
