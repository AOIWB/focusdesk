// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { notesExtensions } from "./notesEditor";
import { noteBranches, layoutMindmap } from "./mindmapLayout";
import { notesText } from "./notes";
describe("大纲与导图共用文档", () => {
  it("保留层级、格式和图片，并能定位真实编辑器节点", () => {
    const editor = new Editor({
      extensions: notesExtensions(),
      content:
        '<ul><li><p><strong>课程目标</strong></p><ul><li><p>动手实践</p></li><li><p>科学表达</p></li></ul></li><li><p>课程资料</p><img src="data:image/png;base64,AA==" alt="图示"></li></ul>',
    });
    const doc = editor.getJSON(),
      tree = noteBranches(doc);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].content[0].content![0].marks![0].type).toBe("bold");
    expect(JSON.stringify(tree[1].content)).toContain(
      "data:image/png;base64,AA==",
    );
    for (const node of [...tree, ...tree[0].children])
      expect(editor.state.doc.nodeAt(node.pos)?.type.name).toBe("listItem");
    const layout = layoutMindmap(tree);
    expect(layout).toHaveLength(4);
    const pos = tree[0].pos,
      node = editor.state.doc.nodeAt(pos)!;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        collapsed: true,
      }),
    );
    expect(layoutMindmap(noteBranches(editor.getJSON()))).toHaveLength(2);
    expect(notesText(editor.getJSON())).toContain("动手实践");
    expect(tree[0].collapsed).toBe(false);
    editor.destroy();
  });
});
