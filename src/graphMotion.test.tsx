// @vitest-environment happy-dom
import { act, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { approach, useGraphMotion } from "./graphMotion";
import IdeasView from "./IdeasView";
import { makeIdea } from "./model";

it("图谱缓动按实际帧间隔前进，改变目标时从当前帧连续转向", () => {
  const frame = approach(0, 100, 16);
  expect(frame).toBeGreaterThan(0);
  expect(frame).toBeLessThan(100);
  expect(approach(frame, 100, 16)).toBeCloseTo(approach(0, 100, 32));
  expect(approach(frame, -100, 1)).toBeLessThan(frame);
  expect(approach(frame, -100, 1)).toBeGreaterThan(0);
  expect(approach(frame, 100, 1000)).toBe(100);
});

it("拖动直接跟随；松手后继续缩放从最后拖动位置开始", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  let value = { x: 0 };
  function Probe({ x, immediate = false }: { x: number; immediate?: boolean }) {
    value = useGraphMotion(
      useMemo(() => ({ x }), [x]),
      immediate,
    );
    return null;
  }
  await act(async () => root.render(<Probe x={0} />));
  await act(async () => root.render(<Probe x={80} immediate />));
  expect(value.x).toBe(80);
  await act(async () => root.render(<Probe x={100} />));
  expect(value.x).toBeGreaterThanOrEqual(80);
  expect(value.x).toBeLessThanOrEqual(100);
  await act(async () => root.unmount());
});

it("反复进入和移出灵感时保留同一星点、命中区域与连线，并可打开笔记", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const open = vi.fn();
  const ideas = [makeIdea("第一颗灵感"), makeIdea("第二颗灵感")];
  await act(async () =>
    root.render(
      <IdeasView ideas={ideas} query="" onCreate={() => {}} onOpen={open} />,
    ),
  );
  const node = host.querySelector<SVGGElement>(".idea-node")!;
  const spark = node.querySelector(".idea-spark");
  const hit = node.querySelector(".idea-hit");
  const edge = host.querySelector("line");
  const transform = node.getAttribute("transform");
  for (let i = 0; i < 8; i++) {
    await act(async () =>
      node.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })),
    );
    expect(node.classList.contains("active")).toBe(true);
    expect(node.querySelector(".idea-spark")).toBe(spark);
    expect(node.querySelector(".idea-hit")).toBe(hit);
    expect(host.querySelector("line")).toBe(edge);
    expect(node.getAttribute("transform")).toBe(transform);
    await act(async () =>
      node.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })),
    );
    expect(node.classList.contains("active")).toBe(false);
  }
  await act(async () =>
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({ id: ideas[0].id }),
  );
  await act(async () => root.unmount());
  host.remove();
});
