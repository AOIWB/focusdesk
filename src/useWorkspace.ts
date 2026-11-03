import { useRef, useState } from "react";
import { initialWorkspace, type Workspace } from "./model";
import { trackDeletions } from "./syncModel";
export default function useWorkspace() {
  const [workspace, render] = useState<Workspace>(initialWorkspace);
  const current = useRef(workspace),
    undoStack = useRef<Workspace[]>([]),
    redoStack = useRef<Workspace[]>([]),
    lastEdit = useRef(0);
  function setWorkspace(update: Workspace | ((value: Workspace) => Workspace)) {
    const before = current.current,
      after = typeof update === "function" ? update(before) : update;
    if (after === before) return;
    if (Date.now() - lastEdit.current > 800) {
      undoStack.current.push(before);
      undoStack.current = undoStack.current.slice(-30);
    }
    lastEdit.current = Date.now();
    redoStack.current = [];
    const value = trackDeletions(before, after);
    current.current = value;
    render(value);
  }
  function replaceWorkspace(value: Workspace) {
    current.current = value;
    render(value);
    undoStack.current = [];
    redoStack.current = [];
    lastEdit.current = 0;
  }
  function undo() {
    const value = undoStack.current.pop();
    if (!value) return;
    redoStack.current.push(current.current);
    current.current = trackDeletions(current.current, value);
    render(current.current);
    lastEdit.current = 0;
  }
  function redo() {
    const value = redoStack.current.pop();
    if (!value) return;
    undoStack.current.push(current.current);
    current.current = trackDeletions(current.current, value);
    render(current.current);
    lastEdit.current = 0;
  }
  return {
    workspace,
    current,
    setWorkspace,
    replaceWorkspace,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
