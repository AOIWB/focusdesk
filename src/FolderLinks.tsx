import { useState } from "react";
import { FolderOpen, Plus, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
export const folderPaths = (value: { folder?: string; folders?: string[] }) => [
  ...new Set([...(value.folders ?? []), value.folder ?? ""].filter(Boolean)),
];
export default function FolderLinks({
  paths,
  readOnly = false,
  inherited = [],
  onChange,
  onError,
}: {
  paths: string[];
  readOnly?: boolean;
  inherited?: string[];
  onChange: (paths: string[]) => void;
  onError: (text: string) => void;
}) {
  const [path, setPath] = useState("");
  const add = (items: string[]) =>
    onChange([...new Set([...paths, ...items.filter(Boolean)])]);
  async function choose() {
    if (!isTauri()) {
      onError("网页中可填写路径；选择和打开目录请使用桌面版");
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: true,
        title: "关联文件夹",
      });
      if (selected) add(Array.isArray(selected) ? selected : [selected]);
    } catch (e) {
      onError(String(e));
    }
  }
  async function launch(value: string) {
    if (!isTauri()) {
      onError("打开本地文件夹请使用桌面版");
      return;
    }
    try {
      await openPath(value);
    } catch (e) {
      onError(`打开失败：${String(e)}`);
    }
  }
  return (
    <section className="folder-links" aria-label="关联文件夹">
      <div className="folder-links-title">
        <span>关联文件夹</span>
        {!readOnly && (
          <button type="button" onClick={() => void choose()}>
            <Plus size={14} />
            添加
          </button>
        )}
      </div>
      {[...new Set([...inherited, ...paths])].map((value) => (
        <div className="folder-link" key={value}>
          <button
            type="button"
            title={value}
            onClick={() => void launch(value)}
          >
            <FolderOpen size={14} />
            <span>{value}</span>
            {inherited.includes(value) && <small>项目</small>}
          </button>
          {paths.includes(value) && (
            <button
              type="button"
              className="icon-button"
              aria-label={`移除关联 ${value}`}
              onClick={() => onChange(paths.filter((p) => p !== value))}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="folder-path-entry">
          <input
            aria-label="添加文件夹路径"
            placeholder="添加路径"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (path.trim()) {
                  add([path.trim()]);
                  setPath("");
                }
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (path.trim()) {
                add([path.trim()]);
                setPath("");
              }
            }}
            aria-label="添加路径"
            disabled={!path.trim()}
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
