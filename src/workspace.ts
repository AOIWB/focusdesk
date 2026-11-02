import {
  type Workspace,
  type Task,
  type TaskLink,
  type Quadrant,
  outlineGroups,
} from "./model";
export function projectNames(workspace: Workspace) {
  return [
    ...new Set(
      [...workspace.projects, ...workspace.tasks.map((t) => t.project)].filter(
        Boolean,
      ),
    ),
  ];
}
export function normalizeWorkspace(data: Workspace): Workspace {
  const workspace = {
    ...data,
    projects: data.projects ?? [],
    links: data.links ?? [],
    manualQuadrants: data.manualQuadrants ?? [],
  };
  return { ...workspace, projects: projectNames(workspace) };
}
export function renameProject(
  workspace: Workspace,
  from: string,
  to: string,
): Workspace {
  return {
    ...workspace,
    projects: projectNames(workspace).map((p) => (p === from ? to : p)),
    tasks: workspace.tasks.map((t) =>
      t.project === from ? { ...t, project: to } : t,
    ),
  };
}
export function deleteProject(workspace: Workspace, name: string): Workspace {
  return {
    ...workspace,
    projects: projectNames(workspace).filter((p) => p !== name),
    tasks: workspace.tasks.map((t) =>
      t.project === name ? { ...t, project: "" } : t,
    ),
  };
}
export function graphLinks(
  workspace: Workspace,
): (TaskLink & { automatic: boolean })[] {
  const result: (TaskLink & { automatic: boolean })[] = [];
  for (const quadrant of [0, 1, 2, 3] as Quadrant[]) {
    const tasks = workspace.tasks.filter(
      (t) => !t.done && t.quadrant === quadrant,
    );
    const ids = new Set(tasks.map((t) => t.id));
    if (workspace.manualQuadrants.includes(quadrant)) {
      result.push(
        ...workspace.links
          .filter((l) => ids.has(l.source) && ids.has(l.target))
          .map((l) => ({ ...l, automatic: false })),
      );
    } else {
      const sorted = [...tasks].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      for (let i = 1; i < sorted.length; i++)
        result.push({
          id: `auto:${sorted[i - 1].id}:${sorted[i].id}`,
          source: sorted[i - 1].id,
          target: sorted[i].id,
          automatic: true,
        });
    }
  }
  return result;
}
export function useManualLinks(
  workspace: Workspace,
  quadrant: Quadrant,
): Workspace {
  if (workspace.manualQuadrants.includes(quadrant)) return workspace;
  const ids = new Set(
    workspace.tasks.filter((t) => t.quadrant === quadrant).map((t) => t.id),
  );
  const links = graphLinks(workspace)
    .filter((l) => ids.has(l.source) && ids.has(l.target))
    .map((l) => ({
      id: crypto.randomUUID(),
      source: l.source,
      target: l.target,
    }));
  return {
    ...workspace,
    manualQuadrants: [...workspace.manualQuadrants, quadrant],
    links: [
      ...workspace.links.filter(
        (l) => !ids.has(l.source) || !ids.has(l.target),
      ),
      ...links,
    ],
  };
}
export function connectTasks(
  workspace: Workspace,
  source: string,
  target: string,
): Workspace {
  const a = workspace.tasks.find((t) => t.id === source),
    b = workspace.tasks.find((t) => t.id === target);
  if (
    !a ||
    !b ||
    a.done ||
    b.done ||
    a.quadrant !== b.quadrant ||
    source === target
  )
    return workspace;
  const next = useManualLinks(workspace, a.quadrant);
  if (next.links.some((l) => l.source === source && l.target === target))
    return next;
  return {
    ...next,
    links: [...next.links, { id: crypto.randomUUID(), source, target }],
  };
}
export function disconnectTasks(
  workspace: Workspace,
  source: string,
  target: string,
): Workspace {
  const task = workspace.tasks.find((t) => t.id === source);
  if (!task) return workspace;
  const next = useManualLinks(workspace, task.quadrant);
  return {
    ...next,
    links: next.links.filter((l) => l.source !== source || l.target !== target),
  };
}
export function resetLinks(
  workspace: Workspace,
  quadrant: Quadrant,
): Workspace {
  const ids = new Set(
    workspace.tasks.filter((t) => t.quadrant === quadrant).map((t) => t.id),
  );
  return {
    ...workspace,
    manualQuadrants: workspace.manualQuadrants.filter((q) => q !== quadrant),
    links: workspace.links.filter(
      (l) => !ids.has(l.source) || !ids.has(l.target),
    ),
  };
}
export function changeTask(
  workspace: Workspace,
  id: string,
  change: Partial<Task>,
): Workspace {
  const current = workspace.tasks.find((t) => t.id === id);
  const moved =
    current &&
    change.quadrant !== undefined &&
    current.quadrant !== change.quadrant;
  return {
    ...workspace,
    tasks: workspace.tasks.map((t) => (t.id === id ? { ...t, ...change } : t)),
    links: moved
      ? workspace.links.filter((l) => l.source !== id && l.target !== id)
      : workspace.links,
  };
}
export function taskSearchText(task: Task) {
  return [
    task.title,
    task.description,
    task.project,
    task.folder,
    task.due,
    task.createdAt,
    task.done ? "已完成" : "待办",
    outlineGroups.find((g) => g.quadrant === task.quadrant)?.title,
  ].join("\n");
}
export function matchesSearch(text: string, query: string) {
  const normalized = text.toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => normalized.includes(word));
}
export function searchWorkspace(workspace: Workspace, query: string) {
  if (!query.trim()) return { tasks: [], projects: [] };
  return {
    tasks: workspace.tasks.filter((t) =>
      matchesSearch(taskSearchText(t), query),
    ),
    projects: projectNames(workspace).filter((p) => matchesSearch(p, query)),
  };
}
export function mergeWorkspace(
  workspace: Workspace,
  incoming: Workspace,
): Workspace {
  const data = normalizeWorkspace(incoming);
  const tasks = [
    ...workspace.tasks,
    ...data.tasks.filter(
      (t) => !workspace.tasks.some((old) => old.id === t.id),
    ),
  ];
  const ids = new Set(tasks.map((t) => t.id));
  return normalizeWorkspace({
    ...workspace,
    tasks,
    projects: [...workspace.projects, ...data.projects],
    manualQuadrants: [
      ...new Set([...workspace.manualQuadrants, ...data.manualQuadrants]),
    ],
    links: [
      ...workspace.links,
      ...data.links.filter(
        (l) =>
          ids.has(l.source) &&
          ids.has(l.target) &&
          !workspace.links.some(
            (old) => old.source === l.source && old.target === l.target,
          ),
      ),
    ],
  });
}

export function removeTask(workspace: Workspace, id: string): Workspace {
  return {
    ...workspace,
    tasks: workspace.tasks.filter((t) => t.id !== id),
    links: workspace.links.filter((l) => l.source !== id && l.target !== id),
  };
}
