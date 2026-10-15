import { randomUUID } from "@/lib/random-id";
import type {
  FactoryProject,
  PlanTask,
  PlanTaskComment,
  PlanTaskItem,
  PlanTaskStatus,
} from "@/lib/model/types";
import { PLAN_TASK_LIMITS } from "@/lib/model/schemas";
import { byOrder, orderBetween } from "./order-key";

/**
 * The task board's edits, pure: each takes the plan and gives the plan after
 * it, or the same object when nothing changed. Tasks, checklist lines and
 * comments are things of their own (`tasks`, `taskItems`, `taskComments`),
 * so two people ticking two lines, or moving two cards, change different
 * things. A move writes one order key (order-key.ts).
 */

export const TASK_STATUSES: readonly PlanTaskStatus[] = ["todo", "doing", "blocked", "done"];

export const TASK_STATUS_LABEL: Record<PlanTaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  blocked: "Blocked",
  done: "Done",
};

export interface TaskAuthor {
  id: string;
  username: string;
}

function tasksOf(project: FactoryProject): PlanTask[] {
  return project.tasks ?? [];
}

function itemsOf(project: FactoryProject): PlanTaskItem[] {
  return project.taskItems ?? [];
}

function commentsOf(project: FactoryProject): PlanTaskComment[] {
  return project.taskComments ?? [];
}

/** A column's tasks, top to bottom. */
export function tasksIn(project: FactoryProject, status: PlanTaskStatus): PlanTask[] {
  return byOrder(tasksOf(project).filter((task) => task.status === status));
}

/** A task's checklist, top to bottom. */
export function itemsOfTask(project: FactoryProject, taskId: string): PlanTaskItem[] {
  return byOrder(itemsOf(project).filter((item) => item.taskId === taskId));
}

/** A task's comments, oldest first. */
export function commentsOfTask(project: FactoryProject, taskId: string): PlanTaskComment[] {
  return commentsOf(project)
    .filter((comment) => comment.taskId === taskId)
    .sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0));
}

export function clipTitle(title: string): string {
  return title.trim().slice(0, PLAN_TASK_LIMITS.titleLength);
}

/** A new task at the bottom of its column. Returns the plan and the task's id. */
export function addTask(
  project: FactoryProject,
  input: { title: string; status?: PlanTaskStatus; author?: TaskAuthor },
  now = new Date().toISOString(),
): { project: FactoryProject; id: string } {
  const title = clipTitle(input.title);
  const id = randomUUID();
  if (!title) {
    return { project, id };
  }
  const status = input.status ?? "todo";
  const column = tasksIn(project, status);
  const task: PlanTask = {
    id,
    title,
    status,
    order: orderBetween(column.at(-1)?.order),
    createdAt: now,
    ...(input.author ? { createdBy: input.author.id } : {}),
    ...(status === "done" ? { doneAt: now } : {}),
  };
  return { project: { ...project, tasks: [...tasksOf(project), task] }, id };
}

type TaskPatch = Partial<Pick<PlanTask, "title" | "text" | "assignees" | "nodeIds">>;

/** Sets fields of one task; an empty text, assignee list or card list is removed. */
export function updateTask(project: FactoryProject, id: string, patch: TaskPatch): FactoryProject {
  let changed = false;
  const tasks = tasksOf(project).map((task) => {
    if (task.id !== id) {
      return task;
    }
    const next: PlanTask = { ...task };
    if (patch.title !== undefined) {
      const title = clipTitle(patch.title);
      if (title && title !== task.title) {
        next.title = title;
        changed = true;
      }
    }
    if (patch.text !== undefined) {
      const text = patch.text.slice(0, PLAN_TASK_LIMITS.textLength);
      if ((text || undefined) !== task.text) {
        if (text) {
          next.text = text;
        } else {
          delete next.text;
        }
        changed = true;
      }
    }
    for (const key of ["assignees", "nodeIds"] as const) {
      const list = patch[key];
      if (list === undefined) {
        continue;
      }
      const unique = [...new Set(list)];
      const before = task[key] ?? [];
      if (unique.length !== before.length || unique.some((value, at) => value !== before[at])) {
        if (unique.length > 0) {
          next[key] = unique;
        } else {
          delete next[key];
        }
        changed = true;
      }
    }
    return next;
  });
  return changed ? { ...project, tasks } : project;
}

/**
 * Moves a task into `status` at `index` among that column's other tasks
 * (the end when out of range). Moving into Done stamps `doneAt`; out of it
 * clears it.
 */
export function moveTask(
  project: FactoryProject,
  id: string,
  status: PlanTaskStatus,
  index: number,
  now = new Date().toISOString(),
): FactoryProject {
  const task = tasksOf(project).find((entry) => entry.id === id);
  if (!task) {
    return project;
  }
  const column = tasksIn(project, status).filter((entry) => entry.id !== id);
  const at = Math.max(0, Math.min(index, column.length));
  const before = column[at - 1];
  const after = column[at];
  // Already there: nothing to write.
  if (
    task.status === status &&
    tasksIn(project, status).findIndex((entry) => entry.id === id) === at
  ) {
    return project;
  }
  const next: PlanTask = { ...task, status, order: orderBetween(before?.order, after?.order) };
  if (status === "done" && task.status !== "done") {
    next.doneAt = now;
  } else if (status !== "done") {
    delete next.doneAt;
  }
  return {
    ...project,
    tasks: tasksOf(project).map((entry) => (entry.id === id ? next : entry)),
  };
}

/** Removes a task with its checklist and comments. */
export function deleteTask(project: FactoryProject, id: string): FactoryProject {
  if (!tasksOf(project).some((task) => task.id === id)) {
    return project;
  }
  const next: FactoryProject = {
    ...project,
    tasks: tasksOf(project).filter((task) => task.id !== id),
  };
  if (itemsOf(project).some((item) => item.taskId === id)) {
    next.taskItems = itemsOf(project).filter((item) => item.taskId !== id);
  }
  if (commentsOf(project).some((comment) => comment.taskId === id)) {
    next.taskComments = commentsOf(project).filter((comment) => comment.taskId !== id);
  }
  return next;
}

export function addTaskItem(project: FactoryProject, taskId: string, text: string): FactoryProject {
  const clipped = text.trim().slice(0, PLAN_TASK_LIMITS.itemTextLength);
  if (!clipped || !tasksOf(project).some((task) => task.id === taskId)) {
    return project;
  }
  const last = itemsOfTask(project, taskId).at(-1);
  const item: PlanTaskItem = {
    id: randomUUID(),
    taskId,
    text: clipped,
    done: false,
    order: orderBetween(last?.order),
  };
  return { ...project, taskItems: [...itemsOf(project), item] };
}

export function updateTaskItem(
  project: FactoryProject,
  id: string,
  patch: Partial<Pick<PlanTaskItem, "text" | "done">>,
): FactoryProject {
  let changed = false;
  const taskItems = itemsOf(project).map((item) => {
    if (item.id !== id) {
      return item;
    }
    const next = { ...item };
    if (patch.done !== undefined && patch.done !== item.done) {
      next.done = patch.done;
      changed = true;
    }
    if (patch.text !== undefined) {
      const text = patch.text.trim().slice(0, PLAN_TASK_LIMITS.itemTextLength);
      if (text && text !== item.text) {
        next.text = text;
        changed = true;
      }
    }
    return next;
  });
  return changed ? { ...project, taskItems } : project;
}

/** Moves a checklist line up (-1) or down (+1) one place. */
export function moveTaskItem(
  project: FactoryProject,
  id: string,
  direction: -1 | 1,
): FactoryProject {
  const item = itemsOf(project).find((entry) => entry.id === id);
  if (!item) {
    return project;
  }
  const lines = itemsOfTask(project, item.taskId);
  const at = lines.findIndex((entry) => entry.id === id);
  const target = at + direction;
  if (target < 0 || target >= lines.length) {
    return project;
  }
  const others = lines.filter((entry) => entry.id !== id);
  const before = others[target - 1];
  const after = others[target];
  const order = orderBetween(before?.order, after?.order);
  return {
    ...project,
    taskItems: itemsOf(project).map((entry) => (entry.id === id ? { ...entry, order } : entry)),
  };
}

export function deleteTaskItem(project: FactoryProject, id: string): FactoryProject {
  return itemsOf(project).some((item) => item.id === id)
    ? { ...project, taskItems: itemsOf(project).filter((item) => item.id !== id) }
    : project;
}

/**
 * A comment by `author`. On a live plan the live service writes who and when
 * itself; these are what a plan on this device alone keeps.
 */
export function addTaskComment(
  project: FactoryProject,
  taskId: string,
  text: string,
  author: TaskAuthor,
  now = new Date().toISOString(),
): FactoryProject {
  const clipped = text.trim().slice(0, PLAN_TASK_LIMITS.commentTextLength);
  if (!clipped || !tasksOf(project).some((task) => task.id === taskId)) {
    return project;
  }
  const comment: PlanTaskComment = {
    id: randomUUID(),
    taskId,
    by: author.id,
    byName: author.username.slice(0, PLAN_TASK_LIMITS.accountNameLength),
    at: now,
    text: clipped,
  };
  return { ...project, taskComments: [...commentsOf(project), comment] };
}

export function deleteTaskComment(project: FactoryProject, id: string): FactoryProject {
  return commentsOf(project).some((comment) => comment.id === id)
    ? { ...project, taskComments: commentsOf(project).filter((comment) => comment.id !== id) }
    : project;
}

/** What a task card shows beside its title. */
export function taskCardCounts(
  project: FactoryProject,
  taskId: string,
): { items: number; done: number; comments: number } {
  let items = 0;
  let done = 0;
  for (const item of itemsOf(project)) {
    if (item.taskId === taskId) {
      items += 1;
      if (item.done) {
        done += 1;
      }
    }
  }
  let comments = 0;
  for (const comment of commentsOf(project)) {
    if (comment.taskId === taskId) {
      comments += 1;
    }
  }
  return { items, done, comments };
}

/** A board card's name for a task's link list: its machine, resource or words. */
export function boardCardLabel(project: FactoryProject, id: string): string | undefined {
  const node = project.nodes.find((entry) => entry.id === id);
  if (node) {
    const recipe = project.recipes.find((entry) => entry.id === node.recipeId);
    return recipe?.name || recipe?.machineType || "Machine";
  }
  const storage = project.storages?.find((entry) => entry.id === id);
  if (storage) {
    return storage.displayName ? `Drawer: ${storage.displayName}` : "Drawer";
  }
  const annotation = project.annotations?.find((entry) => entry.id === id);
  if (annotation) {
    const text = annotation.text?.trim();
    return text ? `Note: ${text.slice(0, 40)}` : "Note";
  }
  const pocket = project.pockets?.find((entry) => entry.id === id);
  if (pocket) {
    return `Board: ${pocket.name}`;
  }
  return undefined;
}
