import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  IndentIncrease,
  IndentDecrease,
  ImagePlus,
  Undo2,
  Redo2,
  X,
  ChevronDown,
  Type,
  Highlighter,
  Download,
} from "lucide-react";
import type { Task } from "./model";
import { emptyNotes, notesMarkdown } from "./notes";
import {
  notesExtensions,
  insertImages,
  expandSelectionAncestors,
} from "./notesEditor";
import "./TaskNotes.css";

const colors = [
  "#292d32",
  "#6b7280",
  "#be4545",
  "#b66a24",
  "#36764d",
  "#3469c7",
  "#8654af",
];
const highlights = [
  "#fef3c7",
  "#fce0e0",
  "#ffead5",
  "#dcf0df",
  "#dbeafe",
  "#eee2fa",
  "#e5e7eb",
];

export default function TaskNotes({
  task,
  onUpdate,
  onClose,
  onError,
}: {
  task: Task;
  onUpdate: (id: string, change: Partial<Task>) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  const [palette, setPalette] = useState<"text" | "background" | null>(null);
  const editor = useEditor({
    extensions: notesExtensions(),
    content: task.notes ?? emptyNotes(),
    autofocus: "end",
    editorProps: {
      attributes: {
        class: "task-notes-content",
        role: "textbox",
        "aria-label": "任务大纲笔记",
        "aria-multiline": "true",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (file) => file.type.startsWith("image/"),
        );
        if (!files.length) return false;
        void insertImages(editor!, files).catch(() =>
          onError("图片粘贴失败，请重试"),
        );
        return true;
      },
    },
    onUpdate: ({ editor }) =>
      updateRef.current(task.id, { notes: editor.getJSON() }),
    onSelectionUpdate: ({ editor }) => expandSelectionAncestors(editor),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            strike: editor.isActive("strike"),
            list: editor.isActive("bulletList"),
            color: editor.getAttributes("textStyle").color ?? "#292d32",
            highlight: editor.getAttributes("highlight").color ?? "#fef3c7",
            undo: editor.can().undo(),
            redo: editor.can().redo(),
            sink: editor.can().sinkListItem("listItem"),
            lift: editor.can().liftListItem("listItem"),
          }
        : null,
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);

  if (!editor || !state) return null;
  function exportNote() {
    const blob = new Blob(
      [`# ${task.title || "新任务"}\n\n${notesMarkdown(editor!.getJSON())}\n`],
      { type: "text/markdown;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(task.title || "任务笔记").replace(/[\\/:*?"<>|]/g, "-")}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="task-notes-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="task-notes-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="任务笔记"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            if (palette) setPalette(null);
            else onClose();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "k")
            event.stopPropagation();
          if (
            event.key === "Tab" &&
            !(event.target as HTMLElement).closest(".tiptap")
          ) {
            const elements = Array.from(
              dialogRef.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not([type="file"]), [contenteditable="true"]',
              ),
            );
            if (event.shiftKey && event.target === elements[0]) {
              event.preventDefault();
              elements.at(-1)?.focus();
            } else if (!event.shiftKey && event.target === elements.at(-1)) {
              event.preventDefault();
              elements[0]?.focus();
            }
          }
        }}
      >
        <header className="task-notes-header">
          <span>{task.project || "未分类"}</span>
          <div>
            <button
              className="icon-button"
              title="导出笔记"
              onClick={exportNote}
            >
              <Download size={17} />
            </button>
            <button className="icon-button" title="关闭笔记" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </header>
        <div
          className="task-notes-toolbar"
          role="toolbar"
          aria-label="笔记格式"
        >
          <div className="notes-tool-group">
            <button
              title="加粗"
              aria-label="加粗"
              aria-pressed={state.bold}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={17} />
            </button>
            <button
              title="斜体"
              aria-label="斜体"
              aria-pressed={state.italic}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={17} />
            </button>
            <button
              title="下划线"
              aria-label="下划线"
              aria-pressed={state.underline}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <Underline size={17} />
            </button>
            <button
              title="删除线"
              aria-label="删除线"
              aria-pressed={state.strike}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough size={17} />
            </button>
          </div>
          <div className="notes-tool-group notes-colors">
            <button
              title="文字颜色"
              aria-label="文字颜色"
              aria-expanded={palette === "text"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPalette(palette === "text" ? null : "text")}
            >
              <Type size={17} style={{ color: state.color }} />
              <ChevronDown size={10} />
            </button>
            <button
              title="文字背景色"
              aria-label="文字背景色"
              aria-expanded={palette === "background"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                setPalette(palette === "background" ? null : "background")
              }
            >
              <Highlighter size={17} />
              <span
                className="notes-color-preview"
                style={{ background: state.highlight }}
              />
              <ChevronDown size={10} />
            </button>
            {palette && (
              <div
                className="notes-palette"
                role="group"
                aria-label={
                  palette === "text" ? "选择文字颜色" : "选择文字背景色"
                }
              >
                {(palette === "text" ? colors : highlights).map((color) => (
                  <button
                    key={color}
                    title={color}
                    aria-label={`颜色 ${color}`}
                    className="notes-swatch"
                    style={{ backgroundColor: color }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (palette === "text")
                        editor.chain().focus().setColor(color).run();
                      else editor.chain().focus().setHighlight({ color }).run();
                      setPalette(null);
                    }}
                  />
                ))}
                <button
                  className="notes-reset-color"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (palette === "text")
                      editor.chain().focus().unsetColor().run();
                    else editor.chain().focus().unsetHighlight().run();
                    setPalette(null);
                  }}
                >
                  恢复默认
                </button>
              </div>
            )}
          </div>
          <div className="notes-tool-group">
            <button
              title="项目列表"
              aria-label="项目列表"
              aria-pressed={state.list}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={17} />
            </button>
            <button
              title="减少缩进（Shift+Tab）"
              aria-label="减少缩进"
              disabled={!state.lift}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                editor.chain().focus().liftListItem("listItem").run()
              }
            >
              <IndentDecrease size={17} />
            </button>
            <button
              title="增加缩进（Tab）"
              aria-label="增加缩进"
              disabled={!state.sink}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                editor.chain().focus().sinkListItem("listItem").run()
              }
            >
              <IndentIncrease size={17} />
            </button>
          </div>
          <div className="notes-tool-group">
            <button
              title="插入图片"
              aria-label="插入图片"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus size={18} />
            </button>
          </div>
          <div className="notes-tool-group">
            <button
              title="撤销"
              aria-label="撤销"
              disabled={!state.undo}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 size={17} />
            </button>
            <button
              title="重做"
              aria-label="重做"
              disabled={!state.redo}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 size={17} />
            </button>
          </div>
        </div>
        <div className="task-notes-scroll" onClick={() => setPalette(null)}>
          <div className="task-notes-page">
            <input
              className="task-notes-title"
              aria-label="笔记标题"
              placeholder="新任务"
              value={task.title}
              onChange={(event) =>
                onUpdate(task.id, { title: event.target.value })
              }
            />
            <EditorContent editor={editor} />
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length)
              void insertImages(editor, files).catch(() =>
                onError("图片插入失败，请重试"),
              );
            event.target.value = "";
          }}
        />
      </section>
    </div>
  );
}
