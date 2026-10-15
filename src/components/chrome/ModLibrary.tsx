"use client";

import "./chrome.css";
import "./library.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loginCommunityUser, registerCommunityUser } from "@/lib/community/client";
import { requestShareDialog } from "@/lib/setups-tab";
import { openDesigns, type DesignSummary } from "@/lib/designs/design-library";
import { readDesign } from "@/lib/designs/design-storage";
import { libraryRows } from "./library-rows";
import { copyPlanCode } from "./share-actions";
import { agoText, lastOpenOf } from "@/lib/library/last-open";
import { leaveLibrary, setLibraryView, useLibraryTab } from "@/lib/library/library-tab";
import { GT_VOLTAGE_TIERS } from "@/lib/model/tiers";
import { leaveWelcomeTab } from "@/lib/welcome/welcome-tab";
import { playBoardSound } from "@/lib/board-sounds";
import { useDesignStore } from "@/store/design-store";
import { useFactoryStore } from "@/store/factory-store";
import { tipAttrs } from "@/components/flow/clean/interaction";
import { Face } from "@/components/library/LibraryTile";
import { SETUP_SORTS, SetupsGrid } from "@/components/library/SetupsGrid";
import { useSetupFilters } from "@/components/library/SetupsFilterBar";
import { useCommunityUser } from "@/components/community/auth";
import { useDropdownDismiss } from "@/lib/hooks/use-dropdown-dismiss";
import { getUiScale } from "@/lib/ui-scale";
import { ChromeMenu, chromeAnchorOf, MENU_ANCHOR_ATTR, type ChromeAnchor, type MenuEntry } from "./ChromeMenu";

/**
 * The Library (the mod's LibraryView): a header with the two shelves, My plans (every plan kept, the most recently
 * open first, after a tile for a new one) and Public setups, the search, the public list's sort and tier, the account
 * key and a close key; the shelf below. It takes the board's place and closes back onto it.
 */
export function ModLibrary() {
  const library = useLibraryTab();
  const designs = useDesignStore((state) => state.designs);
  const shelf: "mine" | "public" =
    library.view.kind === "public" || library.view.kind === "saved" ? "public" : "mine";
  const filters = useSetupFilters("top");
  const [publicTotal, setPublicTotal] = useState<number>();
  const [mineQuery, setMineQuery] = useState("");
  const [menu, setMenu] = useState<{ kind: "sort" | "tier" | "account"; anchor: ChromeAnchor }>();
  const [signingIn, setSigningIn] = useState<ChromeAnchor>();
  const { user, isLoading, signOut } = useCommunityUser();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const onTotal = useCallback((total: number) => setPublicTotal(total), []);

  // Esc closes the library (a text field keeps its own Esc).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (document.querySelector("[data-mod-menu], [data-mod-settings], [data-mod-screenshot]")) return;
      leaveLibrary();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sortLabel = SETUP_SORTS.find((entry) => entry.value === filters.sort)?.label ?? "Top voted";
  const tierIndex = filters.maxTier === "" ? -1 : Number(filters.maxTier);
  const tierLabel = tierIndex < 0 ? "Any tier" : `Up to ${GT_VOLTAGE_TIERS[tierIndex]?.tier ?? ""}`;

  const menuEntries = (kind: "sort" | "tier" | "account"): MenuEntry[] => {
    if (kind === "sort") {
      return SETUP_SORTS.map((entry) => ({
        label: entry.label,
        current: entry.value === filters.sort,
        onSelect: () => filters.setSort(entry.value),
      }));
    }
    if (kind === "tier") {
      return [
        { label: "Any tier", current: tierIndex < 0, onSelect: () => filters.setMaxTier("") },
        ...GT_VOLTAGE_TIERS.map((entry, index) => ({
          label: `Up to ${entry.tier}`,
          current: tierIndex === index,
          onSelect: () => filters.setMaxTier(String(index)),
        })),
      ];
    }
    return [
      { label: "My posts", detail: "your public plans", onSelect: () => setLibraryView({ kind: "public" }) },
      { label: "Sign out", onSelect: () => void signOut() },
    ];
  };

  return (
    <div className="ml mx" data-mod-library="">
      <div className="ml-head">
        <ShelfTab label="MY PLANS" count={String(designs.length)} on={shelf === "mine"} onClick={() => setLibraryView({ kind: "all" })} />
        <ShelfTab
          label="PUBLIC SETUPS"
          count={publicTotal === undefined ? "..." : compact(publicTotal)}
          on={shelf === "public"}
          onClick={() => setLibraryView({ kind: "public" })}
        />
        {shelf === "mine" ? (
          <input
            className="ml-search"
            style={{ width: 240 }}
            placeholder="Find a plan"
            aria-label="Find a plan"
            value={mineQuery}
            onChange={(event) => setMineQuery(event.target.value)}
          />
        ) : (
          <input
            className="ml-search"
            style={{ width: 300 }}
            placeholder="Search setups (#tag, @name)"
            aria-label="Search setups"
            value={filters.query}
            onChange={(event) => filters.setQuery(event.target.value)}
          />
        )}
        <span className="mb-grow" />
        {shelf === "public" ? (
          <>
            <DropKey
              label={sortLabel}
              open={menu?.kind === "sort"}
              tip="How the public list is ordered"
              onOpen={(anchor) => setMenu({ kind: "sort", anchor })}
            />
            <DropKey
              label={tierLabel}
              open={menu?.kind === "tier"}
              tip="Hide setups that need a higher tier"
              onOpen={(anchor) => setMenu({ kind: "tier", anchor })}
            />
          </>
        ) : null}
        {isLoading ? null : user ? (
          <div
            className="mb-key ml-account"
            role="button"
            {...{ [MENU_ANCHOR_ATTR]: "" }}
            onClick={(event) => {
              playBoardSound("tick");
              const anchor = chromeAnchorOf(event.currentTarget);
              setMenu((current) => (current?.kind === "account" ? undefined : { kind: "account", anchor }));
            }}
            {...tipAttrs({ id: "lib|account", title: `Signed in as ${user.username}`, sub: "Your posts, and signing out" })}
          >
            {user.username}
          </div>
        ) : (
          <div
            className="mb-key ml-account ml-signin"
            role="button"
            {...{ [MENU_ANCHOR_ATTR]: "" }}
            onClick={(event) => {
              playBoardSound("tick");
              const anchor = chromeAnchorOf(event.currentTarget);
              setSigningIn((current) => (current ? undefined : anchor));
            }}
            {...tipAttrs({ id: "lib|signin", title: "Sign in to share plans" })}
          >
            Sign in
          </div>
        )}
        <div
          className="mb-key ml-close"
          role="button"
          aria-label="Close the library"
          onClick={() => {
            playBoardSound("tick");
            leaveLibrary();
          }}
          {...tipAttrs({ id: "lib|close", title: "Back to the board" })}
        >
          x
        </div>
      </div>
      <div className="ml-body">
        {shelf === "mine" ? (
          <MyPlans query={mineQuery} />
        ) : (
          <div className="ml-public">
            <SetupsGrid scope="network" presetQuery={library.view.kind === "public" ? library.view.search : undefined} filters={filters} bare onTotal={onTotal} />
          </div>
        )}
      </div>
      {menu ? (
        <ChromeMenu
          anchor={menu.anchor}
          entries={menuEntries(menu.kind)}
          label={menu.kind === "sort" ? "Sort" : menu.kind === "tier" ? "Tier" : "Account"}
          minWidth={menu.kind === "account" ? 120 : 130}
          align={menu.kind === "account" ? "right" : "left"}
          onClose={closeMenu}
        />
      ) : null}
      {signingIn ? <SignInPanel anchor={signingIn} onClose={() => setSigningIn(undefined)} /> : null}
    </div>
  );
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}m`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

function ShelfTab({ label, count, on, onClick }: { label: string; count: string; on: boolean; onClick: () => void }) {
  return (
    <div className="ml-tab" role="tab" aria-selected={on} data-on={on ? "" : undefined} onClick={onClick}>
      <span>{label}</span>
      <i>{count}</i>
    </div>
  );
}

/** A key with a chevron: the public list's sort and tier. */
function DropKey({ label, open, tip, onOpen }: { label: string; open: boolean; tip: string; onOpen: (anchor: ChromeAnchor) => void }) {
  return (
    <div
      className="mb-key ml-drop"
      role="button"
      data-open={open ? "" : undefined}
      {...{ [MENU_ANCHOR_ATTR]: "" }}
      onClick={(event) => {
        playBoardSound("tick");
        onOpen(chromeAnchorOf(event.currentTarget));
      }}
      {...tipAttrs({ id: `lib|${label}`, title: tip })}
    >
      {label}
      <svg width="5" height="3" viewBox="0 0 5 3" shapeRendering="crispEdges" aria-hidden fill="currentColor">
        <path d="M0 0h5v1h-5zM1 1h3v1h-3zM2 2h1v1h-1z" />
      </svg>
    </div>
  );
}

// ---- My plans --------------------------------------------------------------

function MyPlans({ query }: { query: string }) {
  const allDesigns = useDesignStore((state) => state.designs);
  const activeDesignId = useDesignStore((state) => state.activeDesignId);
  const addDesign = useDesignStore((state) => state.addDesign);
  const switchToDesign = useDesignStore((state) => state.switchToDesign);
  const renameDesign = useDesignStore((state) => state.renameDesign);
  const removeDesign = useDesignStore((state) => state.removeDesign);
  const linkedPostId = useFactoryStore((state) => state.project.metadata?.communityPlanId);
  const [menu, setMenu] = useState<{ kind: "tile" | "delete"; id: string; name: string; anchor: ChromeAnchor }>();
  const [renaming, setRenaming] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const open = new Set(openDesigns(allDesigns).map((design) => design.id));
    return allDesigns
      .filter((design) => !needle || design.name.toLowerCase().includes(needle))
      .map((design) => ({ design, open: open.has(design.id), at: lastOpenOf(design.id, design.updatedAt) }))
      .sort((a, b) => b.at - a.at);
  }, [allDesigns, needle]);

  const open = async (id: string) => {
    leaveWelcomeTab();
    await switchToDesign(id);
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

  const entries = (m: NonNullable<typeof menu>): MenuEntry[] => {
    if (m.kind === "delete") {
      return [
        { label: "Delete it", tone: "red", onSelect: () => void removeDesign(m.id) },
        { label: "Keep it", onSelect: () => undefined },
      ];
    }
    return [
      { label: "Open", onSelect: () => void open(m.id) },
      { label: "Rename", onSelect: () => setRenaming(m.id) },
      { label: "Copy plan code", detail: "to paste or share", onSelect: () => void copyCode(m.id) },
      ...libraryRows(
        Boolean(m.id === activeDesignId ? linkedPostId : allDesigns.find((design) => design.id === m.id)?.communityPlanId),
        (mode) => {
          void (async () => {
            await open(m.id);
            requestShareDialog(mode);
          })();
        },
      ),
      {
        label: "Delete plan",
        tone: "red",
        onSelect: () => setMenu({ kind: "delete", id: m.id, name: m.name, anchor: m.anchor }),
      },
    ];
  };

  return (
    <div className="ml-grid" data-my-plans="">
      <div
        className="ml-tile ml-new"
        role="button"
        onClick={() => {
          playBoardSound("tick");
          leaveWelcomeTab();
          void addDesign();
        }}
      >
        + New plan
      </div>
      {shown.map(({ design, open: isOpen, at }) => (
        <PlanTile
          key={design.id}
          design={design}
          showing={design.id === activeDesignId}
          open={isOpen}
          when={agoText(at, now)}
          renaming={renaming === design.id}
          onOpen={() => void open(design.id)}
          onMenu={(anchor) => setMenu({ kind: "tile", id: design.id, name: design.name, anchor })}
          onRename={(name) => {
            setRenaming(undefined);
            if (name && name !== design.name) void renameDesign(design.id, name);
          }}
        />
      ))}
      {menu ? (
        <ChromeMenu
          anchor={menu.anchor}
          entries={entries(menu)}
          label={`Plan options for ${menu.name}`}
          title={menu.kind === "delete" ? `Delete '${menu.name}' for good?` : undefined}
          minWidth={menu.kind === "delete" ? 150 : 190}
          onClose={() => setMenu(undefined)}
        />
      ) : null}
    </div>
  );
}

function PlanTile({
  design,
  showing,
  open,
  when,
  renaming,
  onOpen,
  onMenu,
  onRename,
}: {
  design: DesignSummary;
  showing: boolean;
  open: boolean;
  when: string;
  renaming: boolean;
  onOpen: () => void;
  onMenu: (anchor: ChromeAnchor) => void;
  onRename: (name: string) => void;
}) {
  const cards = design.stats ? Math.max(0, design.stats.cards - (design.stats.drawers ?? 0)) : undefined;
  const drawers = design.stats?.drawers;
  const size =
    cards === undefined
      ? undefined
      : `${cards} ${cards === 1 ? "card" : "cards"}${drawers === undefined ? "" : ` · ${drawers} ${drawers === 1 ? "drawer" : "drawers"}`}`;
  const drawable = Boolean(design.icon && (design.icon.iconPath || design.icon.iconAtlas || design.icon.kind === "fluid"));
  return (
    <div
      className="ml-tile"
      role="button"
      data-showing={showing ? "" : undefined}
      onClick={() => !renaming && onOpen()}
      onContextMenu={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu({ left: rect.left + 8, top: rect.top, bottom: rect.top + 20 });
      }}
      {...tipAttrs({
        id: `lib|plan:${design.id}`,
        title: design.name,
        sub: showing ? "On the board now" : "Click to open it",
        actions: [
          { input: "left", label: "Open" },
          { input: "right", label: "More" },
        ],
      })}
    >
      <span className="ml-face">
        {drawable ? <Face icon={design.icon} size={24} /> : <span className="ml-noface" />}
      </span>
      {open ? <span className="ml-chip" data-showing={showing ? "" : undefined}>{showing ? "SHOWING" : "OPEN"}</span> : null}
      {renaming ? (
        <TileRename initial={design.name} onDone={onRename} />
      ) : (
        <span className="ml-name">{design.name}</span>
      )}
      {size ? <span className="ml-size">{size}</span> : null}
      <span className="ml-when">last open {when}</span>
      {design.communityPlanId ? <span className="ml-posted">posted</span> : null}
    </div>
  );
}

function TileRename({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
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
      className="ml-rename"
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

// ---- Signing in ------------------------------------------------------------

/** "Sign in to the library": the mod's form, over the library's own accounts. */
function SignInPanel({ anchor, onClose }: { anchor: ChromeAnchor; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { setUser } = useCommunityUser();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useDropdownDismiss(true, { refs: [ref], onClose, insideSelector: "[data-menu-anchor]" });
  const scale = getUiScale();
  const vw = window.innerWidth / scale;

  const submit = async () => {
    if (busy || username.trim().length < 3 || password.length < 6) return;
    setBusy(true);
    setError(undefined);
    try {
      const signedIn =
        mode === "login" ? await loginCommunityUser(username, password) : await registerCommunityUser(username, password);
      setUser(signedIn);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Sign in to the library"
      className="mm ml-signpanel ui-zoom"
      style={{ top: anchor.bottom / scale + 2, right: Math.max(2, vw - (anchor.right ?? anchor.left) / scale) }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="ml-sign-title">{mode === "login" ? "Sign in to the library" : "Create a library account"}</div>
        <div className="ml-sign-sub">To share plans and edit your posts</div>
        <label className="ml-sign-label">USERNAME</label>
        <input
          autoFocus
          className="ml-search ml-sign-field"
          placeholder="Username"
          autoComplete="username"
          maxLength={24}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label className="ml-sign-label">PASSWORD</label>
        <input
          className="ml-search ml-sign-field"
          type="password"
          placeholder="Password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <div className="ml-sign-error">{error}</div> : <div className="ml-sign-gap" />}
        <button className="ml-sign-go" type="submit" disabled={busy || username.trim().length < 3 || password.length < 6}>
          {busy ? "..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <div
          className="ml-sign-switch"
          role="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(undefined);
          }}
        >
          {mode === "login" ? "No account yet? Create one" : "Have an account? Sign in"}
        </div>
      </form>
    </div>,
    document.body,
  );
}
