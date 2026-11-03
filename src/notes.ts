import type { JSONContent } from "@tiptap/core";

export type TaskNotes = JSONContent;

export const emptyNotes = (): TaskNotes => ({
  type: "doc",
  content: [
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
    },
  ],
});

export function notesText(node?: TaskNotes): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "image") return node.attrs?.alt ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? [])
    .map(notesText)
    .join(node.type === "paragraph" || node.type === "heading" ? "" : "\n");
}

export function notesMarkdown(node?: TaskNotes, depth = 0): string {
  if (!node) return "";
  if (node.type === "text") {
    let text = (node.text ?? "").replace(/([\\`*_\[\]~])/g, "\\$1");
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") text = `**${text}**`;
      if (mark.type === "italic") text = `*${text}*`;
      if (mark.type === "strike") text = `~~${text}~~`;
      if (mark.type === "underline") text = `<u>${text}</u>`;
    }
    return text;
  }
  if (node.type === "image")
    return `![${String(node.attrs?.alt ?? "图片").replace(/[\[\]]/g, "")}](${node.attrs?.src ?? ""})`;
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "listItem") {
    return (node.content ?? [])
      .map((child, index) => {
        if (child.type === "bulletList" || child.type === "orderedList")
          return notesMarkdown(child, depth + 1);
        return `${"  ".repeat(depth)}${index === 0 ? "- " : "  "}${notesMarkdown(child, depth)}`;
      })
      .join("\n");
  }
  return (node.content ?? [])
    .map((child) => notesMarkdown(child, depth))
    .join(node.type === "paragraph" || node.type === "heading" ? "" : "\n");
}
