import { useState } from "react";
import FolderLinks from "./FolderLinks";
import { Archive, Trash2, X } from "lucide-react";
export default function ProjectEditor({
  original,
  names,
  onSave,
  onDelete,
  onClose,
  folders,
  onFolders,
  onError,
  onArchive,
}: {
  original: string;
  names: string[];
  onSave: (name: string) => Promise<void>;
  folders: string[];
  onFolders: (folders: string[]) => void;
  onError: (message: string) => void;
  onArchive: () => void;
  onDelete: (contents: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(original),
    [error, setError] = useState("");
  const [contents, setContents] = useState(false),
    [busy, setBusy] = useState(false);
  async function save() {
    const value = name.trim();
    if (!value) {
      setError("请输入项目名称");
      return;
    }
    if (value !== original && names.includes(value)) {
      setError("项目名称已存在");
      return;
    }
    setBusy(true);
    try {
      await onSave(value);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal project-editor"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="modal-title">
          <h2>{original ? "编辑项目" : "新建项目"}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭项目设置"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <label className="field-label">
          项目名称
          <input
            autoFocus
            value={name}
            aria-label="项目名称"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {original && (
          <>
            <FolderLinks
              paths={folders}
              onChange={onFolders}
              onError={onError}
            />
            <button
              type="button"
              className="task-schedule-button"
              onClick={onArchive}
            >
              <Archive size={15} />
              归档项目
            </button>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={contents}
                onChange={(e) => setContents(e.target.checked)}
              />
              删除项目时，同时将任务和日程移入回收站
            </label>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {original ? (
            <button
              type="button"
              className="delete-project"
              onClick={() => onDelete(contents)}
            >
              <Trash2 size={15} />
              删除项目
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={busy} className="primary-button">
            保存项目
          </button>
        </div>
      </form>
    </div>
  );
}
