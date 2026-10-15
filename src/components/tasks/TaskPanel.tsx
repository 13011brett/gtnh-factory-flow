"use client";

import { ArrowDown, ArrowUp, Link2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Face } from "@/components/live/LiveFaces";
import { formatRelativeDate } from "@/components/shelf-cards";
import type { PlanTask } from "@/lib/model/types";
import {
  addTaskComment,
  addTaskItem,
  commentsOfTask,
  deleteTask,
  deleteTaskComment,
  deleteTaskItem,
  itemsOfTask,
  moveTask,
  moveTaskItem,
  NEW_TASK_TITLE,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  tasksIn,
  updateTask,
  updateTaskItem,
} from "@/lib/tasks/task-board";
import { openTaskLink, useLinkStates } from "@/lib/tasks/open-link";
import { itemLink, linkKey, taskLinks } from "@/lib/tasks/task-links";
import { useDesignStore } from "@/store/design-store";
import { useFactoryStore } from "@/store/factory-store";
import { myAccountId } from "@/store/live-session";
import { planLinkId } from "@/lib/tasks/task-links";
import { useTaskAuthor, useTaskPeople } from "./task-people";

/**
 * One task, edited beside the columns: its title, words, column, people,
 * checklist, the board cards it is about, and its comments. Text commits on
 * leaving the field (and while typing pauses), so a live plan sends one batch
 * per thought, not per key.
 */
export function TaskPanel({ task, onClose }: { task: PlanTask; onClose: () => void }) {
  const editTasks = useFactoryStore((state) => state.editTasks);
  const isReadOnly = useFactoryStore((state) => state.isReadOnly);
  const allItems = useFactoryStore((state) => state.project.taskItems);
  const allComments = useFactoryStore((state) => state.project.taskComments);
  const author = useTaskAuthor();
  const people = useTaskPeople();
  const [titleDraft, setTitleDraft] = useState<string>();
  const [textDraft, setTextDraft] = useState<string>();
  const [itemDraft, setItemDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const textTimer = useRef<number | undefined>(undefined);

  // Read through the store, so these follow only what they show.
  const items = useMemo(
    () => itemsOfTask({ ...useFactoryStore.getState().project, taskItems: allItems }, task.id),
    [allItems, task.id],
  );
  const comments = useMemo(
    () =>
      commentsOfTask({ ...useFactoryStore.getState().project, taskComments: allComments }, task.id),
    [allComments, task.id],
  );
  // The plan holding the task, as links spell it: an older same-plan link reads as this one.
  const ownPlan = useDesignStore((state) => {
    const design = state.designs.find((entry) => entry.id === state.activeDesignId);
    return design ? planLinkId(design, myAccountId()) : "";
  });
  const linked = useMemo(() => taskLinks(task, ownPlan), [task, ownPlan]);
  const states = useLinkStates(linked);
  const [gone, setGone] = useState<string>();
  const show = async (link: { plan: string; node: string }) => {
    setGone(undefined);
    const result = await openTaskLink(link);
    if (result === "plan-gone") {
      setGone("That plan is gone");
    } else if (result === "card-gone") {
      setGone("That card is gone");
    }
  };
  const done = items.filter((item) => item.done).length;

  useEffect(() => () => window.clearTimeout(textTimer.current), []);

  const commitTitle = () => {
    const next = titleDraft?.trim();
    setTitleDraft(undefined);
    if (next && next !== task.title) {
      editTasks((plan) => updateTask(plan, task.id, { title: next }));
    }
  };

  const commitText = (value: string) => {
    window.clearTimeout(textTimer.current);
    if (value !== (task.text ?? "")) {
      editTasks((plan) => updateTask(plan, task.id, { text: value }));
    }
  };

  const assigned = new Set(task.assignees ?? []);

  return (
    <aside
      data-task-panel={task.id}
      aria-label={`Task: ${task.title}`}
      className="flex h-full w-[360px] shrink-0 flex-col border-l border-line bg-surface text-xs compact:absolute compact:inset-y-0 compact:right-0 compact:z-10 compact:w-full compact:max-w-[420px]"
    >
      <div className="flex shrink-0 items-start gap-2 border-b border-line p-2 text-sm">
        <textarea
          value={titleDraft ?? task.title}
          onChange={(event) => setTitleDraft(event.target.value.replace(/\n/g, " "))}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setTitleDraft(undefined);
              event.currentTarget.blur();
            }
          }}
          rows={2}
          maxLength={120}
          readOnly={isReadOnly}
          autoFocus={task.title === NEW_TASK_TITLE}
          onFocus={(event) => {
            if (task.title === NEW_TASK_TITLE) event.currentTarget.select();
          }}
          aria-label="Task title"
          className="min-w-0 flex-1 resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-line focus:border-line-strong focus:bg-surface-sunken"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the task"
          className="rounded p-1 text-fg-subtle hover:bg-surface-raised"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-xs">
        <section className="space-y-1">
          <h3 className="font-semibold text-fg-subtle">Status</h3>
          <div className="flex gap-1" role="radiogroup" aria-label="Status">
            {TASK_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                role="radio"
                aria-checked={task.status === status}
                disabled={isReadOnly}
                onClick={() =>
                  editTasks((plan) =>
                    moveTask(
                      plan,
                      task.id,
                      status,
                      tasksIn(plan, status).filter((entry) => entry.id !== task.id).length,
                    ),
                  )
                }
                className={[
                  "flex-1 rounded border px-1.5 py-1",
                  task.status === status
                    ? "border-cyan-600 bg-cyan-950/50 text-fg"
                    : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                ].join(" ")}
              >
                {TASK_STATUS_LABEL[status]}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-1">
          <h3 className="font-semibold text-fg-subtle">Assigned</h3>
          {people.length === 0 ? (
            <p className="text-fg-muted">Sign in to give tasks to people.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {people.map((person) => {
                const on = assigned.has(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    aria-pressed={on}
                    disabled={isReadOnly}
                    onClick={() =>
                      editTasks((plan) =>
                        updateTask(plan, task.id, {
                          assignees: on
                            ? [...assigned].filter((id) => id !== person.id)
                            : [...assigned, person.id],
                        }),
                      )
                    }
                    className={[
                      "inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2",
                      on
                        ? "border-cyan-600 bg-cyan-950/50 text-fg"
                        : "border-line text-fg-muted hover:border-line-strong",
                    ].join(" ")}
                  >
                    <Face username={person.username} color={person.color} size={16} />
                    {person.id === author.id ? "You" : person.username}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-1">
          <h3 className="font-semibold text-fg-subtle">Notes</h3>
          <textarea
            value={textDraft ?? task.text ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setTextDraft(value);
              window.clearTimeout(textTimer.current);
              textTimer.current = window.setTimeout(() => commitText(value), 800);
            }}
            onBlur={(event) => {
              commitText(event.target.value);
              setTextDraft(undefined);
            }}
            rows={4}
            maxLength={4000}
            readOnly={isReadOnly}
            placeholder="What needs doing?"
            aria-label="Task notes"
            className="w-full resize-y rounded border border-line-strong bg-surface-sunken px-2 py-1.5"
          />
        </section>

        <section className="space-y-1" data-task-checklist>
          <h3 className="font-semibold text-fg-subtle">
            Checklist {items.length > 0 ? `${done}/${items.length}` : ""}
          </h3>
          <ul className="space-y-0.5">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="group flex items-center gap-1.5"
                data-task-item={item.text}
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={isReadOnly}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    editTasks((plan) => updateTaskItem(plan, item.id, { done: checked }));
                  }}
                  aria-label={`Done: ${item.text}`}
                  className="h-3.5 w-3.5 shrink-0 accent-cyan-600"
                />
                <ItemText
                  text={item.text}
                  done={item.done}
                  readOnly={isReadOnly}
                  onCommit={(text) => editTasks((plan) => updateTaskItem(plan, item.id, { text }))}
                />
                {itemLink(item, ownPlan) ? (
                  <button
                    type="button"
                    onClick={() => void show(itemLink(item, ownPlan)!)}
                    aria-label={`Show on its plan: ${item.text}`}
                    title="Show it on its plan"
                    className="shrink-0 rounded p-0.5 text-fg-muted hover:text-cyan-300"
                  >
                    <Link2 className="h-3 w-3" />
                  </button>
                ) : null}
                {isReadOnly ? null : (
                  <span className="flex shrink-0 items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => editTasks((plan) => moveTaskItem(plan, item.id, -1))}
                      aria-label={`Move up: ${item.text}`}
                      className="rounded p-0.5 text-fg-muted hover:text-fg disabled:opacity-30"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => editTasks((plan) => moveTaskItem(plan, item.id, 1))}
                      aria-label={`Move down: ${item.text}`}
                      className="rounded p-0.5 text-fg-muted hover:text-fg disabled:opacity-30"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => editTasks((plan) => deleteTaskItem(plan, item.id))}
                      aria-label={`Delete: ${item.text}`}
                      className="rounded p-0.5 text-fg-muted hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {isReadOnly ? null : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const text = itemDraft.trim();
                if (text) {
                  editTasks((plan) => addTaskItem(plan, task.id, text));
                  setItemDraft("");
                }
              }}
            >
              <input
                value={itemDraft}
                onChange={(event) => setItemDraft(event.target.value)}
                placeholder="Add an item"
                aria-label="New checklist item"
                maxLength={200}
                className="h-7 w-full rounded border border-line bg-surface-sunken px-2 outline-none focus:border-cyan-600"
              />
            </form>
          )}
        </section>

        <section className="space-y-1" data-task-links>
          <h3 className="font-semibold text-fg-subtle">Cards</h3>
          {linked.length === 0 ? (
            <p className="text-fg-muted">No cards linked.</p>
          ) : (
            <ul className="space-y-0.5">
              {linked.map((link) => {
                const state = states[linkKey(link)];
                const label =
                  state?.state === "ok"
                    ? state.label
                    : state?.state === "card"
                      ? "A card that is gone"
                      : state?.state === "away"
                        ? "A card on a plan not on this device"
                        : state?.state === "plan"
                          ? "A card on a plan that is gone"
                          : "A card";
                return (
                  <li key={linkKey(link)} className="flex items-center gap-1.5" data-task-link>
                    <Link2 className="h-3 w-3 shrink-0 text-fg-muted" aria-hidden />
                    <button
                      type="button"
                      onClick={() => void show(link)}
                      className="min-w-0 flex-1 truncate text-left text-cyan-300 hover:underline"
                      title="Show it on its plan"
                    >
                      {label}
                    </button>
                    {isReadOnly ? null : (
                      <button
                        type="button"
                        onClick={() =>
                          editTasks((plan) =>
                            updateTask(plan, task.id, {
                              links: linked.filter((entry) => linkKey(entry) !== linkKey(link)),
                              nodeIds: [],
                            }),
                          )
                        }
                        aria-label="Unlink the card"
                        className="rounded p-0.5 text-fg-muted hover:text-fg"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {gone ? (
            <p className="text-red-400" role="status" data-task-link-gone>
              {gone}
            </p>
          ) : null}
        </section>

        <section className="space-y-1.5" data-task-comments>
          <h3 className="font-semibold text-fg-subtle">Comments</h3>
          {comments.length === 0 ? <p className="text-fg-muted">No comments yet.</p> : null}
          <ul className="space-y-2">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded border border-line bg-surface-raised px-2 py-1.5"
              >
                <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
                  <span className="font-semibold text-fg-subtle">
                    {comment.by === author.id ? "You" : comment.byName}
                  </span>
                  <span>{formatRelativeDate(comment.at)}</span>
                  {comment.by === author.id && !isReadOnly ? (
                    <button
                      type="button"
                      onClick={() => editTasks((plan) => deleteTaskComment(plan, comment.id))}
                      aria-label="Delete the comment"
                      className="ml-auto rounded p-0.5 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap break-words text-fg">{comment.text}</p>
              </li>
            ))}
          </ul>
          {isReadOnly ? null : (
            <form
              className="space-y-1"
              onSubmit={(event) => {
                event.preventDefault();
                const text = commentDraft.trim();
                if (text) {
                  editTasks((plan) => addTaskComment(plan, task.id, text, author));
                  setCommentDraft("");
                }
              }}
            >
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={2}
                maxLength={2000}
                placeholder="Write a comment"
                aria-label="New comment"
                className="w-full resize-y rounded border border-line-strong bg-surface-sunken px-2 py-1.5"
              />
              <button
                type="submit"
                disabled={!commentDraft.trim()}
                className="rounded border border-cyan-700 bg-cyan-600 px-2.5 py-1 font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
              >
                Comment
              </button>
            </form>
          )}
        </section>

        {isReadOnly ? null : (
          <section className="border-t border-line pt-3">
            <button
              type="button"
              onClick={() => {
                if (!deleteArmed) {
                  setDeleteArmed(true);
                  return;
                }
                onClose();
                editTasks((plan) => deleteTask(plan, task.id));
              }}
              onBlur={() => setDeleteArmed(false)}
              className="rounded border border-red-800 px-2.5 py-1 text-red-300 hover:bg-red-950/50"
            >
              {deleteArmed ? "Click again to delete" : "Delete task"}
            </button>
          </section>
        )}
      </div>
    </aside>
  );
}

/** A checklist line's words, edited in place; committed on leaving the field. */
function ItemText({
  text,
  done,
  readOnly,
  onCommit,
}: {
  text: string;
  done: boolean;
  readOnly: boolean;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return (
    <input
      value={draft ?? text}
      readOnly={readOnly}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft?.trim();
        setDraft(undefined);
        if (next && next !== text) {
          onCommit(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(undefined);
          event.currentTarget.blur();
        }
      }}
      maxLength={200}
      aria-label="Checklist item"
      className={[
        "h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 outline-none hover:border-line focus:border-line-strong focus:bg-surface-sunken",
        done ? "text-fg-muted line-through" : "text-fg",
      ].join(" ")}
    />
  );
}
