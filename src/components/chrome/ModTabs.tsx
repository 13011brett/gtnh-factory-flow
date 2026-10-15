"use client";

import "./chrome.css";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { activateOnKey } from "@/lib/hooks/button-keys";
import { openDesigns } from "@/lib/designs/design-library";
import { readDesign } from "@/lib/designs/design-storage";
import { leaveLibrary, openLibrary } from "@/lib/library/library-tab";
import { leaveWelcomeTab } from "@/lib/welcome/welcome-tab";
import { playBoardSound } from "@/lib/board-sounds";
import { playSfx } from "@/lib/sound/sfx";
import { useDesignStore } from "@/store/design-store";
import { useFactoryStore } from "@/store/factory-store";
import { useSolvingBooks } from "@/components/flow/use-solving-books";
import { tipAttrs } from "@/components/flow/clean/interaction";
import { openPlanFile } from "@/lib/import-export/open-plan-file";
import { flashNotice } from "@/components/flow/clean/rail/NoticeBar";
import { ChromeMenu, chromeAnchorOf, MENU_ANCHOR_ATTR, type ChromeAnchor, type MenuEntry } from "./ChromeMenu";
import { libraryRows } from "./library-rows";
import { copyPlanCode } from "./share-actions";
import type { ShareMode } from "@/components/community/SharePlanDialog";

/** What the tab strip asks of the bar: the dialogs it does not own. */
export interface ModTabsActions {
  /** "Paste plan": the paste dialog. */
  onPaste: () => void;
  /** The library dialog for the plan open now: Save to library, Update in library, Save as new post. */
  onShare: (mode?: ShareMode) => void;
}

type TabMenu =
  | { kind: "plus"; anchor: ChromeAnchor }
  | { kind: "tab"; anchor: ChromeAnchor; id: string; name: string }
  | { kind: "delete"; anchor: ChromeAnchor; id: string; name: string };

/** The plan tabs of the top bar (the mod's PlanTabs): one per open plan, then "+". */
export function ModTabs({ onPaste, onShare }: ModTabsActions) {
  const allDesigns = useDesignStore((state) => state.designs);
  const publicViews = useDesignStore((state) => state.publicViews);
  const publicView = useDesignStore((state) => state.publicView);
  const activeDesignId = useDesignStore((state) => state.activeDesignId);
  const switchToDesign = useDesignStore((state) => state.switchToDesign);
  const addDesign = useDesignStore((state) => state.addDesign);
  const renameDesign = useDesignStore((state) => state.renameDesign);
  const closeDesigns = useDesignStore((state) => state.closeDesigns);
  const removeDesign = useDesignStore((state) => state.removeDesign);
  const designs = openDesigns(allDesigns);
  const linkedPostId = useFactoryStore((state) => state.project.metadata?.communityPlanId);
  const solving = useSolvingBooks();

  const [menu, setMenu] = useState<TabMenu>();
  const [renaming, setRenaming] = useState<string>();
  const [fade, setFade] = useState({ left: false, right: false });
  const stripRef = useRef<HTMLDivElement>(null);
  const canClose = designs.length + publicViews.length > 1;
  // One tab is in the Tab order (roving): the open plan's, else the first. The arrows move among the rest.
  const tabIds = [...publicViews.map((view) => `public:${view.id}`), ...designs.map((design) => design.id)];
  const wanted = publicView ? `public:${publicView.id}` : activeDesignId;
  const tabStop = wanted && tabIds.includes(wanted) ? wanted : tabIds[0];
  const closeMenu = useCallback(() => setMenu(undefined), []);

  const syncFade = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const max = strip.scrollWidth - strip.clientWidth;
    const next = { left: strip.scrollLeft > 1, right: strip.scrollLeft < max - 1 };
    setFade((previous) => (previous.left === next.left && previous.right === next.right ? previous : next));
  }, []);

  useLayoutEffect(() => {
    syncFade();
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncFade);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [syncFade, designs.length, publicViews.length]);

  // The open plan's tab comes into view when the open plan changes.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelector<HTMLElement>("[data-active]");
    if (!strip || !tab) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    syncFade();
  }, [activeDesignId, publicView?.id, designs.length, syncFade]);

  const close = async (id: string) => {
    playSfx("ui.close");
    const index = designs.findIndex((design) => design.id === id);
    const next = designs[index + 1] ?? designs[index - 1];
    await closeDesigns([id], next?.id);
  };

  const copyCode = async (id: string) => {
    try {
      const project = id === activeDesignId ? useFactoryStore.getState().project : (await readDesign(id))?.project;
      if (!project) return;
      await copyPlanCode(project);
    } catch (error) {
      console.error(error);
    }
  };

  const activate = async (id: string) => {
    // A tab switched turns a page; its cards are not landing, they were there.
    if (id !== activeDesignId) playSfx("ui.page");
    leaveWelcomeTab();
    leaveLibrary();
    await switchToDesign(id);
  };

  const openTabMenu = (event: React.MouseEvent<HTMLElement>, id: string, name: string) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ kind: "tab", id, name, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom + 1 } });
  };

  const entries = (m: TabMenu): MenuEntry[] => {
    if (m.kind === "plus") {
      return [
        {
          label: "New plan",
          onSelect: () => {
            playSfx("ui.page");
            leaveWelcomeTab();
            leaveLibrary();
            void addDesign();
          },
        },
        { label: "Open a plan...", detail: "My plans", onSelect: () => openLibrary({ kind: "all" }) },
        { label: "Open plan file...", detail: ".json", onSelect: () => document.querySelector<HTMLInputElement>("[data-plan-file-input]")?.click() },
        { label: "Paste plan", detail: "a plan link, code or file", onSelect: onPaste },
        { label: "Browse library", detail: "public plans", onSelect: () => openLibrary({ kind: "public" }) },
      ];
    }
    if (m.kind === "delete") {
      return [
        { label: "Delete it", tone: "red", onSelect: () => void removeDesign(m.id) },
        { label: "Keep it", onSelect: () => undefined },
      ];
    }
    const rows: MenuEntry[] = [
      { label: "Rename", onSelect: () => setRenaming(m.id) },
      { label: "Copy plan code", detail: "to paste or share", onSelect: () => void copyCode(m.id) },
      ...libraryRows(
        Boolean(m.id === activeDesignId ? linkedPostId : designs.find((design) => design.id === m.id)?.communityPlanId),
        (mode) => {
          void (async () => {
            if (m.id !== activeDesignId) await activate(m.id);
            onShare(mode);
          })();
        },
      ),
    ];
    if (canClose) {
      rows.push(
        { label: "Close tab", detail: "kept in My plans", onSelect: () => void close(m.id) },
        {
          label: "Close other tabs",
          detail: "kept in My plans",
          onSelect: () =>
            void closeDesigns(
              designs.filter((design) => design.id !== m.id).map((design) => design.id),
              m.id,
            ),
        },
      );
    }
    rows.push({
      label: "Delete plan",
      tone: "red",
      onSelect: () => setMenu({ kind: "delete", id: m.id, name: m.name, anchor: m.anchor }),
    });
    return rows;
  };

  return (
    <div className="mt" data-mod-tabs="">
      <div className="mt-wrap">
        <div
          ref={stripRef}
          className="mt-strip"
          onScroll={syncFade}
          role="tablist"
          aria-label="Open plans"
          onKeyDown={(event) => {
            if (event.target instanceof HTMLInputElement) return;
            const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>(".mt-tab")];
            const at = tabs.indexOf(document.activeElement as HTMLElement);
            if (at < 0) return;
            let to = -1;
            if (event.key === "ArrowRight") to = (at + 1) % tabs.length;
            else if (event.key === "ArrowLeft") to = (at - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") to = 0;
            else if (event.key === "End") to = tabs.length - 1;
            if (to < 0) return;
            event.preventDefault();
            tabs[to].focus();
            tabs[to].scrollIntoView({ block: "nearest", inline: "nearest" });
          }}
          onWheel={(event) => {
            const strip = stripRef.current;
            if (!strip || strip.scrollWidth <= strip.clientWidth) return;
            strip.scrollLeft += event.deltaY + event.deltaX > 0 ? 40 : -40;
          }}
        >
          {publicViews.map((view) => {
            const active = publicView?.id === view.id;
            return (
              <div
                key={`public:${view.id}`}
                className="mt-tab"
                data-active={active ? "" : undefined}
                data-readonly=""
                data-public-tab={view.id}
                role="tab"
                aria-selected={active}
                tabIndex={tabStop === `public:${view.id}` ? 0 : -1}
                onKeyDown={(event) => {
                  activateOnKey(event);
                  if ((event.key === "Delete" || event.key === "Backspace") && event.target === event.currentTarget) {
                    void useDesignStore.getState().closePublicView(view.id);
                  }
                }}
                onClick={() => {
                  leaveWelcomeTab();
                  leaveLibrary();
                  void useDesignStore.getState().switchToPublicView(view.id);
                }}
                onMouseDown={(event) => {
                  if (event.button === 1) event.preventDefault();
                }}
                onAuxClick={(event) => {
                  if (event.button === 1) void useDesignStore.getState().closePublicView(view.id);
                }}
                {...tipAttrs({
                  id: `tab|public:${view.id}`,
                  title: view.name,
                  sub: "Shared plan: view only. Middle-click to close",
                })}
              >
                <span className="mt-name">{view.name}</span>
                <span
                  className="mt-close"
                  role="button"
                  aria-label="Close public setup view"
                  onClick={(event) => {
                    event.stopPropagation();
                    void useDesignStore.getState().closePublicView(view.id);
                  }}
                  {...tipAttrs({ id: `tab|public-close:${view.id}`, title: "Close tab" })}
                >
                  <CloseGlyph />
                </span>
              </div>
            );
          })}
          {designs.map((design) => {
            const active = design.id === activeDesignId && !publicView;
            const isRenaming = renaming === design.id;
            return (
              <div
                key={design.id}
                className="mt-tab"
                data-design-id={design.id}
                data-active={active ? "" : undefined}
                role="tab"
                aria-selected={active}
                tabIndex={tabStop === design.id ? 0 : -1}
                onKeyDown={(event) => {
                  if (isRenaming || event.target !== event.currentTarget) return;
                  activateOnKey(event);
                  if (event.key === "F2") {
                    event.preventDefault();
                    setRenaming(design.id);
                  } else if ((event.key === "Delete" || event.key === "Backspace") && canClose) {
                    event.preventDefault();
                    void close(design.id);
                  }
                }}
                onClick={() => {
                  if (!isRenaming) void activate(design.id);
                }}
                onMouseDown={(event) => {
                  if (event.button === 1) event.preventDefault();
                }}
                onAuxClick={(event) => {
                  if (event.button === 1 && canClose) void close(design.id);
                }}
                onContextMenu={(event) => openTabMenu(event, design.id, design.name)}
                {...(isRenaming
                  ? {}
                  : tipAttrs({
                      id: `tab|${design.id}`,
                      title: design.name,
                      sub: "Middle-click to close, right-click for more",
                    }))}
              >
                {isRenaming ? (
                  <RenameField
                    initial={design.name}
                    onDone={(name) => {
                      setRenaming(undefined);
                      if (name && name !== design.name) void renameDesign(design.id, name);
                    }}
                  />
                ) : (
                  <span className="mt-name">{design.name}</span>
                )}
                {active && solving ? <span className="mt-solving" aria-label="Still working out this plan's numbers" /> : null}
                {canClose && !isRenaming ? (
                  <span
                    className="mt-close"
                    role="button"
                    aria-label={`Close ${design.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void close(design.id);
                    }}
                    {...tipAttrs({ id: `tab|close:${design.id}`, title: "Close tab (the plan is kept in My plans)" })}
                  >
                    <CloseGlyph />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        <span className="mt-fade" data-edge="l" data-on={fade.left ? "" : undefined} aria-hidden />
        <span className="mt-fade" data-edge="r" data-on={fade.right ? "" : undefined} aria-hidden />
      </div>
      <div
        className="mt-plus"
        role="button"
        aria-label="New plan"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === "plus"}
        tabIndex={0}
        onKeyDown={activateOnKey}
        {...{ [MENU_ANCHOR_ATTR]: "" }}
        data-open={menu?.kind === "plus" ? "" : undefined}
        onClick={(event) => {
          playBoardSound("tick");
          const anchor = chromeAnchorOf(event.currentTarget);
          setMenu((current) => (current?.kind === "plus" ? undefined : { kind: "plus", anchor }));
        }}
        {...tipAttrs({ id: "tab|plus", title: "New plan, or open an existing one" })}
      >
        +
      </div>
      <input
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-plan-file-input=""
        aria-label="Open plan file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          leaveWelcomeTab();
          leaveLibrary();
          openPlanFile(file).catch((error) =>
            flashNotice("warn", error instanceof Error ? error.message : "That plan file could not be opened."),
          );
        }}
      />
      {menu ? (
        <ChromeMenu
          anchor={menu.anchor}
          entries={entries(menu)}
          label={menu.kind === "plus" ? "New plan" : `Plan options for ${menu.name}`}
          title={menu.kind === "delete" ? `Delete '${menu.name}' for good?` : undefined}
          minWidth={menu.kind === "plus" ? 190 : menu.kind === "delete" ? 150 : 170}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}

/** The pixel cross of the close key: two five-pixel diagonals. */
function CloseGlyph() {
  const d: string[] = [];
  for (let k = 0; k < 5; k++) {
    d.push(`M${2 + k} ${2 + k}h1v1h-1z`, `M${6 - k} ${2 + k}h1v1h-1z`);
  }
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden fill="currentColor">
      <path d={d.join("")} />
    </svg>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);
  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(commit ? value.trim() : "");
  };
  return (
    <input
      autoFocus
      className="mt-rename"
      aria-label="Plan name"
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") finish(false);
      }}
    />
  );
}
