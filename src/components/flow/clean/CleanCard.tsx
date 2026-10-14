"use client";

import "./clean.css";

import { Handle, Position } from "@xyflow/react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type WheelEvent } from "react";
import { Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { fluidArtPixels, isSwatchFluid, ResourceIcon } from "@/components/nei/ResourceIcon";
import { type BrowseMode as PortBrowseMode } from "@/components/browse-menu";
import { useFactoryStore } from "@/store/factory-store";
import { buildPortFlowScope } from "../flow-scope";
import { usePortRowBrowse } from "../use-port-row-browse";
import { isWiringConnection } from "../connection-drag";
import { useMachineHandlerIcons, useRecipeMapIcons } from "../machine-icons";
import { MachineMenu } from "../MachinePicker";
import { MenuShell } from "../EnergyHatchMenu";
import { checklistLocked } from "../RecipeNode";
import type { CleanCardActions, CleanCardContext, CleanCardView, CleanChipView, CleanPortView } from "./clean-model";
import { tierChipColors } from "./tokens";
import { ensureInteractionHost, useClickSlop, tipAttrs, type TipSpec } from "./interaction";
import { PortRateControls } from "./interaction/PortRateControls";
import {
  countTip,
  forcedTip,
  gearTip,
  menuTip,
  nameTip,
  portTip,
  powerPanelTip,
  powerTip,
  stripChipTip,
  tierTip,
} from "./interaction/tips";
import { openSparePopupForPort } from "./rail/SparePopup";
import { makePortKey } from "@/lib/solver/plan/port-key";

function glyph(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

/** One input or output row. A component of its own so hover scope and resource lighting re-render only it. */
export function CleanPortRow({
  p,
  wasClick,
  unset = false,
}: {
  p: CleanPortView;
  wasClick: (event: MouseEvent) => boolean;
  unset?: boolean;
}) {
  const browseResource = useFactoryStore((state) => state.browseResource);
  const setHoveredFlowScope = useFactoryStore((state) => state.setHoveredFlowScope);
  const readOnly = useFactoryStore((state) => state.isReadOnly);
  const scopeLit = useFactoryStore((state) => Boolean(state.hoveredFlowScope?.ports[`${p.nodeId}|${p.handleId}`]));
  const resourceLit = useFactoryStore(
    (state) => (state.hoveredFlowResourceKey ?? state.selectedFlowResourceKey) === p.resourceKey,
  );
  const { port } = p;
  const isInput = p.side === "input";
  const browse = (mode: PortBrowseMode) => {
    if (port.kind === "power") return;
    browseResource(
      {
        kind: port.kind,
        id: port.resourceId,
        displayName: port.resource?.displayName ?? port.displayName,
        iconPath: port.resource?.iconPath,
        iconAtlas: port.resource?.iconAtlas,
        dominantColor: port.resource?.dominantColor ?? port.resource?.iconAtlas?.dominantColor,
        anchorNodeId: p.nodeId,
      },
      mode,
    );
  };
  const rowBrowse = usePortRowBrowse({ nodeId: p.nodeId, port, browse });
  const lit = scopeLit || resourceLit;
  const iconProps = {
    itemZoom: 1.5,
    bare: true,
    tooltip: false,
    showAmount: false,
    showConsumedState: false,
    iconPixelSize:
      port.kind === "fluid" && port.resource
        ? isSwatchFluid(port.resource)
          ? 50
          : fluidArtPixels(32)
        : undefined,
  } as const;

  if (port.free) {
    // The game gives this one away: shown so it is set down beside the machine, nothing to wire.
    return (
      <div className="cc-row" data-side={p.side} title={`${p.name}: free input, no supply needed`} style={{ opacity: 0.6 }}>
        {port.resource ? <ResourceIcon {...iconProps} resource={{ ...port.resource, amount: 1, chance: undefined }} className="cc-icon" /> : null}
        <span className="cc-num" data-small="" data-unit="">
          free
        </span>
        <span className="cc-pname" data-small={p.nameSmall || undefined} data-clip={p.nameClipped || undefined}>
          {p.name}
        </span>
      </div>
    );
  }

  return (
    <div
      className="cc-row"
      data-port=""
      data-side={p.side}
      data-wired={p.wired ? "true" : "false"}
      data-open={!p.wired && !p.zero ? "" : undefined}
      data-lit={lit ? "" : undefined}
      data-forced={p.forced ? "" : undefined}
      data-choice={p.choice ? "" : undefined}
      data-resource-edge-anchor="true"
      data-resource-node-id={p.nodeId}
      data-resource-handle-id={p.handleId}
      {...tipAttrs(portTip(p))}
      onPointerEnter={() => {
        rowBrowse.handlers.onPointerEnter();
        if (!isWiringConnection() && !checklistLocked()) {
          setHoveredFlowScope(buildPortFlowScope(useFactoryStore.getState().project, p.nodeId, port));
        }
      }}
      onPointerLeave={() => {
        rowBrowse.handlers.onPointerLeave();
        setHoveredFlowScope(undefined);
      }}
      onPointerDown={rowBrowse.handlers.onPointerDown}
      onPointerMove={rowBrowse.handlers.onPointerMove}
      onPointerUp={rowBrowse.handlers.onPointerUp}
      onPointerCancel={rowBrowse.handlers.onPointerCancel}
      onClick={(event) => {
        if (wasClick(event)) rowBrowse.handlers.onClick(event);
      }}
      onContextMenu={rowBrowse.handlers.onContextMenu}
    >
      {p.forced ? (
        <div className="cc-line">
          <Words p={p} iconProps={iconProps} />
        </div>
      ) : (
        <Words p={p} iconProps={iconProps} />
      )}
      {p.forced ? (
        <div
          className="cc-forced"
          data-kind={isInput ? "in" : "out"}
          {...tipAttrs(forcedTip(p))}
          onClick={(event) => {
            // A leftover with somewhere else to go opens its split (rail/SparePopup.tsx).
            if (wasClick(event) && openSparePopupForPort(makePortKey(p.nodeId, isInput ? "i" : "o", p.handleId), event.clientX, event.clientY)) {
              event.stopPropagation();
            }
          }}
        >
          {port.resource ? (
            <ResourceIcon {...iconProps} resource={{ ...port.resource, amount: 1, chance: undefined }} className="cc-icon" />
          ) : null}
          <span className="cc-num" data-unit={p.forced.unit}>
            {p.forced.number}
          </span>
          <span className="cc-pname">Forced</span>
        </div>
      ) : null}
      {!p.wired && !p.forced ? <PortRateControls p={p} unset={unset} wasClick={wasClick} /> : null}
      <Handle
        id={p.handleId}
        type={isInput ? "target" : "source"}
        position={isInput ? Position.Left : Position.Right}
        data-resource-handle="true"
        data-resource-node-id={p.nodeId}
        data-resource-handle-id={p.handleId}
        aria-label={`${isInput ? "Input" : "Output"}: ${p.name}${readOnly ? "" : ". Left click or R for recipes, right click or U for uses, drag to connect"}`}
        className={[
          "resource-slot-handle nodrag !absolute !left-0 !right-auto !top-0 !z-30 !h-full !w-full !min-w-0 !translate-x-0 !translate-y-0",
          "!rounded-none !border-0 !bg-transparent !opacity-0",
          readOnly ? "cursor-default" : "cursor-crosshair",
        ].join(" ")}
      />
      {rowBrowse.menu}
    </div>
  );
}

/** Icon, figure, name: the three things a row says. */
function Words({ p, iconProps }: { p: CleanPortView; iconProps: Record<string, unknown> }) {
  const { port } = p;
  return (
    <>
      {port.resource ? (
        <ResourceIcon
          {...(iconProps as object)}
          resource={{ ...port.resource, amount: 1, chance: undefined }}
          className="cc-icon"
        />
      ) : null}
      <span
        className="cc-num"
        data-unit={p.unit}
        data-zero={p.zero ? "" : undefined}
        data-gold={p.gold ? "" : undefined}
        data-small={p.numberSmall ? "" : undefined}
      >
        {p.number}
      </span>
      <span className="cc-pname" data-small={p.nameSmall || undefined} data-clip={p.nameClipped || undefined}>
        {p.name}
      </span>
    </>
  );
}

function CountBox({
  view,
  tip,
  onSet,
  wasClick,
}: {
  view: CleanCardView["count"];
  tip: TipSpec;
  onSet: (count: number | undefined) => void;
  wasClick: (event: MouseEvent) => boolean;
}) {
  const [draft, setDraft] = useState<string>();
  const editing = draft !== undefined;
  const commit = () => {
    if (draft === undefined) return;
    const text = draft.trim();
    setDraft(undefined);
    if (text === "") {
      onSet(undefined);
      return;
    }
    const value = Number.parseFloat(text.replace(/^×/, ""));
    if (Number.isFinite(value) && value > 0) onSet(value);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className="cc-count nowheel"
      data-pinned={view.pinned ? "" : undefined}
      data-zero={view.zero ? "" : undefined}
      data-prompt={view.note === "(set count)" ? "" : undefined}
      data-editing={editing ? "" : undefined}
      data-note={view.note}
      {...tipAttrs(tip)}
      onClick={(event) => {
        glyph(event);
        if (!editing && wasClick(event)) {
          setDraft(view.pinned ? String(view.value) : "");
        }
      }}
      onWheel={(event: WheelEvent) => {
        if (checklistLocked()) return;
        event.stopPropagation();
        const base = view.pinned ? view.value : Math.max(1, Math.ceil(view.value));
        const next = Math.round(base) + (event.deltaY < 0 ? 1 : -1);
        onSet(next >= 1 ? next : undefined);
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          inputMode="decimal"
          aria-label="Pinned machine count"
          className="nodrag"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onFocus={(event) => event.currentTarget.select()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(undefined);
            event.stopPropagation();
          }}
        />
      ) : (
        view.text
      )}
    </div>
  );
}

function TierChip({
  label,
  tip,
  fixed,
  onStep,
  wasClick,
  extraData,
}: {
  label: string;
  tip: TipSpec;
  fixed?: boolean;
  onStep: (direction: -1 | 1) => void;
  wasClick: (event: MouseEvent) => boolean;
  extraData?: Record<string, string>;
}) {
  const colors = tierChipColors(label);
  const style = colors
    ? ({
        "--chip-bg": colors.background,
        "--chip-border": colors.border,
        "--chip-ink": colors.ink,
        "--chip-hover": colors.hover,
        "--chip-pressed": colors.pressed,
      } as CSSProperties)
    : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      className="cc-chip nowheel"
      style={style}
      {...tipAttrs(tip)}
      aria-label={`Tier ${label}`}
      data-hatch-menu-anchor=""
      data-fixed={fixed ? "" : undefined}
      data-underline={colors?.underline ? "" : undefined}
      {...extraData}
      onClick={(event) => {
        glyph(event);
        if (!fixed && wasClick(event)) onStep(1);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        glyph(event);
        if (!fixed) onStep(-1);
      }}
      onWheel={(event) => {
        if (checklistLocked()) return;
        event.stopPropagation();
        if (!fixed) onStep(event.deltaY < 0 ? 1 : -1);
      }}
    >
      {label}
    </div>
  );
}

function AmpsChip({
  amps,
  tier,
  tip,
  onSet,
  wasClick,
}: {
  amps: NonNullable<CleanCardView["amps"]>;
  tier?: string;
  tip: TipSpec;
  onSet: (value: number) => void;
  wasClick: (event: MouseEvent) => boolean;
}) {
  const [draft, setDraft] = useState<string>();
  const colors = tier ? tierChipColors(tier) : undefined;
  const style = colors
    ? ({
        "--chip-bg": colors.background,
        "--chip-border": colors.border,
        "--chip-ink": colors.ink,
        "--chip-hover": colors.hover,
        "--chip-pressed": colors.pressed,
      } as CSSProperties)
    : undefined;
  const commit = () => {
    if (draft === undefined) return;
    const value = Number.parseFloat(draft);
    setDraft(undefined);
    if (Number.isFinite(value) && value >= 1) onSet(value);
  };
  const step = (event: WheelEvent) => {
    if (checklistLocked()) return;
    event.stopPropagation();
    const unit = event.ctrlKey && event.shiftKey ? 1000 : event.ctrlKey ? 10 : 1;
    if (event.shiftKey && !event.ctrlKey) {
      onSet(event.deltaY < 0 ? amps.value * 4 : Math.max(1, Math.floor(amps.value / 4)));
      return;
    }
    onSet(Math.max(1, amps.value + (event.deltaY < 0 ? unit : -unit)));
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className="cc-chip nowheel"
      style={{ ...style, minWidth: 50, width: "max-content" }}
      {...tipAttrs(tip)}
      onClick={(event) => {
        glyph(event);
        if (draft === undefined && wasClick(event)) setDraft(String(amps.value));
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        glyph(event);
        onSet(Math.max(1, amps.value - 1));
      }}
      onWheel={step}
    >
      {draft === undefined ? (
        amps.label
      ) : (
        <input
          autoFocus
          value={draft}
          inputMode="numeric"
          aria-label="Amps"
          className="nodrag"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onFocus={(event) => event.currentTarget.select()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(undefined);
            event.stopPropagation();
          }}
        />
      )}
    </div>
  );
}

function StripChip({
  chip,
  nodeId,
  onStep,
  wasClick,
}: {
  chip: CleanChipView;
  nodeId: string;
  onStep: (id: string, direction: -1 | 1) => void;
  wasClick: (event: MouseEvent) => boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="cc-sc nowheel"
      data-label={chip.label}
      data-warn={chip.warn ? "" : undefined}
      data-reading={chip.reading ? "" : undefined}
      {...tipAttrs(stripChipTip(nodeId, chip))}
      style={{
        left: chip.x,
        top: chip.y,
        width: chip.width,
        ...(chip.icon ? { backgroundImage: `url(${chip.icon})`, paddingLeft: 22 } : undefined),
      }}
      onClick={(event) => {
        glyph(event);
        if (!chip.reading && wasClick(event)) onStep(chip.id, 1);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        glyph(event);
        if (!chip.reading) onStep(chip.id, -1);
      }}
      onWheel={(event) => {
        if (chip.reading || checklistLocked()) return;
        event.stopPropagation();
        onStep(chip.id, event.deltaY < 0 ? 1 : -1);
      }}
    >
      {chip.value}
    </div>
  );
}

export interface CleanCardProps {
  view: CleanCardView;
  actions: CleanCardActions;
  context: CleanCardContext;
  /** The raw recipe and node, for the machine list and the card menu. */
  recipe: Recipe;
  node: FactoryNode;
}

/** The clean recipe card: header, hairline, port rails around the picture, power row, settings strip. */
export function CleanCard({ view, actions, context, recipe, node }: CleanCardProps) {
  const { wasClick, onPointerDownCapture } = useClickSlop();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => ensureInteractionHost(), []);
  // Every prompt on the board shares one phase however late it mounted.
  useEffect(() => {
    if (!view.unset) return;
    for (const animation of rootRef.current?.getAnimations?.({ subtree: true }) ?? []) {
      if ((animation as CSSAnimation).animationName === "cc-prompt") animation.startTime = 0;
    }
  }, [view.unset]);
  const machineIcons = useMachineHandlerIcons();
  const mapIcons = useRecipeMapIcons();
  const deleteNode = useFactoryStore((state) => state.deleteNode);
  const duplicateNode = useFactoryStore((state) => state.duplicateNode);
  const beginRecipeRefactor = useFactoryStore((state) => state.beginRecipeRefactor);
  const browseMachineRecipes = useFactoryStore((state) => state.browseMachineRecipes);
  const [listOpen, setListOpen] = useState(false);
  const [menu, setMenu] = useState<{ kind: "actions" | "settings"; x: number; top: number; bottom: number; hangsFrom?: Element }>();

  const openMenu = (kind: "actions" | "settings") => (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (!wasClick(event)) return;
    const card = event.currentTarget.closest("[data-node-glance-root]") ?? undefined;
    const r = (card ?? event.currentTarget).getBoundingClientRect();
    setMenu(menu?.kind === kind ? undefined : { kind, x: r.left, top: r.top, bottom: r.bottom, hangsFrom: card });
  };


  return (
    <div
      ref={rootRef}
      className="cc-card"
      data-node-glance-root=""
      data-selected={view.selected ? "" : undefined}
      data-cannot-run={view.cannotRun ? "" : undefined}
      data-unset={view.unset ? "" : undefined}
      onPointerDownCapture={onPointerDownCapture}
    >
      <div className="cc-head">
        <div
          role="button"
          tabIndex={0}
          className="cc-key"
          data-glyph="menu"
          data-hatch-menu-anchor=""
          aria-label="Card actions"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === "actions"}
          {...tipAttrs(menuTip(view.nodeId))}
          onClick={openMenu("actions")}
        />
        <div
          role="button"
          tabIndex={0}
          className="cc-key"
          data-glyph="gear"
          data-hatch-menu-anchor=""
          data-warn={undefined}
          aria-label="Machine settings"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === "settings"}
          {...tipAttrs(gearTip(view.nodeId))}
          onClick={openMenu("settings")}
        />
        <div
          role={view.hasPicker ? "button" : undefined}
          tabIndex={view.hasPicker ? 0 : undefined}
          className={view.hasPicker ? "cc-name nowheel" : "cc-name"}
          style={{ "--cc-name-size": `${view.nameSize}px` } as CSSProperties}
          data-picker={view.hasPicker ? "" : undefined}
          data-open={listOpen ? "" : undefined}
          data-clip={view.nameSize <= 9 ? "" : undefined}
          data-machine-menu-toggle={view.hasPicker ? "" : undefined}
          data-wheel-steps={view.hasPicker ? "" : undefined}
          {...tipAttrs(nameTip(view))}
          onClick={
            view.hasPicker
              ? (event) => {
                  glyph(event);
                  if (wasClick(event)) setListOpen((open) => !open);
                }
              : undefined
          }
          onWheel={
            view.hasPicker
              ? (event) => {
                  if (checklistLocked()) return;
                  event.stopPropagation();
                  actions.cycleMachine(event.deltaY < 0 ? -1 : 1);
                }
              : undefined
          }
        >
          {view.name}
          {listOpen ? (
            <MachineMenu
              recipe={recipe}
              node={node}
              handlers={context.machineHandlers}
              selectedId={context.selectedMachineHandler.id}
              iconsById={machineIcons}
              onHover={() => undefined}
              onUse={(id) => {
                actions.switchMachine(id);
                setListOpen(false);
              }}
              onClose={() => setListOpen(false)}
              mapIcons={mapIcons}
              figures
            />
          ) : null}
        </div>
        {view.amps ? (
          <AmpsChip
            amps={view.amps}
            tier={view.tier?.label}
            tip={powerPanelTip(view, "amps")}
            onSet={actions.setAmps}
            wasClick={wasClick}
          />
        ) : null}
        {view.tier ? (
          <TierChip
            label={view.tier.label}
            tip={view.amps ? powerPanelTip(view, "tier") : tierTip(view)}
            fixed={view.tier.fixed}
            onStep={actions.stepTier}
            wasClick={wasClick}
          />
        ) : null}
      </div>

      <div className="cc-rail" data-side="input">
        {view.inputs.map((p) => (
          <CleanPortRow key={p.key} p={p} wasClick={wasClick} unset={view.unset} />
        ))}
        {view.power ? (
          <div
            className="cc-row"
            data-power=""
            data-side="input"
            data-stalled={view.power.stalled ? "" : undefined}
            {...tipAttrs(view.amps ? powerPanelTip(view, "power") : powerTip(view))}
          >
            <span className="cc-bolt" />
            <span className="cc-num" data-unit={view.power.unit}>
              {view.power.number}
            </span>
            <span className="cc-pname">{view.power.name}</span>
          </div>
        ) : null}
      </div>

      <div className="cc-pic">
        {view.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cc-art" src={view.art} alt="" draggable={false} />
        ) : context.machineIcon?.iconPath || context.machineIcon?.iconAtlas ? (
          <ResourceIcon
            resource={{
              kind: "item",
              id: context.machineIcon.id,
              amount: 1,
              displayName: context.machineIcon.displayName ?? context.machineIcon.id,
              iconPath: context.machineIcon.iconPath,
              iconAtlas: context.machineIcon.iconAtlas,
              dominantColor: context.machineIcon.dominantColor,
            }}
            bare
            tooltip={false}
            showAmount={false}
            showConsumedState={false}
            iconPixelSize={109}
            className="cc-machine"
          />
        ) : null}
        {view.circuit ? (
          view.circuit.resource ? (
            <ResourceIcon
              itemZoom={1.5}
              resource={{ ...view.circuit.resource, amount: 1, chance: undefined }}
              bare
              tooltip={false}
              showAmount={false}
              showConsumedState={false}
              className="cc-circuit"
            />
          ) : null
        ) : null}
        <CountBox view={view.count} tip={countTip(view)} onSet={actions.setCount} wasClick={wasClick} />
      </div>

      <div className="cc-rail" data-side="output">
        {view.outputs.map((p) => (
          <CleanPortRow key={p.key} p={p} wasClick={wasClick} unset={view.unset} />
        ))}
      </div>

      {view.chips.length > 0 ? (
        <div className="cc-strip" style={{ height: view.stripHeight }}>
          {view.chips.map((chip) => (
            <StripChip key={chip.id} chip={chip} nodeId={view.nodeId} onStep={actions.stepSetting} wasClick={wasClick} />
          ))}
        </div>
      ) : null}

      <div
        className="cc-glance"
        data-node-detail="glance"
        data-count={view.count.text}
        aria-hidden
        style={view.glanceArt ? { backgroundImage: `url(${view.glanceArt})` } : undefined}
      />

      {menu ? (
        <MenuShell anchor={menu} align="left" width={224} maxHeight={280} onClose={() => setMenu(undefined)}>
          <div role="menu" aria-label={menu.kind === "actions" ? "Card actions" : "Machine settings"} className="text-[13px] leading-[18px]">
            {(menu.kind === "actions"
              ? [
                  { label: "Clone node", icon: Copy, run: () => duplicateNode(node.id) },
                  { label: "Replace the recipe", icon: RefreshCw, run: () => beginRecipeRefactor(node.id) },
                  { label: "Add another recipe", icon: Plus, run: () => browseMachineRecipes(node.id) },
                  { label: "Delete node", icon: Trash2, run: () => deleteNode(node.id) },
                ].map(({ label, icon: Icon, run }) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(undefined);
                      run();
                    }}
                    className="flex min-h-8 w-full items-center gap-2 px-2 py-1.5 text-left text-[var(--mc-ink)] hover:bg-[var(--mc-93)] focus-visible:bg-[var(--mc-93)] focus-visible:outline-none"
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="min-w-0">{label}</span>
                  </button>
                ))
              : context.settings.length > 0
                ? context.settings.map((setting) => (
                    <button
                      key={setting.id}
                      type="button"
                      role="menuitem"
                      disabled={!setting.steps}
                      onClick={() => actions.stepSetting(setting.id, 1)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        actions.stepSetting(setting.id, -1);
                      }}
                      className="flex min-h-8 w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[var(--mc-ink)] hover:bg-[var(--mc-93)] focus-visible:outline-none"
                    >
                      <span className="min-w-0 truncate">{setting.label}</span>
                      <span className="shrink-0 text-[var(--mc-ink-muted)]">{setting.value}</span>
                    </button>
                  ))
                : [<div key="none" className="px-2 py-2 text-[var(--mc-ink-muted)]">This machine has no settings.</div>])}
          </div>
        </MenuShell>
      ) : null}
    </div>
  );
}
