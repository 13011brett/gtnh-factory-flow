"use client";

import { Link2, ListChecks, MessageSquare, Plus } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Face } from "@/components/live/LiveFaces";
import type { PlanTask, PlanTaskStatus } from "@/lib/model/types";
import { colorFor } from "@/lib/live/protocol";
import { addTask, moveTask, NEW_TASK_TITLE, TASK_STATUS_LABEL, TASK_STATUSES } from "@/lib/tasks/task-board";
import { byOrder } from "@/lib/tasks/order-key";
import { selectTask, useTaskBoardUi } from "@/lib/tasks/task-board-ui";
import { startTaskLinkIndex } from "@/lib/tasks/task-link-index";
import { taskLinks } from "@/lib/tasks/task-links";
import { useFactoryStore } from "@/store/factory-store";
import { TaskPanel } from "./TaskPanel";
import { useTaskAuthor, useTaskPeople } from "./task-people";

/**
 * The plan's task board: To do, Doing, Blocked, Done. Cards drag between and
 * within columns (a drop writes one order key), and a click opens the task in
 * the panel beside the columns. Covers the board the way the Library does, so
 * the board underneath keeps its camera and its solve.
 */
export function TaskBoard() {
  const tasks = useFactoryStore((state) => state.project.tasks);
  const items = useFactoryStore((state) => state.project.taskItems);
  const comments = useFactoryStore((state) => state.project.taskComments);
  const editTasks = useFactoryStore((state) => state.editTasks);
  const isReadOnly = useFactoryStore((state) => state.isReadOnly);
  const author = useTaskAuthor();
  const people = useTaskPeople();
  const selectedId = useTaskBoardUi((state) => state.selectedId);
  const newTaskTick = useTaskBoardUi((state) => state.newTaskTick);
  const setSelectedId = selectTask;
  const [dragging, setDragging] = useState<string>();
  const [dropAt, setDropAt] = useState<{ status: PlanTaskStatus; index: number }>();
  const [draft, setDraft] = useState("");
  const addInput = useRef<HTMLInputElement>(null);

  // New task in the toolbar's header: a task in To do, open in the panel with its title ready to type over.
  const seenTick = useRef(newTaskTick);
  useEffect(() => {
    if (newTaskTick === seenTick.current) {
      return;
    }
    seenTick.current = newTaskTick;
    if (isReadOnly) {
      return;
    }
    let made: string | undefined;
    editTasks((project) => {
      const result = addTask(project, { title: NEW_TASK_TITLE, author });
      made = result.id;
      return result.project;
    });
    if (made) {
      selectTask(made);
    }
  }, [newTaskTick, isReadOnly, editTasks, author]);

  const columns = useMemo(() => {
    const byStatus = new Map<PlanTaskStatus, PlanTask[]>(
      TASK_STATUSES.map((status) => [status, []]),
    );
    for (const task of tasks ?? []) {
      byStatus.get(task.status)?.push(task);
    }
    for (const [status, list] of byStatus) {
      byStatus.set(status, byOrder(list));
    }
    return byStatus;
  }, [tasks]);

  const counts = useMemo(() => {
    const result = new Map<string, { items: number; done: number; comments: number }>();
    const entry = (taskId: string) => {
      let found = result.get(taskId);
      if (!found) {
        found = { items: 0, done: 0, comments: 0 };
        result.set(taskId, found);
      }
      return found;
    };
    for (const item of items ?? []) {
      const found = entry(item.taskId);
      found.items += 1;
      if (item.done) {
        found.done += 1;
      }
    }
    for (const comment of comments ?? []) {
      entry(comment.taskId).comments += 1;
    }
    return result;
  }, [items, comments]);

  const names = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const selected = selectedId ? (tasks ?? []).find((task) => task.id === selectedId) : undefined;

  const add = () => {
    const title = draft.trim();
    if (!title) {
      return;
    }
    let made: string | undefined;
    editTasks((project) => {
      const result = addTask(project, { title, author });
      made = result.id;
      return result.project;
    });
    setDraft("");
    if (made) {
      setSelectedId(made);
    }
    addInput.current?.focus();
  };

  // A press on a card that travels past DRAG_SLOP carries it; let go over a
  // column and it lands between the cards around the pointer. Pointer events,
  // so mouse, pen and touch all work the same.
  const press = useRef<{ id: string; x: number; y: number; active: boolean } | undefined>(
    undefined,
  );
  const dropRef = useRef<{ status: PlanTaskStatus; index: number } | undefined>(undefined);
  const suppressClick = useRef(false);

  const beginPress = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0 || isReadOnly) {
      return;
    }
    press.current = { id, x: event.clientX, y: event.clientY, active: false };
    const move = (moved: PointerEvent) => {
      const held = press.current;
      if (!held) {
        return;
      }
      if (!held.active) {
        if (Math.hypot(moved.clientX - held.x, moved.clientY - held.y) < DRAG_SLOP) {
          return;
        }
        held.active = true;
        setDragging(held.id);
      }
      const list = document
        .elementFromPoint(moved.clientX, moved.clientY)
        ?.closest<HTMLElement>("[data-task-list]");
      const status = list?.dataset.taskList as PlanTaskStatus | undefined;
      const next =
        list && status ? { status, index: dropIndex(list, moved.clientY, held.id) } : undefined;
      if (next?.status !== dropRef.current?.status || next?.index !== dropRef.current?.index) {
        dropRef.current = next;
        setDropAt(next);
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const held = press.current;
      const drop = dropRef.current;
      press.current = undefined;
      dropRef.current = undefined;
      if (held?.active) {
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        setDragging(undefined);
        setDropAt(undefined);
        if (drop) {
          editTasks((project) => moveTask(project, held.id, drop.status, drop.index));
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const dropIndex = (list: HTMLElement, clientY: number, held: string | undefined): number => {
    let index = 0;
    for (const card of list.querySelectorAll<HTMLElement>("[data-task-card]")) {
      if (card.dataset.taskCard === held) {
        continue;
      }
      const box = card.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) {
        return index;
      }
      index += 1;
    }
    return index;
  };

  return (
    <div className="relative flex h-full min-h-0 w-full bg-canvas text-xs text-fg" data-task-board>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-4 gap-2 overflow-x-auto p-2 pt-10 compact:grid-cols-[repeat(4,minmax(220px,1fr))]">
          {TASK_STATUSES.map((status) => {
            const list = columns.get(status) ?? [];
            return (
              <section
                key={status}
                data-task-column={status}
                className="flex min-h-0 min-w-0 flex-col rounded border border-line bg-surface"
              >
                <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                    {TASK_STATUS_LABEL[status]}
                  </span>
                  <span className="text-xs tabular-nums text-fg-muted">{list.length}</span>
                </header>
                {status === "todo" && !isReadOnly ? (
                  <form
                    className="flex shrink-0 items-center gap-1 border-b border-line p-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      add();
                    }}
                  >
                    <input
                      ref={addInput}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Add a task"
                      aria-label="New task title"
                      maxLength={120}
                      className="h-7 min-w-0 flex-1 rounded border border-line bg-surface-sunken px-2 text-xs outline-none focus:border-cyan-600"
                    />
                    <button
                      type="submit"
                      aria-label="Add the task"
                      disabled={!draft.trim()}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line-strong text-fg-subtle hover:bg-surface-raised disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : null}
                <div
                  className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5"
                  data-task-list={status}
                >
                  {list.length === 0 && !(dropAt?.status === status) ? (
                    <p className="px-1 py-2 text-xs text-fg-muted">Nothing here.</p>
                  ) : null}
                  {(() => {
                    // Drop places count the column without the card in hand.
                    let place = 0;
                    const showLine = dropAt?.status === status;
                    const rows = list.map((task) => {
                      const lineHere = showLine && task.id !== dragging && dropAt.index === place;
                      if (task.id !== dragging) {
                        place += 1;
                      }
                      return (
                        <div
                          key={task.id}
                          className={task.id === dragging ? "opacity-40" : undefined}
                        >
                          {lineHere ? <DropLine /> : null}
                          <TaskCard
                            task={task}
                            counts={counts.get(task.id)}
                            people={names}
                            selected={task.id === selectedId}
                            onOpen={() => {
                              if (!suppressClick.current) {
                                setSelectedId(task.id);
                              }
                            }}
                            onPress={(event) => beginPress(event, task.id)}
                          />
                        </div>
                      );
                    });
                    return (
                      <>
                        {rows}
                        {showLine && dropAt.index >= place ? <DropLine /> : null}
                      </>
                    );
                  })()}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {selected ? (
        <TaskPanel key={selected.id} task={selected} onClose={() => setSelectedId(undefined)} />
      ) : null}
    </div>
  );
}

/** Screen pixels a press travels before it is a drag, not a click. */
const DRAG_SLOP = 4;

function DropLine() {
  return <div aria-hidden className="my-0.5 h-0.5 rounded bg-cyan-500" data-task-drop-line />;
}

const TaskCard = memo(function TaskCard({
  task,
  counts,
  people,
  selected,
  onOpen,
  onPress,
}: {
  task: PlanTask;
  counts?: { items: number; done: number; comments: number };
  people: Map<string, { id: string; username: string; color: string }>;
  selected: boolean;
  onOpen: () => void;
  onPress: (event: React.PointerEvent) => void;
}) {
  const assignees = task.assignees ?? [];
  const cards = taskLinks(task, "").length;
  return (
    <button
      type="button"
      data-task-card={task.id}
      data-task-title={task.title}
      onPointerDown={onPress}
      onClick={onOpen}
      className={[
        "block w-full select-none rounded border bg-surface-raised px-2 py-1.5 text-left hover:border-line-strong",
        selected ? "border-cyan-600" : "border-line",
      ].join(" ")}
    >
      <span className="line-clamp-2 text-xs font-medium text-fg">{task.title}</span>
      {assignees.length > 0 || counts?.items || counts?.comments || cards ? (
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-muted">
          {assignees.length > 0 ? (
            <span className="flex -space-x-1">
              {assignees.slice(0, 4).map((id) => {
                const person = people.get(id);
                return (
                  <Face
                    key={id}
                    username={person?.username ?? "?"}
                    color={person?.color ?? colorFor(id)}
                    size={16}
                  />
                );
              })}
            </span>
          ) : null}
          {counts?.items ? (
            <span
              className={[
                "inline-flex items-center gap-0.5",
                counts.done === counts.items ? "text-emerald-400" : "",
              ].join(" ")}
              title="Checklist"
            >
              <ListChecks className="h-3 w-3" aria-hidden />
              {counts.done}/{counts.items}
            </span>
          ) : null}
          {counts?.comments ? (
            <span className="inline-flex items-center gap-0.5" title="Comments">
              <MessageSquare className="h-3 w-3" aria-hidden />
              {counts.comments}
            </span>
          ) : null}
          {cards ? (
            <span className="inline-flex items-center gap-0.5" title="Linked cards">
              <Link2 className="h-3 w-3" aria-hidden />
              {cards}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
});

/** Keeps the dots on cards current: which cards some task board is about. Mounted once beside the board. */
export function TaskLinkIndexController() {
  useEffect(() => startTaskLinkIndex(), []);
  return null;
}
