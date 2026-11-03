import { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ListItem } from "@tiptap/extension-list";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { ChevronRight } from "lucide-react";
import type { Transaction } from "@tiptap/pm/state";

function OutlineItem({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const previous = useRef(Boolean(node.attrs.collapsed));
  const heights = useRef<number[]>([]);
  const childLists = () =>
    host.current?.querySelectorAll<HTMLElement>(
      ":scope > .notes-item-content > [data-node-view-content-react] > ul, :scope > .notes-item-content > [data-node-view-content-react] > ol",
    );
  useLayoutEffect(() => {
    const collapsed = Boolean(node.attrs.collapsed);
    if (previous.current !== collapsed && !reduced) {
      childLists()?.forEach((list, i) => {
        list.getAnimations?.().forEach((animation) => animation.cancel());
        const height = collapsed
          ? (heights.current[i] ?? 0)
          : list.scrollHeight;
        const animation = list.animate?.(
          [
            {
              display: "block",
              height: `${collapsed ? height : 0}px`,
              opacity: collapsed ? 1 : 0,
              overflow: "hidden",
            },
            {
              display: "block",
              height: `${collapsed ? 0 : height}px`,
              opacity: collapsed ? 0 : 1,
              overflow: "hidden",
            },
          ],
          { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" },
        );
        void animation?.finished.catch(() => {});
      });
    }
    previous.current = collapsed;
  }, [node.attrs.collapsed, reduced]);
  const hasChildren = node.content.content.some(
    (child) =>
      child.type.name === "bulletList" || child.type.name === "orderedList",
  );
  return (
    <NodeViewWrapper
      ref={host}
      as="div"
      className={`notes-item ${node.attrs.collapsed ? "is-collapsed" : ""}`}
    >
      <span className="notes-item-controls" contentEditable={false}>
        {hasChildren && (
          <button
            className="notes-fold"
            type="button"
            aria-label={node.attrs.collapsed ? "展开子项" : "折叠子项"}
            aria-expanded={!node.attrs.collapsed}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              heights.current = Array.from(childLists() ?? []).map(
                (list) => list.getBoundingClientRect().height,
              );
              const position = getPos();
              if (!node.attrs.collapsed && position !== undefined)
                editor.commands.setTextSelection(
                  position + node.firstChild!.nodeSize,
                );
              updateAttributes({ collapsed: !node.attrs.collapsed });
            }}
          >
            <ChevronRight size={13} />
          </button>
        )}
        <span
          className="notes-drag"
          data-drag-handle
          draggable="true"
          title="拖动条目"
          aria-label="拖动条目"
        >
          <span />
        </span>
      </span>
      <NodeViewContent className="notes-item-content" />
    </NodeViewWrapper>
  );
}

export const OutlineListItem = ListItem.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) =>
          element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes) => ({
          "data-collapsed": String(attributes.collapsed),
        }),
      },
    };
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => {
        this.editor.commands.sinkListItem(this.name);
        return true;
      },
      "Shift-Tab": () => {
        this.editor.commands.liftListItem(this.name);
        return true;
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(OutlineItem, { as: "li" });
  },
});

export function notesExtensions() {
  return [
    StarterKit.configure({
      listItem: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { title: "⌘ / Ctrl + 单击打开链接" },
      },
      heading: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    OutlineListItem,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Image.configure({ inline: true, allowBase64: true }),
    Placeholder.configure({ placeholder: "开始记录…", showOnlyCurrent: true }),
  ];
}

export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function insertImages(editor: Editor, files: File[]) {
  // Keep the paste location even when the user types while image files are read.
  let bookmark = editor.state.selection.getBookmark();
  const mapSelection = ({ transaction }: { transaction: Transaction }) => {
    bookmark = bookmark.map(transaction.mapping);
  };
  editor.on("transaction", mapSelection);
  try {
    const sources = await Promise.all(files.map(readImage));
    if (editor.isDestroyed) return;
    const selection = bookmark.resolve(editor.state.doc);
    editor.commands.insertContentAt(
      { from: selection.from, to: selection.to },
      sources.map((src, index) => ({
        type: "image",
        attrs: { src, alt: files[index].name || "图片" },
      })),
    );
  } finally {
    editor.off("transaction", mapSelection);
  }
}

export function expandSelectionAncestors(editor: Editor) {
  const { $from } = editor.state.selection;
  const transaction = editor.state.tr;
  for (let depth = 1; depth <= $from.depth; depth++) {
    const node = $from.node(depth);
    // Only reveal ancestors when the caret actually enters their nested list.
    if (
      node.type.name === "listItem" &&
      node.attrs.collapsed &&
      $from.depth > depth + 1
    ) {
      transaction.setNodeMarkup($from.before(depth), undefined, {
        ...node.attrs,
        collapsed: false,
      });
    }
  }
  if (transaction.docChanged) editor.view.dispatch(transaction);
}
