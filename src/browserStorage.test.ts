// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterAll, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
vi.stubGlobal(
  "localStorage",
  new Window({ url: "http://localhost" }).localStorage,
);
afterAll(() => vi.unstubAllGlobals());
import { readBrowserWorkspace, writeBrowserWorkspace } from "./browserStorage";

it("首次读取旧 localStorage，保存包含大图的笔记后以 IndexedDB 为准", async () => {
  const previous = JSON.stringify({ tasks: [{ title: "原有任务" }] });
  localStorage.setItem("focusdesk.workspace.v1", previous);
  expect(await readBrowserWorkspace()).toBe(previous);
  const next = JSON.stringify({
    tasks: [
      {
        title: "原有任务",
        notes: {
          type: "image",
          attrs: {
            src: "data:image/png;base64," + "a".repeat(6 * 1024 * 1024),
          },
        },
      },
    ],
  });
  await writeBrowserWorkspace(next);
  expect(await readBrowserWorkspace()).toBe(next);
  expect(localStorage.getItem("focusdesk.workspace.v1")).toBe(previous);
});
