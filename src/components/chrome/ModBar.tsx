"use client";

import "./chrome.css";

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { activateOnKey } from "@/lib/hooks/button-keys";
import { encodePlanCode, planCodeLink } from "@/lib/import-export/plan-code";
import { useIsCompactViewport } from "@/lib/compact-view";
import { usePlanLayout } from "@/components/use-plan-layout";
import { leaveLibrary, openLibrary, useLibraryTab } from "@/lib/library/library-tab";
import { isPowerDisplayUnit, type RateUnit } from "@/lib/model/rate-unit";
import { playBoardSound } from "@/lib/board-sounds";
import { sfxTick } from "@/lib/sound/sfx";
import { useWorkspaceView, writeWorkspaceView } from "@/lib/workspace-view";
import { useFactoryStore } from "@/store/factory-store";
import { useDesignStore } from "@/store/design-store";
import { stampOpened } from "@/lib/library/last-open";
import { ensureInteractionHost } from "@/components/flow/clean/interaction";
import { tipAttrs } from "@/components/flow/clean/interaction";
import { isEditableKeyboardTarget } from "@/components/flow/keyboard";
import { downloadPlanFile } from "@/lib/import-export/open-plan-file";
import { PastePlanDialog } from "@/components/export/PastePlanDialog";
import { arrangeLabel, pressArrange, getBoardCommands, useArrangeState } from "./board-commands";
import { ChromeMenu, chromeAnchorOf, MENU_ANCHOR_ATTR, type ChromeAnchor, type MenuEntry } from "./ChromeMenu";
import { knock, OPEN_FEEDBACK_EVENT, OPEN_TOUR_EVENT, OPEN_CONTROLS_EVENT } from "./chrome-events";
import { ModTabs } from "./ModTabs";
import { PixelBolt, PixelIcon } from "./pixel-icons";
import { ControlsList } from "./ControlsList";
import { HelpLinks } from "./help-links";

/** The rate unit key's four clocks, in the mod's order. */
const RATE_ORDER: RateUnit[] = ["tick", "second", "minute", "hour"];
const RATE_LABEL: Record<string, string> = { tick: "/t", second: "/s", minute: "/min", hour: "/hr", eu: "/s" };

function useHistoryShortcuts() {
  const undo = useFactoryStore((state) => state.undo);
  const redo = useFactoryStore((state) => state.redo);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      // Typing owns its own history: Ctrl+Z in a rename field or note undoes the typing, not the board.
      if (isEditableKeyboardTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y" && !event.shiftKey) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);
}

/** One key of the bar: a label (or a picture), a tip, and the click, right-click and wheel it answers. */
function BarKey({
  id,
  label,
  width,
  tip,
  tipSub,
  icon,
  off,
  open,
  gap,
  onClick,
  onContext,
  onWheel,
  children,
  glyph,
  ariaLabel,
  menuAnchor,
}: {
  id: string;
  label?: string;
  /** The key's width in the mod's GUI pixels: its widest label's width in the game's font, plus 12 (the mod's `fit`). */
  width?: number;
  tip: string;
  tipSub?: string;
  icon?: boolean;
  off?: boolean;
  open?: boolean;
  gap?: boolean;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onContext?: () => void;
  /** +1 for wheel up, -1 for wheel down. */
  onWheel?: (step: number) => void;
  children?: ReactNode;
  glyph?: string;
  ariaLabel?: string;
  menuAnchor?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={off ? -1 : 0}
      aria-label={ariaLabel ?? label ?? id}
      aria-haspopup={menuAnchor ? "menu" : undefined}
      aria-expanded={menuAnchor ? Boolean(open) : undefined}
      onKeyDown={activateOnKey}
      aria-disabled={off || undefined}
      className={gap ? "mb-key mb-gap" : "mb-key"}
      data-mb={id}
      data-icon={icon ? "" : undefined}
      data-off={off ? "" : undefined}
      data-open={open ? "" : undefined}
      data-glyph={glyph}
      {...(menuAnchor ? { [MENU_ANCHOR_ATTR]: "" } : {})}
      style={width ? { width } : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        if (off) return;
        playBoardSound("tick");
        onClick(event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (off || !onContext) return;
        playBoardSound("tick");
        onContext();
      }}
      onWheel={
        onWheel
          ? (event) => {
              if (off || event.deltaY === 0) return;
              onWheel(event.deltaY < 0 ? 1 : -1);
              // A top-bar key the wheel steps too ticks (the mod's WheelKey).
              sfxTick(event.deltaY < 0);
            }
          : undefined
      }
      {...tipAttrs({ id: `bar|${id}`, title: tip, sub: tipSub })}
    >
      {children ?? label}
    </div>
  );
}

export interface ModBarProps {
  /** Opens the share dialog (to the library). */
  onShare: () => void;
  /** Opens the screenshot panel. */
  onScreenshot: () => void;
  /** Opens the settings box. */
  onSettings: () => void;
  /** Opens the release notes. */
  onChangelog: () => void;
  /** Opens the dev menu (shift-click on the help key). */
  onDevMenu: () => void;
  /** The release notes carry something unread. */
  unreadNotes: boolean;
}

/**
 * The top bar, the mod's: the plan tabs take the room the keys leave; the keys come in groups, a gap between each:
 * the non-recipe machines, undo and redo, arrange and fit, the view dials, the library and sharing, then feedback,
 * settings and help.
 */
export function ModBar({ onShare, onScreenshot, onSettings, onChangelog, onDevMenu, unreadNotes }: ModBarProps) {
  useHistoryShortcuts();
  useEffect(() => ensureInteractionHost(), []);
  // The library's "last open" and its most-recent-first order.
  const activeDesignId = useDesignStore((state) => state.activeDesignId);
  useEffect(() => {
    if (activeDesignId) stampOpened(activeDesignId);
  }, [activeDesignId]);
  const canUndo = useFactoryStore((state) => state.undoHistory.length > 0);
  const canRedo = useFactoryStore((state) => state.redoHistory.length > 0);
  const undo = useFactoryStore((state) => state.undo);
  const redo = useFactoryStore((state) => state.redo);
  const rateUnit = useFactoryStore((state) => state.rateUnit);
  const setRateUnit = useFactoryStore((state) => state.setRateUnit);
  const powerDisplayUnit = useFactoryStore((state) => state.powerDisplayUnit);
  const setPowerDisplayUnit = useFactoryStore((state) => state.setPowerDisplayUnit);
  const powerMenuOpen = useFactoryStore((state) => state.powerMenuOpen);
  const openPowerMenu = useFactoryStore((state) => state.openPowerMenu);
  const closePowerMenu = useFactoryStore((state) => state.closePowerMenu);
  const workspace = useWorkspaceView();
  // A phone: the two side columns are drawers over the board, one at a time; their keys sit first in the bar.
  const compact = useIsCompactViewport();
  const planLayout = usePlanLayout();
  const bothOpen = workspace.leftPanelOpen && workspace.rightPanelOpen;
  const itemsOpen = workspace.leftPanelOpen && !bothOpen;
  const sideOpen = workspace.rightPanelOpen && !bothOpen;
  const library = useLibraryTab();
  const arrange = useArrangeState();
  const isReadOnly = useFactoryStore((state) => state.isReadOnly);
  const [menu, setMenu] = useState<{ kind: "share" | "help"; anchor: ChromeAnchor }>();
  const [pasting, setPasting] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const closeMenu = useCallback(() => setMenu(undefined), []);

  // The power unit comes back from storage (the old toolbar restored it; it is gone from plan boards).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gtnh-factory-flow.power-display-unit.v1");
      // A tier saved by the older global unit becomes the mod's per-machine Amps.
      if (isPowerDisplayUnit(saved)) setPowerDisplayUnit(saved === "eu" ? "eu" : "amps");
    } catch {
      /* EU/t when storage is unavailable. */
    }
  }, [setPowerDisplayUnit]);

  // Other parts of the app open the controls list through its door.
  useEffect(() => {
    const open = (event: Event) => {
      event.preventDefault();
      setControlsOpen(true);
    };
    window.addEventListener(OPEN_CONTROLS_EVENT, open);
    return () => window.removeEventListener(OPEN_CONTROLS_EVENT, open);
  }, []);

  const rateIndex = Math.max(0, RATE_ORDER.indexOf(rateUnit === "eu" ? "second" : rateUnit));
  const stepRate = (step: number) => {
    const next = RATE_ORDER[(rateIndex + step + RATE_ORDER.length) % RATE_ORDER.length];
    setRateUnit(next);
  };

  const isAmps = powerDisplayUnit !== "eu";
  const togglePower = () => {
    if (isAmps) {
      setPowerDisplayUnit("eu");
    } else {
      // The mod's Amps: every card counts in its own machine's tier.
      setPowerDisplayUnit("amps");
    }
  };

  const peak = !workspace.averageMachineDraw;
  const togglePeak = () => writeWorkspaceView({ averageMachineDraw: peak });

  const copyPlanCode = async () => {
    try {
      const code = await encodePlanCode(useFactoryStore.getState().project);
      await copyToClipboard(planCodeLink(code, window.location.origin));
    } catch (error) {
      console.error(error);
    }
  };

  const linkedPost = useFactoryStore((state) => state.project.metadata?.communityPlanId);

  const shareEntries: MenuEntry[] = [
    { label: linkedPost ? "Update in library..." : "Share to library...", onSelect: onShare, disabled: isReadOnly },
    { label: "Copy plan code", onSelect: () => void copyPlanCode() },
    { label: "Export plan file (.json)", onSelect: () => downloadPlanFile(useFactoryStore.getState().project) },
    { label: "Screenshot...", onSelect: onScreenshot },
  ];

  const openMenuFrom = (kind: "share" | "help", event: MouseEvent<HTMLElement>) => {
    const anchor = chromeAnchorOf(event.currentTarget);
    setMenu((current) => (current?.kind === kind ? undefined : { kind, anchor }));
  };

  return (
    <>
      <header className="mb" data-mod-bar="" data-help-anchor="plan-actions">
      <ModTabs onPaste={() => setPasting(true)} onShare={onShare} />
      {compact ? (
        <>
          <BarKey
            id="drawer-side"
            label={planLayout ? "Overview" : "Resources"}
            tip={planLayout ? "Overview: inputs, outputs and machines" : "Resources"}
            open={sideOpen}
            onClick={() =>
              writeWorkspaceView(sideOpen ? { rightPanelOpen: false } : { rightPanelOpen: true, leftPanelOpen: false })
            }
          />
          <BarKey
            id="drawer-items"
            label="Items"
            tip="Items: search and place recipes"
            open={itemsOpen}
            onClick={() =>
              writeWorkspaceView(itemsOpen ? { leftPanelOpen: false } : { leftPanelOpen: true, rightPanelOpen: false })
            }
          />
        </>
      ) : null}
      <BarKey
        id="nonrecipe"
        gap
        glyph="bolt"
        width={78}
        ariaLabel="Non-recipe machines"
        tip="Non-recipe machines: generators, turbines, boilers, reactors"
        open={powerMenuOpen}
        off={isReadOnly}
        onClick={() => {
          // The key opens the picker and closes it again.
          if (powerMenuOpen) closePowerMenu();
          else {
            leaveLibrary();
            openPowerMenu();
          }
        }}
        menuAnchor
      >
        <PixelBolt className="mb-bolt" />
        Non-recipe
      </BarKey>
      <BarKey
        id="undo"
        gap
        icon
        off={!canUndo || isReadOnly}
        ariaLabel="Undo"
        tip="Undo (Ctrl+Z)"
        onClick={() => undo()}
      >
        <PixelIcon name="undo" />
      </BarKey>
      <BarKey
        id="redo"
        icon
        off={!canRedo || isReadOnly}
        ariaLabel="Redo"
        tip="Redo (Ctrl+Shift+Z or Ctrl+Y)"
        onClick={() => redo()}
      >
        <PixelIcon name="undo" mirror />
      </BarKey>
      <BarKey
        id="arrange"
        gap
        label={arrangeLabel(arrange)}
        width={90}
        tip="Auto-arrange the plan (press again to stop)"
        off={isReadOnly}
        onClick={() => pressArrange()}
      />
      <BarKey id="fit" label="Fit" width={24} tip="Zoom to fit the whole plan" onClick={() => getBoardCommands()?.fit()} />
      <BarKey
        id="rate"
        gap
        label={RATE_LABEL[rateUnit] ?? "/s"}
        width={32}
        tip="Rate unit: per tick, second, minute or hour"
        onClick={() => stepRate(1)}
        onContext={() => stepRate(-1)}
        onWheel={stepRate}
      />
      <BarKey
        id="power"
        label={isAmps ? "Amps" : "EU/t"}
        width={36}
        tip="Show power as EU/t, or as amps at each machine's tier"
        onClick={togglePower}
        onContext={togglePower}
        onWheel={togglePower}
      />
      <BarKey
        id="peak"
        label={peak ? "Peak" : "Avg"}
        width={35}
        tip="Average or peak power use (peak: every machine running at once)"
        onClick={togglePeak}
        onContext={togglePeak}
        onWheel={togglePeak}
      />
      <BarKey
        id="library"
        gap
        label={library.active ? "Board" : "Library"}
        width={50}
        tip="Library: your plans, and plans other players shared"
        onClick={() => (library.active ? leaveLibrary() : openLibrary())}
      />
      <BarKey
        id="share"
        label="Share"
        width={42}
        tip="Share this plan: to the library, as a code or as a picture"
        open={menu?.kind === "share"}
        onClick={(event) => openMenuFrom("share", event)}
        menuAnchor
      />
      <BarKey
        id="feedback"
        gap
        icon
        ariaLabel="Feedback"
        tip="Feedback: report a bug, share an idea, or ask for help"
        onClick={() => {
          if (!knock(OPEN_FEEDBACK_EVENT)) window.open(HelpLinks.bugReport, "_blank", "noopener,noreferrer");
        }}
      >
        <PixelIcon name="bug" className="mb-bug" />
      </BarKey>
      <BarKey id="settings" icon ariaLabel="Settings" tip="Settings" onClick={onSettings}>
        <PixelIcon name="gear" />
      </BarKey>
      <BarKey
        id="help"
        icon
        ariaLabel="Help"
        tip="Help: the tour, and every control"
        open={menu?.kind === "help"}
        onClick={(event) => {
          if (event.shiftKey) {
            onDevMenu();
            return;
          }
          openMenuFrom("help", event);
        }}
        menuAnchor
      >
        <PixelIcon name="help" />
      </BarKey>
      {menu?.kind === "share" ? (
        <ChromeMenu anchor={menu.anchor} entries={shareEntries} label="Share this plan" minWidth={110} align="right" onClose={closeMenu} />
      ) : null}
      {menu?.kind === "help" ? (
        <ChromeMenu
          anchor={menu.anchor}
          entries={helpEntries({
            onChangelog,
            unreadNotes,
            openControls: () => setControlsOpen(true),
          })}
          label="Help"
          minWidth={190}
          align="right"
          onClose={closeMenu}
        />
      ) : null}
      {controlsOpen ? <ControlsList onClose={() => setControlsOpen(false)} /> : null}
      </header>
      {/* Outside the bar: its stacking context (z 30) would put the box under the side columns and drawers. */}
      {pasting ? <PastePlanDialog onClose={() => setPasting(false)} /> : null}
    </>
  );
}

function helpEntries({
  onChangelog,
  unreadNotes,
  openControls,
}: {
  onChangelog: () => void;
  unreadNotes: boolean;
  openControls: () => void;
}): MenuEntry[] {
  return [
    {
      label: "Take the tour",
      detail: "3 minutes",
      onSelect: () => {
        // The tour lives in its own package; with nothing listening yet the knock goes unanswered.
        knock(OPEN_TOUR_EVENT);
      },
    },
    { label: "Controls and shortcuts", onSelect: openControls },
    { label: "Welcome", ruleAbove: true, onSelect: () => HelpLinks.openWelcome() },
    { label: unreadNotes ? "What's new *" : "What's new", detail: HelpLinks.version, onSelect: onChangelog },
    { label: "Download the mod", detail: "GTNH 2.9", onSelect: () => HelpLinks.open(HelpLinks.mod) },
    { label: "Source on GitHub", onSelect: () => HelpLinks.open(HelpLinks.github) },
    { label: "Discord thread", onSelect: () => HelpLinks.open(HelpLinks.discord) },
    { label: "Support on Ko-fi", onSelect: () => HelpLinks.open(HelpLinks.kofi) },
  ];
}
