import { useState } from "react";
import { mergeDocuments, type SyncConflict } from "./syncModel";
import type { SyncPlan } from "./sync";
function preview(value: unknown) {
  if (value === undefined) return "已删除";
  if (typeof value === "string") return value;
  const text = JSON.stringify(value, null, 2);
  return text.replace(/data:image\/[^"\s]+/g, "[图片]");
}
export default function SyncReview({
  plan,
  onConfirm,
  onClose,
  busy,
}: {
  plan: SyncPlan;
  onConfirm: (choices: Record<string, "local" | "remote">) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [choices, setChoices] = useState<Record<string, "local" | "remote">>(
    {},
  );
  const conflicts = mergeDocuments(
    plan.base,
    plan.local,
    plan.remote,
  ).conflicts;
  const count = (doc: SyncPlan["local"], kind: string) =>
    Object.keys(doc.records).filter((k) => k.startsWith(kind + ":")).length;
  const field = (c: SyncConflict) =>
    ({
      notes: "笔记",
      title: "名称",
      description: "说明",
      start: "开始时间",
      end: "结束时间",
      $record: "删除与修改",
    })[c.field] || c.field;
  return (
    <div className="modal-backdrop">
      <section
        className="sync-review"
        role="dialog"
        aria-modal="true"
        aria-label="确认同步"
      >
        <h2>{plan.first ? "首次同步" : "处理同步冲突"}</h2>
        <p>
          本地：{count(plan.local, "task")} 个任务、{count(plan.local, "event")}{" "}
          项日程、{count(plan.local, "idea")} 条灵感 · 云端：
          {count(plan.remote, "task")} 个任务、
          {count(plan.remote, "event")} 项日程、{count(plan.remote, "idea")}{" "}
          条灵感
        </p>
        {conflicts.length ? (
          <>
            <p>
              以下内容双方都已修改，请选择保留版本。同步前会保存本地备份和冲突记录。
            </p>
            {conflicts.map((c) => (
              <div className="sync-conflict" key={`${c.key}/${c.field}`}>
                <h3>
                  {c.title} · {field(c)}
                </h3>
                <div>
                  {(["local", "remote"] as const).map((side) => (
                    <label key={side}>
                      <input
                        type="radio"
                        name={`${c.key}/${c.field}`}
                        checked={choices[`${c.key}/${c.field}`] === side}
                        onChange={() =>
                          setChoices({
                            ...choices,
                            [`${c.key}/${c.field}`]: side,
                          })
                        }
                      />
                      {side === "local" ? "保留本地" : "保留云端"}
                      <pre>{preview(c[side])}</pre>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <p>合并两端内容后同步。API Key、令牌和本地文件夹路径不会上传。</p>
        )}
        <div className="settings-actions">
          <button disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            disabled={
              busy || conflicts.some((c) => !choices[`${c.key}/${c.field}`])
            }
            className="primary-button"
            onClick={() => onConfirm(choices)}
          >
            {busy ? "同步中…" : "合并并同步"}
          </button>
        </div>
      </section>
    </div>
  );
}
