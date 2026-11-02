import { useState } from "react";
import { Trash2, X } from "lucide-react";
export default function ProjectEditor({
  original,
  names,
  onSave,
  onDelete,
  onClose,
}: {
  original: string;
  names: string[];
  onSave: (name: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(original),
    [error, setError] = useState("");
  function save() {
    const value = name.trim();
    if (!value) {
      setError("请输入项目名称");
      return;
    }
    if (value !== original && names.includes(value)) {
      setError("项目名称已存在");
      return;
    }
    onSave(value);
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal project-editor"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
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
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {original ? (
            <button type="button" className="delete-project" onClick={onDelete}>
              <Trash2 size={15} />
              删除项目
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="primary-button">
            保存项目
          </button>
        </div>
      </form>
    </div>
  );
}
