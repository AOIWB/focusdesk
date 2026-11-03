import { describe, expect, it, vi, afterEach } from "vitest";
import { initialWorkspace, makeTask, makeEvent } from "./model";
import {
  emptyDocument,
  syncDocument,
  mergeDocuments,
  applyDocument,
  trackDeletions,
} from "./syncModel";
import { defaultDevice } from "./device";
import { externalizeImages, repoRequest, testRepository } from "./sync";
import { trashItem, restoreTrash, backupWorkspace } from "./recovery";
import { normalizeWorkspace, renameProject } from "./workspace";
const fixture = () => {
  const w = initialWorkspace();
  w.tasks = [
    makeTask({
      id: "task",
      title: "方案",
      project: "工作",
      folder: "/mac/old",
      folders: ["/mac/a", "/mac/b"],
    }),
  ];
  w.projectFolders = { 工作: ["/mac/project"] };
  return w;
};
describe("本地模式和同步合并", () => {
  it("默认不启用同步；上传剔除凭据和所有本地路径，含回收站", () => {
    expect(defaultDevice().sync).toMatchObject({ enabled: false, auto: false });
    const w = fixture();
    w.config.key = "API_SECRET";
    w.events = [
      makeEvent({
        title: "会",
        start: "2026-11-03T10:00",
        end: "2026-11-03T11:00",
        folder: "/mac/event",
        folders: ["/mac/extra"],
      }),
    ];
    const trash = trashItem(w, "task", "task");
    const text = JSON.stringify(syncDocument(trash));
    expect(text).not.toContain("/mac");
    expect(text).not.toContain("API_SECRET");
    expect(text).not.toContain("config");
  });
  it("不同记录和同一任务不同字段自动合并", () => {
    const w = fixture(),
      base = syncDocument(w),
      local = structuredClone(base),
      remote = structuredClone(base);
    local.records["task:task"].title = "新方案";
    remote.records["task:task"].due = "2026-11-06";
    const merged = mergeDocuments(base, local, remote);
    expect(merged.conflicts).toHaveLength(0);
    expect(merged.document.records["task:task"]).toMatchObject({
      title: "新方案",
      due: "2026-11-06",
    });
  });
  it("同一笔记修改保留双方供选择，删除遇上编辑也必须选择", () => {
    const base = syncDocument(fixture()),
      local = structuredClone(base),
      remote = structuredClone(base);
    local.records["task:task"].notes = { text: "本地" };
    remote.records["task:task"].notes = { text: "云端" };
    const conflict = mergeDocuments(base, local, remote);
    expect(conflict.conflicts[0]).toMatchObject({
      field: "notes",
      local: { text: "本地" },
      remote: { text: "云端" },
    });
    const resolved = mergeDocuments(base, local, remote, {
      "task:task/notes": "remote",
    });
    expect(resolved.conflicts).toHaveLength(0);
    expect(resolved.document.records["task:task"].notes).toEqual({
      text: "云端",
    });
    delete local.records["task:task"];
    local.deleted["task:task"] = "date";
    expect(mergeDocuments(base, local, remote).conflicts[0].field).toBe(
      "$record",
    );
  });
  it("删除在未改动的另一端生效，首次同步遇删除标记不会悄悄复活", () => {
    const w = fixture(),
      base = syncDocument(w),
      removed = trackDeletions(w, trashItem(w, "task", "task")),
      local = syncDocument(removed);
    expect(
      mergeDocuments(base, local, base).document.records["task:task"],
    ).toBeUndefined();
    expect(
      mergeDocuments(emptyDocument(), base, local).conflicts.some(
        (c) => c.key === "task:task",
      ),
    ).toBe(true);
  });
  it("下载保留本设备目录，项目改名也保留文件关联", () => {
    const w = fixture(),
      cloud = syncDocument(w);
    cloud.records["task:task"].title = "同步修改";
    const restored = applyDocument(w, cloud);
    expect(restored.tasks[0].folders).toEqual(["/mac/a", "/mac/b"]);
    expect(restored.projectFolders).toEqual(w.projectFolders);
    expect(renameProject(w, "工作", "教学").projectFolders.教学).toEqual([
      "/mac/project",
    ]);
  });
  it("旧数据迁移不丢旧单目录，回收站恢复内容和项目多目录", () => {
    const w = fixture();
    const old = { ...w };
    delete (old as Partial<typeof w>).projectFolders;
    delete (old as Partial<typeof w>).trash;
    expect(normalizeWorkspace(old).tasks[0].folder).toBe("/mac/old");
    expect(normalizeWorkspace(old).trash).toEqual([]);
    const removed = trashItem(w, "project", "工作", true);
    expect(removed.tasks).toHaveLength(0);
    const restored = restoreTrash(removed, removed.trash[0].id);
    expect(restored.tasks[0].folders).toHaveLength(2);
    expect(restored.projectFolders.工作).toEqual(["/mac/project"]);
    expect(
      backupWorkspace({ ...w, config: { ...w.config, key: "secret" } }).config
        .key,
    ).toBe("");
  });
  it("相同图片只上传一次，笔记中保留独立资产引用", async () => {
    const doc = emptyDocument(),
      image = "data:image/png;base64,aGVsbG8=";
    doc.records.test = { a: image, b: image };
    const upload = vi.fn(async () => {});
    const packed = await externalizeImages(doc, upload);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(packed.records.test.a).toBe(packed.records.test.b);
    expect(packed.records.test.a).toMatch(/^pinecone-asset:/);
  });
});
describe("仓库 API", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("GitHub 使用认证头，Gitee 使用平台访问参数", async () => {
    const fetch = vi.fn(async (..._args: unknown[]) => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const s = { ...defaultDevice().sync, token: "test-only" };
    await repoRequest(s, "/repos/me/data");
    expect(fetch.mock.calls[0][0]).toBe("https://api.github.com/repos/me/data");
    await repoRequest({ ...s, provider: "gitee" }, "/repos/me/data?ref=main");
    expect(fetch.mock.calls[1][0]).toContain("&access_token=test-only");
  });
  it("测试连接验证私有仓库与分支，不把读权限说成写权限", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"private":true}')),
    );
    const s = {
      ...defaultDevice().sync,
      token: "test-only",
      owner: "me",
      repo: "data",
    };
    expect(await testRepository(s)).toContain("写入权限在同步时验证");
  });
});
