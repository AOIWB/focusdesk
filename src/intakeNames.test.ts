import { describe, it, expect, vi, afterEach } from "vitest";
import { taskTitle, makeTask } from "./model";
import { localIntake, parseIntake } from "./intake";
describe("任务名称与操作意图", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("提取工作本身并保留有实义的完成一词", () => {
    expect(taskTitle("完成论文撰写")).toBe("论文撰写");
    expect(taskTitle("我要明天前完成论文撰写")).toBe("论文撰写");
    expect(taskTitle("完成明日科技执行材料报名")).toBe("科技执行材料报名");
    expect(taskTitle("完成情况报告")).toBe("完成情况报告");
    expect(taskTitle("制作项目完成情况报告")).toBe("制作项目完成情况报告");
    expect(
      localIntake("明天前完成论文撰写", [], "auto", new Date(2026, 10, 3))[0],
    ).toMatchObject({
      kind: "task",
      value: { title: "论文撰写", due: "2026-11-04" },
    });
  });
  it("显式标记完成匹配已有任务，不生成新任务", async () => {
    const t = makeTask({ title: "论文撰写" });
    expect(localIntake("把论文撰写标记为已完成", [t])[0]).toMatchObject({
      kind: "complete",
      value: { id: t.id },
    });
    expect(() => localIntake("把不存在标记为已完成", [t])).toThrow("没有找到");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await parseIntake(
          "把论文撰写标记为已完成",
          [t],
          { url: "https://example.com", key: "", model: "test" },
          "auto",
        )
      )[0].kind,
    ).toBe("complete");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("模型返回带完成前缀时统一规范化", async () => {
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
                        {
                          kind: "task",
                          title: "完成论文撰写",
                          due: "2026-11-04",
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
      "明天前完成论文撰写",
      [],
      { url: "https://example.com", key: "", model: "test" },
      "auto",
    );
    expect(items[0]).toMatchObject({
      kind: "task",
      value: { title: "论文撰写", due: "2026-11-04" },
    });
  });
});
