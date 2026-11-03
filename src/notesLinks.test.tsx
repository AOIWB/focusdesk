// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import TaskNotes from "./TaskNotes";
import { notesExtensions } from "./notesEditor";
import { notesLinks, notesMarkdown } from "./notes";

afterEach(() => vi.restoreAllMocks());

it("正文链接在原段落内识别，导出与搜索保留地址", () => {
  const editor = new Editor({
    extensions: notesExtensions(),
    content: "<p>前面的文字 </p><p>后面的文字</p>",
  });
  editor.commands.setTextSelection(6);
  editor.commands.insertContent(" https://example.com ");
  const doc = editor.getJSON();
  expect(doc.content).toHaveLength(2);
  expect(notesLinks(doc)).toContain("https://example.com");
  expect(notesMarkdown(doc)).toContain(
    "[https://example.com](https://example.com)",
  );
  expect(editor.state.doc.child(1).textContent).toBe("后面的文字");
  editor.destroy();
});

it("普通点击编辑，修饰键点击与快捷键打开链接且不插入换行", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const change = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <TaskNotes
        task={{
          id: "link-test",
          title: "测试笔记",
          project: "",
          notes: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "正文链接",
                    marks: [
                      { type: "link", attrs: { href: "https://example.com" } },
                    ],
                  },
                ],
              },
            ],
          },
        }}
        onUpdate={change}
        onClose={() => {}}
        onError={() => {}}
      />,
    );
  });
  const anchor = host.querySelector("a")!;
  expect(anchor).not.toBeNull();
  await act(async () => {
    anchor.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  expect(open).not.toHaveBeenCalled();
  await act(async () => {
    anchor.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      }),
    );
  });
  expect(open).toHaveBeenCalledWith(
    "https://example.com/",
    "_blank",
    "noopener,noreferrer",
  );
  const content = host.querySelector("[contenteditable]")!;
  const range = document.createRange();
  range.setStart(anchor.firstChild!, 2);
  range.collapse(true);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  content.dispatchEvent(new FocusEvent("focus"));
  document.dispatchEvent(new Event("selectionchange"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const before = content.innerHTML;
  await act(async () => {
    content.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(open).toHaveBeenCalledTimes(2);
  expect(content.innerHTML).toBe(before);
  await act(async () => root.unmount());
  host.remove();
});
