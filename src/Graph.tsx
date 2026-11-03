import { motion } from "motion/react";
import { ease } from "./Motion";
import { useState } from "react";
import { ArrowRight, Link2, X } from "lucide-react";
import {
  type Task,
  type Workspace,
  type TaskLink,
  nodeDiameter,
} from "./model";
import { graphLinks } from "./workspace";
type Position = (task: Task) => { x: number; y: number };
export function TaskGraph({
  workspace,
  visible,
  position,
  width,
  height,
  selected,
}: {
  workspace: Workspace;
  visible: Task[];
  position: Position;
  width: number;
  height: number;
  selected: string | null;
}) {
  const nodes = new Map(visible.map((t) => [t.id, t]));
  return (
    <svg
      className="task-graph"
      width={width}
      height={height}
      aria-label="任务关系图"
    >
      <defs>
        {[0, 1, 2, 3].map((i) => (
          <clipPath id={`quadrant-clip-${i}`} key={`clip-${i}`}>
            <rect
              x={((1 - (i % 2)) * width) / 2}
              y={(Math.floor(i / 2) * height) / 2}
              width={width / 2}
              height={height / 2}
            />
          </clipPath>
        ))}
        <marker
          id="link-arrow-active"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path
            d="M 1 1 L 9 5 L 1 9"
            fill="none"
            stroke="#6687c6"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      {graphLinks(workspace).map((link) => {
        const a = nodes.get(link.source),
          b = nodes.get(link.target);
        if (!a || !b) return null;
        const start = position(a),
          end = position(b),
          dx = end.x - start.x,
          dy = end.y - start.y,
          distance = Math.hypot(dx, dy);
        const ux = distance > 0 ? dx / distance : 1,
          uy = distance > 0 ? dy / distance : 0;
        const aSize = nodeDiameter(a.size),
          bSize = nodeDiameter(b.size);
        const highlighted = selected === a.id || selected === b.id;
        const overlap = distance < aSize / 2 + bSize / 2 + 15;
        const bend = Math.max(aSize, bSize) * 0.9;
        const curved = `M ${start.x - (uy * aSize) / 2} ${start.y + (ux * aSize) / 2} C ${start.x - uy * bend} ${start.y + ux * bend}, ${end.x - uy * bend} ${end.y + ux * bend}, ${end.x - uy * (bSize / 2 + 7)} ${end.y + ux * (bSize / 2 + 7)}`;
        const x1 = start.x + ux * (aSize / 2 + 4),
          y1 = start.y + uy * (aSize / 2 + 4),
          x2 = end.x - ux * (bSize / 2 + 7),
          y2 = end.y - uy * (bSize / 2 + 7);
        return (
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.32, ease }}
            key={link.id}
            clipPath={`url(#quadrant-clip-${a.quadrant})`}
            data-source={a.id}
            data-target={b.id}
            className={`graph-edge ${link.automatic ? "automatic" : "manual"} ${highlighted ? "highlighted" : selected ? "muted" : ""}`}
            d={overlap ? curved : `M ${x1} ${y1} L ${x2} ${y2}`}
            markerEnd={highlighted ? "url(#link-arrow-active)" : undefined}
          >
            <title>
              {a.title} → {b.title}
              {link.automatic ? "（创建顺序）" : "（手动）"}
            </title>
          </motion.path>
        );
      })}
    </svg>
  );
}
export function TaskConnections({
  task,
  workspace,
  onConnect,
  onDisconnect,
  onNavigate,
}: {
  task: Task;
  workspace: Workspace;
  onConnect: (a: string, b: string) => void;
  onDisconnect: (a: string, b: string) => void;
  onNavigate: (id: string) => void;
}) {
  const [target, setTarget] = useState("");
  const candidates = workspace.tasks.filter(
    (t) => t.id !== task.id && t.quadrant === task.quadrant && !t.done,
  );
  const links = graphLinks(workspace).filter(
    (l) => l.source === task.id || l.target === task.id,
  );
  function label(link: TaskLink) {
    return (
      workspace.tasks.find(
        (t) => t.id === (link.source === task.id ? link.target : link.source),
      )?.title || "新任务"
    );
  }
  return (
    <div className="connections-panel">
      <div className="connections-title">
        <Link2 size={14} />
        <span>任务连接</span>
      </div>
      {links.map((link) => (
        <div className="connection-row" key={link.id}>
          <ArrowRight
            size={12}
            style={{
              transform: link.source === task.id ? undefined : "rotate(180deg)",
            }}
          />
          <button
            className="connection-name"
            onClick={() =>
              onNavigate(link.source === task.id ? link.target : link.source)
            }
          >
            {label(link)}
          </button>
          <button
            className="icon-button"
            title={`断开与${label(link)}的连接`}
            onClick={() => onDisconnect(link.source, link.target)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <div className="connection-add">
        <select
          aria-label="连接到任务"
          value={candidates.some((t) => t.id === target) ? target : ""}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">选择同象限任务</option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title || "新任务"}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          title="添加连接"
          disabled={!candidates.some((t) => t.id === target)}
          onClick={() => {
            onConnect(task.id, target);
            setTarget("");
          }}
        >
          <Link2 size={16} />
        </button>
      </div>
    </div>
  );
}
