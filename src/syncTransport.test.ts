import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./storage", () => ({ readLocal: vi.fn(async () => null) }));
import { prepareSync, uploadSync } from "./sync";
import { defaultDevice } from "./device";
import { emptyDocument } from "./syncModel";
afterEach(() => vi.unstubAllGlobals());
describe("仓库同步往返", () => {
  for (const provider of ["github", "gitee"] as const)
    it(`${provider} 首次上传、下载图片、重叠写入失败保留错误`, async () => {
      const files = new Map<string, { content: string; sha: string }>();
      let revision = 0,
        conflict = false;
      const calls: { method: string; path: string }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string, init: RequestInit) => {
          const url = new URL(input),
            method = init.method || "GET",
            path = url.pathname;
          calls.push({ method, path });
          if (path.endsWith("/branches/main")) return new Response("{}");
          if (!path.includes("/contents/"))
            return new Response('{"private":true}');
          const key = decodeURIComponent(path.split("/contents/")[1]);
          if (method === "GET")
            return new Response(
              JSON.stringify(files.get(key) || { message: "Not Found" }),
              { status: files.has(key) ? 200 : 404 },
            );
          if (conflict && key.endsWith("workspace.json"))
            return new Response('{"message":"sha changed"}', { status: 409 });
          const body = JSON.parse(String(init.body));
          if (provider === "gitee" && !files.has(key))
            expect(method).toBe("POST");
          files.set(key, { content: body.content, sha: String(++revision) });
          return new Response("{}", { status: 201 });
        }),
      );
      const settings = {
        ...defaultDevice().sync,
        provider,
        owner: "fixture",
        repo: "private",
        token: "fixture-only",
      };
      const local = emptyDocument();
      local.records["task:one"] = {
        id: "one",
        title: "上课",
        notes: {
          type: "image",
          attrs: { src: "data:image/png;base64,aGVsbG8=" },
        },
      };
      const first = await prepareSync(settings, local);
      expect(first.first).toBe(true);
      expect(first.remote.records).toEqual({});
      const uploaded = await uploadSync(settings, first, {});
      expect(uploaded).toEqual(local);
      expect(files.size).toBe(2);
      expect(
        Buffer.from(
          files.get("pinecone/workspace.json")!.content,
          "base64",
        ).toString(),
      ).not.toContain("data:image");
      const second = await prepareSync(settings, local);
      expect(second.remote).toEqual(local);
      expect(second.sha).toBeTruthy();
      const writes = calls.filter((c) => c.method !== "GET").length;
      await uploadSync(settings, { ...second, base: local }, {});
      expect(calls.filter((c) => c.method !== "GET")).toHaveLength(writes);
      const changed = structuredClone(local);
      changed.records["task:one"].title = "修改";
      conflict = true;
      await expect(
        uploadSync(settings, { ...second, base: local, local: changed }, {}),
      ).rejects.toThrow("云端已变化");
      expect(
        JSON.parse(
          Buffer.from(
            files.get("pinecone/workspace.json")!.content,
            "base64",
          ).toString(),
        ).records["task:one"].title,
      ).toBe("上课");
    });
});
