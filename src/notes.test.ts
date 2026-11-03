// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  notesExtensions,
  insertImages,
  expandSelectionAncestors,
} from "./notesEditor";
import { emptyNotes, notesText, type TaskNotes } from "./notes";
import { initialWorkspace, makeTask, tasksToMarkdown } from "./model";
import { mergeWorkspace, searchWorkspace } from "./workspace";

const editors: Editor[] = [];
function documentOf(editor: Editor): TaskNotes {
  return editor.getJSON();
}
function makeEditor(content = emptyNotes()) {
  const editor = new Editor({ extensions: notesExtensions(), content });
  editors.push(editor);
  return editor;
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe("任务内部大纲", () => {
  it("回车创建同级条目，缩进成为子项，取消缩进回到同级", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("发布准备");
    expect(editor.commands.splitListItem("listItem")).toBe(true);
    editor.commands.insertContent("检查功能");
    expect(editor.commands.sinkListItem("listItem")).toBe(true);
    const parent = documentOf(editor).content![0].content![0];
    expect(parent.content![1].type).toBe("bulletList");
    expect(notesText(parent.content![1])).toBe("检查功能");
    editor.commands.liftListItem("listItem");
    expect(documentOf(editor).content![0].content).toHaveLength(2);
    expect(notesText(documentOf(editor))).toContain("发布准备\n检查功能");
  });

  it("混合文字格式在 JSON 重建后保留，Markdown 导出包含子项", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("任务记录");
    editor.commands.setTextSelection({ from: 3, to: 7 });
    editor
      .chain()
      .toggleBold()
      .toggleItalic()
      .toggleUnderline()
      .toggleStrike()
      .setColor("#3469c7")
      .setHighlight({ color: "#fef3c7" })
      .run();
    const restored = makeEditor(JSON.parse(JSON.stringify(documentOf(editor))));
    expect(restored.getHTML()).toContain("<strong>");
    expect(restored.getHTML()).toContain("<em>");
    expect(restored.getHTML()).toContain("<u>");
    expect(restored.getHTML()).toContain("<s>");
    expect(restored.getHTML()).toContain("#3469c7");
    expect(restored.getHTML()).toContain("#fef3c7");
    expect(
      tasksToMarkdown([
        makeTask({ title: "验收", notes: documentOf(restored) }),
      ]),
    ).toContain("任务记录");
    restored.commands.setTextSelection({ from: 3, to: 7 });
    restored.chain().unsetColor().unsetHighlight().run();
    expect(restored.getHTML()).not.toContain("<mark");
    expect(restored.getHTML()).not.toContain("color:");
  });

  it("折叠子项仍参与全文搜索与备份，进入隐藏子项时自动展开", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("标题");
    editor.commands.splitListItem("listItem");
    editor.commands.insertContent("深层机器人资料");
    editor.commands.sinkListItem("listItem");
    const childPosition = editor.state.selection.from;
    editor.commands.setTextSelection(3);
    editor.commands.updateAttributes("listItem", { collapsed: true });
    const task = makeTask({
      title: "大纲",
      done: true,
      notes: documentOf(editor),
    });
    const workspace = { ...initialWorkspace(), tasks: [task] };
    expect(searchWorkspace(workspace, "机器人 已完成").tasks[0].id).toBe(
      task.id,
    );
    const restored = mergeWorkspace(
      { ...initialWorkspace(), tasks: [] },
      JSON.parse(JSON.stringify(workspace)),
    );
    expect(restored.tasks[0].notes).toEqual(task.notes);
    expect(restored.tasks).toHaveLength(1);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, childPosition),
      ),
    );
    expandSelectionAncestors(editor);
    expect(documentOf(editor).content![0].content![0].attrs?.collapsed).toBe(
      false,
    );
  });

  it("图片保存在插入位置并可随备份重建、撤销，异步读取时继续输入不丢字", async () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(3);
    const file = new File([new Uint8Array([137, 80, 78, 71])], "产品图片.png", {
      type: "image/png",
    });
    const pending = insertImages(editor, [file]);
    editor.commands.insertContent("继续输入");
    await pending;
    const notes = documentOf(editor);
    const content = notes.content![0].content![0].content![0].content!;
    expect(content[0].text).toBe("继续输入");
    expect(content[1]).toMatchObject({
      type: "image",
      attrs: { src: "data:image/png;base64,iVBORw==", alt: "产品图片.png" },
    });
    const restored = makeEditor(JSON.parse(JSON.stringify(notes)));
    expect(restored.getHTML()).toContain("data:image/png;base64,iVBORw==");
    expect(notesText(notes)).toContain("继续输入产品图片.png");
    expect(tasksToMarkdown([makeTask({ title: "图片", notes })])).toContain(
      "![产品图片.png](data:image/png;base64,",
    );
    editor.commands.undo();
    expect(editor.getHTML()).not.toContain("<img");
  });
});
