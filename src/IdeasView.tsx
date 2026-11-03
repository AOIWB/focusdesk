import { useGraphMotion } from "./graphMotion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, Scan, ChevronLeft, ChevronRight } from "lucide-react";
import type { Idea } from "./model";
import { dateKey, shiftPeriod } from "./calendar";
import { filterIdeas, ideaEdges, type IdeaPeriod } from "./ideas";
import "./Ideas.css";
export default function IdeasView({
  ideas,
  query,
  onCreate,
  onOpen,
}: {
  ideas: Idea[];
  query: string;
  onCreate: () => void;
  onOpen: (idea: Idea) => void;
}) {
  const [period, setPeriod] = useState<IdeaPeriod>("all");
  const [day, setDay] = useState(dateKey(new Date()));
  const [hover, setHover] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const smoothCamera = useGraphMotion(camera, panning);
  const [size, setSize] = useState({ width: 1000, height: 600 });
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(
    null,
  );
  const visible = useMemo(
    () => filterIdeas(ideas, period, day, query),
    [ideas, period, day, query],
  );
  const targets = useMemo(
    () =>
      visible.map((idea, i) => {
        const columns = Math.min(
          5,
          Math.max(1, Math.ceil(Math.sqrt(visible.length))),
        );
        const row = Math.floor(i / columns),
          col = row % 2 ? columns - 1 - (i % columns) : i % columns;
        return {
          ...idea,
          px: (col - (columns - 1) / 2) * 220 + Math.sin(i * 3.7) * 22,
          py:
            (row - (Math.ceil(visible.length / columns) - 1) / 2) * 155 +
            Math.cos(i * 2.3) * 28,
        };
      }),
    [visible],
  );
  const coordinates = useMemo(
    () =>
      Object.fromEntries(
        targets.flatMap((n) => [
          [n.id + ":x", n.px],
          [n.id + ":y", n.py],
        ]),
      ),
    [targets],
  );
  const points = useGraphMotion(coordinates);
  const nodes = targets.map((n) => ({
    ...n,
    px: points[n.id + ":x"] ?? n.px,
    py: points[n.id + ":y"] ?? n.py,
  }));
  const edges = ideaEdges(visible);
  function fit() {
    const width = Math.max(
        400,
        ...targets.map((n) => Math.abs(n.px) * 2 + 230),
      ),
      height = Math.max(260, ...targets.map((n) => Math.abs(n.py) * 2 + 120));
    setCamera({
      x: 0,
      y: 0,
      scale: Math.min(1.2, size.width / width, size.height / height),
    });
  }
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    fit();
  }, [period, day, query, visible.length, size.width, size.height]);
  useEffect(() => {
    const el = host.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setCamera((c) => ({
        ...c,
        scale: Math.min(
          2.5,
          Math.max(0.2, c.scale * Math.exp(-e.deltaY * 0.001)),
        ),
      }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  return (
    <section className="ideas-view" aria-label="灵感星图">
      <div className="ideas-toolbar">
        <div className="ideas-periods" role="group" aria-label="灵感时间筛选">
          {Object.entries({
            all: "全部",
            year: "年",
            month: "月",
            week: "周",
            day: "日",
          }).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={period === key}
              onClick={() => setPeriod(key as IdeaPeriod)}
            >
              {label}
            </button>
          ))}
        </div>
        {period !== "all" && (
          <div className="ideas-date">
            <button
              className="icon-button"
              aria-label="上一段灵感"
              onClick={() => setDay(shiftPeriod(day, period, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <input
              aria-label="灵感筛选日期"
              type="date"
              value={day}
              onChange={(e) => {
                if (e.target.value) setDay(e.target.value);
              }}
            />
            <button
              className="icon-button"
              aria-label="下一段灵感"
              onClick={() => setDay(shiftPeriod(day, period, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <button className="ideas-add" onClick={onCreate}>
          <Plus size={16} />
          记录灵感
        </button>
      </div>
      <div ref={host} className="ideas-canvas">
        {!visible.length && (
          <div className="ideas-empty">
            {ideas.length
              ? "这个时段还没有灵感"
              : "记下一颗灵感，让想法慢慢连接。"}
            <button onClick={onCreate}>记录灵感</button>
          </div>
        )}
        <svg
          width="100%"
          height="100%"
          aria-label="按创建顺序连接的灵感"
          onPointerDown={(e) => {
            if ((e.target as Element).closest("[data-idea]")) return;
            setPanning(true);
            setCamera(smoothCamera);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              cx: smoothCamera.x,
              cy: smoothCamera.y,
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
            setPanning(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setPanning(false);
          }}
        >
          <defs>
            <marker
              id="idea-arrow"
              viewBox="0 0 10 10"
              refX="14"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="#a8b2be" />
            </marker>
          </defs>
          <g
            transform={`translate(${size.width / 2 + smoothCamera.x},${size.height / 2 + smoothCamera.y}) scale(${smoothCamera.scale})`}
          >
            {edges.map((e) => {
              const a = nodes.find((n) => n.id === e.source)!,
                b = nodes.find((n) => n.id === e.target)!;
              return (
                <line
                  key={e.target}
                  x1={a.px}
                  y1={a.py}
                  x2={b.px}
                  y2={b.py}
                  stroke={
                    hover === a.id || hover === b.id ? "#8c9aaf" : "#dce1e8"
                  }
                  strokeWidth="1"
                  markerEnd="url(#idea-arrow)"
                />
              );
            })}
            {nodes.map((n) => (
              <g
                key={n.id}
                data-idea="true"
                transform={`translate(${n.px},${n.py})`}
                className={`idea-node ${hover === n.id ? "active" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`灵感：${n.title}`}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                onClick={() => onOpen(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(n);
                  }
                }}
              >
                <title>{n.title}</title>
                <rect
                  className="idea-hit"
                  x="-102"
                  y="-22"
                  width="204"
                  height="98"
                  rx="12"
                />
                <circle className="idea-halo" r="17" />
                <path
                  className="idea-spark"
                  d="M0,-10 Q2,-2 10,0 Q2,2 0,10 Q-2,2 -10,0 Q-2,-2 0,-10Z"
                />
                <circle className="idea-core" r="2.5" />
                <text className="idea-label" y="35" textAnchor="middle">
                  {Array.from(n.title).length > 14
                    ? Array.from(n.title).slice(0, 14).join("") + "…"
                    : n.title}
                </text>
                <text className="idea-date-label" y="57" textAnchor="middle">
                  {new Date(n.createdAt).toLocaleDateString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </text>
              </g>
            ))}
          </g>
        </svg>
        <div className="ideas-zoom">
          <button
            className="icon-button"
            aria-label="缩小星图"
            onClick={() =>
              setCamera((c) => ({ ...c, scale: Math.max(0.2, c.scale / 1.2) }))
            }
          >
            <Minus size={16} />
          </button>
          <span>{Math.round(camera.scale * 100)}%</span>
          <button
            className="icon-button"
            aria-label="放大星图"
            onClick={() =>
              setCamera((c) => ({ ...c, scale: Math.min(2.5, c.scale * 1.2) }))
            }
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="星图适应窗口"
            onClick={fit}
          >
            <Scan size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
