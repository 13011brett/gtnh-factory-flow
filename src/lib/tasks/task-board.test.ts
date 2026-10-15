import { describe, expect, it } from "vitest";
import { createEmptyProject } from "@/examples";
import type { FactoryProject } from "@/lib/model/types";
import { factoryProjectSchema } from "@/lib/model/schemas";
import {
  addTask,
  addTaskComment,
  addTaskItem,
  cardLine,
  commentsOfTask,
  deleteTask,
  deleteTaskItem,
  itemsOfTask,
  moveTask,
  moveTaskItem,
  taskCardCounts,
  tasksIn,
  titleForCards,
  updateTask,
  updateTaskItem,
} from "./task-board";

const NOW = "2026-10-14T12:00:00.000Z";

function board(): FactoryProject {
  let project: FactoryProject = { ...createEmptyProject(), primaryView: "tasks" };
  for (const title of ["One", "Two", "Three"]) {
    project = addTask(project, { title }, NOW).project;
  }
  return project;
}

const titles = (project: FactoryProject, status: "todo" | "doing" | "blocked" | "done") =>
  tasksIn(project, status).map((task) => task.title);

describe("the task board's edits", () => {
  it("adds tasks to the bottom of To do, and leaves the plan alone for an empty title", () => {
    const project = board();
    expect(titles(project, "todo")).toEqual(["One", "Two", "Three"]);
    expect(addTask(project, { title: "   " }).project).toBe(project);
    expect(factoryProjectSchema.safeParse(project).success).toBe(true);
  });

  it("moves a task within its column and to another, writing only its own key", () => {
    let project = board();
    const [one, two, three] = tasksIn(project, "todo");
    const before = project;
    project = moveTask(project, three!.id, "todo", 0);
    expect(titles(project, "todo")).toEqual(["Three", "One", "Two"]);
    // The others are untouched objects: a move is one field of one task.
    expect(project.tasks!.find((task) => task.id === one!.id)).toBe(
      before.tasks!.find((task) => task.id === one!.id),
    );
    project = moveTask(project, two!.id, "done", 0, NOW);
    expect(titles(project, "todo")).toEqual(["Three", "One"]);
    expect(titles(project, "done")).toEqual(["Two"]);
    expect(project.tasks!.find((task) => task.id === two!.id)!.doneAt).toBe(NOW);
    project = moveTask(project, two!.id, "doing", 5);
    expect(project.tasks!.find((task) => task.id === two!.id)!.doneAt).toBeUndefined();
    // Dropped where it already is: the same plan.
    expect(moveTask(project, two!.id, "doing", 0)).toBe(project);
  });

  it("keeps a checklist in order, ticks and reorders lines, and counts them on the card", () => {
    let project = board();
    const task = tasksIn(project, "todo")[0]!;
    for (const text of ["Mine ore", "Smelt", "Build"]) {
      project = addTaskItem(project, task.id, text);
    }
    const [mine, smelt] = itemsOfTask(project, task.id);
    project = updateTaskItem(project, smelt!.id, { done: true });
    project = moveTaskItem(project, mine!.id, 1);
    expect(itemsOfTask(project, task.id).map((item) => item.text)).toEqual([
      "Smelt",
      "Mine ore",
      "Build",
    ]);
    project = deleteTaskItem(project, mine!.id);
    project = addTaskComment(project, task.id, "On it", { id: "u1", username: "ann" }, NOW);
    expect(taskCardCounts(project, task.id)).toEqual({ items: 2, done: 1, comments: 1 });
    expect(commentsOfTask(project, task.id)[0]).toMatchObject({ by: "u1", byName: "ann", at: NOW });
    expect(factoryProjectSchema.safeParse(project).success).toBe(true);
  });

  it("sets and clears a task's fields, and deleting it takes its checklist and comments", () => {
    let project = board();
    const task = tasksIn(project, "todo")[0]!;
    project = updateTask(project, task.id, {
      text: "Notes",
      assignees: ["u1", "u1"],
      nodeIds: ["n1"],
    });
    expect(project.tasks!.find((entry) => entry.id === task.id)).toMatchObject({
      text: "Notes",
      assignees: ["u1"],
      nodeIds: ["n1"],
    });
    expect(updateTask(project, task.id, { text: "Notes" })).toBe(project);
    project = updateTask(project, task.id, { text: "", assignees: [] });
    const cleared = project.tasks!.find((entry) => entry.id === task.id)!;
    expect("text" in cleared).toBe(false);
    expect("assignees" in cleared).toBe(false);
    project = addTaskItem(project, task.id, "Line");
    project = addTaskComment(project, task.id, "Hi", { id: "u1", username: "ann" });
    project = deleteTask(project, task.id);
    expect(project.tasks!.some((entry) => entry.id === task.id)).toBe(false);
    expect(project.taskItems).toEqual([]);
    expect(project.taskComments).toEqual([]);
  });
});

describe("tasks made from cards", () => {
  it("titles a task from its machines", () => {
    expect(titleForCards(["Electric Blast Furnace"])).toBe("Build Electric Blast Furnace");
    expect(titleForCards(["Mixer", "Mixer", "Centrifuge"])).toBe("Build Mixer and Centrifuge");
    expect(titleForCards(["A", "B", "C", "D"])).toBe("Build A and 3 more");
  });

  it("writes a checklist line with how many to build and the tier", () => {
    expect(cardLine({ name: "Electric Blast Furnace", tier: "HV", count: 4 })).toBe(
      "4× Electric Blast Furnace (HV)",
    );
    expect(cardLine({ name: "Mixer", count: 0 })).toBe("Mixer");
  });

  it("keeps links on a new task and its lines, once each", () => {
    const link = { plan: "p", node: "n1" };
    const made = addTask(createEmptyProject(), { title: "Build", links: [link, link, { plan: "p", node: "n2" }] });
    expect(made.project.tasks![0]!.links).toEqual([link, { plan: "p", node: "n2" }]);
    const withLine = addTaskItem(made.project, made.id, "2× Mixer", link);
    expect(withLine.taskItems![0]!.link).toEqual(link);
    const cleared = updateTask(withLine, made.id, { links: [] });
    expect(cleared.tasks![0]!.links).toBeUndefined();
  });
});
