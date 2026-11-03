import type { TaskNotes } from "./notes";
import { notesText } from "./notes";
export interface MindNode {
  id: string;
  pos: number;
  content: TaskNotes[];
  children: MindNode[];
  collapsed: boolean;
}
const sizeOf = (node: TaskNotes): number =>
  node.type === "text"
    ? (node.text?.length ?? 0)
    : node.type === "image" || node.type === "hardBreak"
      ? 1
      : 2 + (node.content ?? []).reduce((n, c) => n + sizeOf(c), 0);
export function noteBranches(doc: TaskNotes): MindNode[] {
  function walk(content: TaskNotes[], start: number): MindNode[] {
    let pos = start;
    const result: MindNode[] = [];
    for (const node of content) {
      if (node.type === "bulletList" || node.type === "orderedList")
        result.push(...walk(node.content ?? [], pos + 1));
      else if (node.type === "listItem") {
        const text: TaskNotes[] = [];
        const children: MindNode[] = [];
        let childPos = pos + 1;
        for (const child of node.content ?? []) {
          if (child.type === "bulletList" || child.type === "orderedList")
            children.push(...walk(child.content ?? [], childPos + 1));
          else text.push(child);
          childPos += sizeOf(child);
        }
        result.push({
          id: String(pos),
          pos,
          content: text,
          children,
          collapsed: Boolean(node.attrs?.collapsed),
        });
      } else
        result.push({
          id: String(pos),
          pos,
          content: [node],
          children: [],
          collapsed: false,
        });
      pos += sizeOf(node);
    }
    return result;
  }
  return walk(doc.content ?? [], 0);
}
export interface MapNode extends MindNode {
  x: number;
  y: number;
  height: number;
  side: number;
  parent?: string;
}
export function layoutMindmap(branches: MindNode[]): MapNode[] {
  const heights = new Map<string, number>();
  const imageCount = (n: TaskNotes): number =>
    (n.type === "image" ? 1 : 0) +
    (n.content ?? []).reduce((a, c) => a + imageCount(c), 0);
  const ownHeight = (node: MindNode) =>
    Math.max(
      44,
      20 +
        node.content.reduce(
          (h, c) =>
            h +
            Math.max(1, Math.ceil(notesText(c).length / 11)) * 24 +
            imageCount(c) * 94,
          0,
        ),
    );
  function span(n: MindNode): number {
    const own = ownHeight(n);
    const children = n.collapsed
      ? 0
      : n.children.reduce((s, c) => s + span(c) + 18, 0) - 18;
    const height = Math.max(own, children);
    heights.set(n.id, height);
    return height;
  }
  branches.forEach(span);
  const output: MapNode[] = [];
  function place(
    n: MindNode,
    side: number,
    depth: number,
    y: number,
    parent?: string,
  ) {
    output.push({
      ...n,
      side,
      x: side * (depth * 210 + 20),
      y,
      height: ownHeight(n),
      parent,
    });
    if (n.collapsed) return;
    const childrenHeight =
      n.children.reduce((s, c) => s + heights.get(c.id)! + 18, 0) - 18;
    let top = y - childrenHeight / 2;
    n.children.forEach((c) => {
      const h = heights.get(c.id)!;
      place(c, side, depth + 1, top + h / 2, n.id);
      top += h + 18;
    });
  }
  for (const side of [-1, 1]) {
    const list = branches.filter((_, i) => i % 2 === (side === 1 ? 0 : 1));
    const total = list.reduce((s, n) => s + heights.get(n.id)! + 26, 0) - 26;
    let y = -total / 2;
    list.forEach((n) => {
      const h = heights.get(n.id)!;
      place(n, side, 1, y + h / 2);
      y += h + 26;
    });
  }
  return output;
}
