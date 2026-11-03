import { AnimatePresence, motion } from "motion/react";
import { ease } from "./Motion";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Minus, Plus, Scan } from "lucide-react";
import type { TaskNotes } from "./notes";
import { notesText } from "./notes";
import { noteBranches, layoutMindmap } from "./mindmapLayout";
function Rich({ node }: { node: TaskNotes }) {
  if (node.type === "image")
    return <img src={node.attrs?.src} alt={node.attrs?.alt || "笔记图片"} />;
  if (node.type === "hardBreak") return <br />;
  if (node.type === "text") {
    const style: CSSProperties = {};
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") style.fontWeight = 650;
      if (mark.type === "italic") style.fontStyle = "italic";
      if (mark.type === "underline")
        style.textDecoration = `${style.textDecoration ?? ""} underline`;
      if (mark.type === "strike")
        style.textDecoration = `${style.textDecoration ?? ""} line-through`;
      if (mark.type === "textStyle") style.color = mark.attrs?.color;
      if (mark.type === "highlight") style.backgroundColor = mark.attrs?.color;
    }
    return <span style={style}>{node.text}</span>;
  }
  return (
    <div>
      {node.content?.map((c, i) => (
        <Rich key={i} node={c} />
      ))}
    </div>
  );
}
export default function MindMap({
  title,
  notes,
  onEdit,
  onFold,
}: {
  title: string;
  notes: TaskNotes;
  onEdit: (pos: number) => void;
  onFold: (pos: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 960, height: 600 });
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(
    null,
  );
  const nodes = useMemo(() => layoutMindmap(noteBranches(notes)), [notes]);
  const bounds = useMemo(
    () => ({
      width: Math.max(360, ...nodes.map((n) => Math.abs(n.x) + 95)) * 2 + 80,
      height:
        Math.max(100, ...nodes.map((n) => Math.abs(n.y) + n.height / 2)) * 2 +
        80,
    }),
    [nodes],
  );
  function fit() {
    setCamera({
      x: 0,
      y: 0,
      scale: Math.min(
        1.15,
        viewport.width / bounds.width,
        viewport.height / bounds.height,
      ),
    });
  }
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setViewport({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    fit();
  }, [viewport.width, viewport.height]);
  useEffect(() => {
    const el = host.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setCamera((c) => ({
        ...c,
        scale: Math.min(
          2,
          Math.max(0.15, c.scale * Math.exp(-e.deltaY * 0.001)),
        ),
      }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  return (
    <div ref={host} className="mindmap" aria-label="思维导图">
      <div className="mindmap-controls">
        <button
          className="icon-button"
          aria-label="缩小导图"
          onClick={() =>
            setCamera((c) => ({ ...c, scale: Math.max(0.15, c.scale / 1.2) }))
          }
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(camera.scale * 100)}%</span>
        <button
          className="icon-button"
          aria-label="放大导图"
          onClick={() =>
            setCamera((c) => ({ ...c, scale: Math.min(2, c.scale * 1.2) }))
          }
        >
          <Plus size={16} />
        </button>
        <button className="icon-button" aria-label="导图适应窗口" onClick={fit}>
          <Scan size={16} />
        </button>
      </div>
      <svg
        width="100%"
        height="100%"
        role="group"
        aria-label="笔记分支"
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-map-node]")) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            cx: camera.x,
            cy: camera.y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d)
            setCamera((c) => ({
              ...c,
              x: d.cx + e.clientX - d.x,
              y: d.cy + e.clientY - d.y,
            }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <g
          transform={`translate(${viewport.width / 2 + camera.x},${viewport.height / 2 + camera.y}) scale(${camera.scale})`}
        >
          {nodes.map((n) => {
            const p = nodes.find((p) => p.id === n.parent);
            const x1 = p ? p.x + n.side * 90 : n.side * 115,
              y1 = p ? p.y : 0,
              x2 = n.x - n.side * 90;
            return (
              <motion.path
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  d: `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${n.y} ${x2},${n.y}`,
                }}
                transition={{ duration: 0.24, ease }}
                key={n.id}
                d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${n.y} ${x2},${n.y}`}
                fill="none"
                stroke="#ccd2da"
                strokeWidth="1.5"
              />
            );
          })}
          <foreignObject x="-115" y="-40" width="230" height="80">
            <div className="mindmap-root">{title || "任务笔记"}</div>
          </foreignObject>
          <AnimatePresence initial={false}>
            {nodes.map((n) => (
              <motion.g
                key={n.id}
                data-map-node="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: n.x, y: n.y }}
                exit={{ opacity: 0, pointerEvents: "none" }}
                transition={{ duration: 0.24, ease }}
              >
                <foreignObject
                  x={-90}
                  y={-n.height / 2}
                  width="180"
                  height={n.height}
                >
                  <button
                    className="mindmap-node"
                    aria-label={`编辑笔记：${n.content.map(notesText).join(" ") || "空白条目"}`}
                    onClick={() => onEdit(n.pos)}
                  >
                    {n.content.map((c, i) => (
                      <Rich key={i} node={c} />
                    ))}
                  </button>
                </foreignObject>
                {!!n.children.length && (
                  <foreignObject
                    x={n.side * 102 - 12}
                    y={-12}
                    width="24"
                    height="24"
                  >
                    <button
                      className="mindmap-fold"
                      aria-label={`${n.collapsed ? "展开" : "折叠"}分支：${n.content.map(notesText).join(" ")}`}
                      onClick={() => onFold(n.pos)}
                    >
                      {n.collapsed ? "+" : "−"}
                    </button>
                  </foreignObject>
                )}
              </motion.g>
            ))}
          </AnimatePresence>
        </g>
      </svg>
    </div>
  );
}
