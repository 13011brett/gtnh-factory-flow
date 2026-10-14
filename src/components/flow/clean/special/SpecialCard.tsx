"use client";

import "../clean.css";
import "./special.css";

import { Handle, Position } from "@xyflow/react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { ResourceIcon } from "@/components/nei/ResourceIcon";
import { useFactoryStore } from "@/store/factory-store";
import { useMachineHandlerIcons, useRecipeMapIcons } from "../../machine-icons";
import { MachineMenu } from "../../MachinePicker";
import { MenuShell } from "../../EnergyHatchMenu";
import { CropPickerMenu } from "../../CropPickerMenu";
import { checklistLocked } from "../../RecipeNode";
import { CountBox, CleanPortRow, StripChip, TierChip, AmpsChip, glyph } from "../CleanCard";
import type { CleanCardView, CleanChipView } from "../clean-model";
import { ensureInteractionHost, tipAttrs, useClickSlop, type TipSpec } from "../interaction";
import { countTip, gearTip, menuTip, powerTip, tierTip } from "../interaction/tips";
import type { SpecialActions, SpecialContext, SpecialModel } from "./use-special";
import type { SpecialChip, SpecialSection, SpecialView } from "./special-model";

/** The bolt-box and the gauge, as pixel runs (the mod's `PowerPicker.bolt` and `gauge`), drawn once as data URIs. */
function runsSvg(runs: number[][], width: number, height: number, fill: string): string {
  const rects = runs
    .map(([x, y, w]) => `<rect x='${x}' y='${y}' width='${w}' height='1'/>`)
    .join("");
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' shape-rendering='crispEdges' fill='${fill}'>${rects}</svg>`)}")`;
}
const GAUGE_RUNS = [
  [2, 0, 5],
  [1, 1, 1],
  [7, 1, 1],
  [0, 2, 1],
  [6, 2, 1],
  [8, 2, 1],
  [0, 3, 1],
  [5, 3, 1],
  [8, 3, 1],
  [0, 4, 1],
  [4, 4, 1],
  [8, 4, 1],
  [0, 5, 1],
  [3, 5, 2],
  [8, 5, 1],
  [1, 6, 1],
  [7, 6, 1],
];
export const GAUGE_URL = runsSvg(GAUGE_RUNS, 9, 8, "#AEBCEB");

function dataKindOf(view: SpecialView): string {
  return view.kind;
}

/** A section's rule: its share of the machine's time on the left, its circuit and keys on the right. */
function SectionRule({
  view,
  section,
  row,
  actions,
  wasClick,
}: {
  view: SpecialView;
  section: SpecialSection;
  row: number;
  actions: SpecialActions;
  wasClick: (event: MouseEvent) => boolean;
}) {
  const rule = section.rule!;
  const key = (
    kind: "up" | "down" | "off",
    enabled: boolean,
    label: string,
    run: () => void,
    note?: string,
  ) => (
    <div
      role="button"
      tabIndex={enabled ? 0 : -1}
      className="cs-rk nowheel"
      data-kind={kind}
      data-disabled={enabled ? undefined : ""}
      aria-label={label}
      aria-disabled={!enabled}
      {...tipAttrs({
        id: `${view.nodeId}|rule|${section.section}|${kind}`,
        title: label,
        notes: note ? [{ text: note, tone: "muted" }] : [],
      })}
      onClick={(event) => {
        glyph(event);
        if (enabled && wasClick(event)) run();
      }}
    />
  );
  return (
    <div
      className="cs-rule"
      style={{ gridRow: row }}
      data-first={section.section === 0 ? "" : undefined}
    >
      <span className="cs-pct">{rule.pct}</span>
      <span className="cs-word" data-unused={rule.unused ? "" : undefined}>
        {rule.word}
      </span>
      {rule.circuit ? (
        <span
          className="cs-circ"
          {...tipAttrs({
            id: `${view.nodeId}|circuit|${section.section}`,
            title: "Programmed circuit",
            notes: [{ text: "Not consumed.", tone: "muted" }],
          })}
        >
          {rule.circuit.resource ? (
            <ResourceIcon
              itemZoom={1.5}
              resource={{ ...rule.circuit.resource, amount: 1, chance: undefined }}
              bare
              tooltip={false}
              showAmount={false}
              showConsumedState={false}
              className="cs-circuit"
            />
          ) : null}
        </span>
      ) : null}
      {key("up", rule.canUp, "Move this recipe up", () => actions.moveSection(section.section, -1))}
      {key("down", rule.canDown, "Move this recipe down", () =>
        actions.moveSection(section.section, 1),
      )}
      {key(
        "off",
        true,
        "Take this recipe off the machine",
        () => actions.removeSection(section.section),
        "Its wires are removed too.",
      )}
    </div>
  );
}

/** The two dashed boxes of a holder with nothing on it: a wire dropped on either makes the card take its resource. */
function Sockets({ view }: { view: SpecialView }) {
  const sockets = view.sockets!;
  const one = (side: "input" | "output", label: string, handle: string, hint: string) => (
    <div
      className="cs-socket"
      data-side={side}
      data-resource-edge-anchor="true"
      data-resource-node-id={view.nodeId}
      data-resource-handle-id={handle}
      {...tipAttrs({
        id: `${view.nodeId}|socket|${side}`,
        title: label,
        notes: [
          {
            text:
              side === "input"
                ? "Wire a machine's output (or a tank) here."
                : "Wire a machine's input (or a tank) here.",
            tone: "muted",
          },
        ],
      })}
    >
      <span className="cs-socket-word">{label}</span>
      <span className="cs-socket-hint">{hint}</span>
      <Handle
        id={handle}
        type={side === "input" ? "target" : "source"}
        position={side === "input" ? Position.Left : Position.Right}
        data-resource-handle="true"
        data-resource-node-id={view.nodeId}
        data-resource-handle-id={handle}
        aria-label={label}
        className="resource-slot-handle nodrag !absolute !left-0 !right-auto !top-0 !z-30 !h-full !w-full !min-w-0 !translate-x-0 !translate-y-0 !rounded-none !border-0 !bg-transparent !opacity-0 cursor-crosshair"
      />
    </div>
  );
  return (
    <>
      <div className="cs-sockets" data-side="input" style={{ gridRow: 2 }}>
        {one("input", sockets.take, sockets.takeHandle, "takes an output")}
      </div>
      <div className="cs-sockets" data-side="output" style={{ gridRow: 2 }}>
        {one("output", sockets.give, sockets.giveHandle, "feeds an input")}
      </div>
    </>
  );
}

function Rail({
  side,
  ports,
  section,
  row,
  unset,
  wasClick,
  power,
  shared,
}: {
  side: "input" | "output";
  ports: SpecialSection["inputs"];
  section: number;
  row: number;
  unset: boolean;
  wasClick: (event: MouseEvent) => boolean;
  power?: React.ReactNode;
  shared: boolean;
}) {
  return (
    <div className="cc-rail" data-side={side} style={{ gridRow: row }} data-section={section}>
      {ports.length === 0 && shared ? (
        <div className="cs-none">{side === "input" ? "No input" : "No output"}</div>
      ) : null}
      {ports.map((p) => (
        <CleanPortRow key={p.key} p={p} wasClick={wasClick} unset={unset} />
      ))}
      {power}
    </div>
  );
}

function SpecialChipView({
  chip,
  nodeId,
  onStep,
  wasClick,
}: {
  chip: SpecialChip;
  nodeId: string;
  onStep: (id: string, direction: -1 | 1) => void;
  wasClick: (event: MouseEvent) => boolean;
}) {
  const [draft, setDraft] = useState<string>();
  if (!chip.edit)
    return (
      <StripChip chip={chip as CleanChipView} nodeId={nodeId} onStep={onStep} wasClick={wasClick} />
    );
  const { edit } = chip;
  const commit = () => {
    if (draft === undefined) return;
    const text = draft;
    setDraft(undefined);
    edit.commit(text);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className="cc-sc nowheel"
      data-label={chip.label}
      data-editing={draft !== undefined ? "" : undefined}
      {...tipAttrs({
        id: `${nodeId}|setting|${chip.id}`,
        title: chip.label,
        rows: [{ label: "Set to", value: chip.value }],
        actions: [
          { input: "left", label: "Type a value" },
          { input: "wheel", label: "Step" },
        ],
      })}
      style={{ left: chip.x, top: chip.y, width: chip.width }}
      onClick={(event) => {
        glyph(event);
        if (draft === undefined && wasClick(event) && !checklistLocked()) setDraft(edit.text);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        glyph(event);
        onStep(chip.id, -1);
      }}
      onWheel={(event) => {
        if (checklistLocked()) return;
        event.stopPropagation();
        onStep(chip.id, event.deltaY < 0 ? 1 : -1);
      }}
    >
      {draft === undefined ? (
        chip.value
      ) : (
        <input
          autoFocus
          value={draft}
          inputMode="decimal"
          aria-label={chip.label}
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

export interface SpecialCardProps {
  model: SpecialModel;
  recipe: Recipe;
  node: FactoryNode;
}

/**
 * The clean card for what the plain one cannot be: a machine running several recipes (a rule over each), a
 * generator (amber name, EU out, its settings and warnings) and the two holders (dashed sockets until something is
 * wired, then the one port; a gauge or a tank for a picture). The same head, rails, picture, count and strip as the
 * plain card, in the same classes.
 */
export function SpecialCard({ model, recipe, node }: SpecialCardProps) {
  const { view, actions, context } = model;
  const { wasClick, onPointerDownCapture } = useClickSlop();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => ensureInteractionHost(), []);
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
  const [cropOpen, setCropOpen] = useState(false);
  const [menu, setMenu] = useState<{
    kind: "actions" | "settings";
    x: number;
    top: number;
    bottom: number;
    hangsFrom?: Element;
  }>();
  const shared = view.kind === "shared";
  const holder = view.kind === "custom-rate" || view.kind === "tank";

  const openMenu = (kind: "actions" | "settings") => (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (!wasClick(event)) return;
    const card = event.currentTarget.closest("[data-node-glance-root]") ?? undefined;
    const r = (card ?? event.currentTarget).getBoundingClientRect();
    setMenu(
      menu?.kind === kind
        ? undefined
        : { kind, x: r.left, top: r.top, bottom: r.bottom, hangsFrom: card },
    );
  };

  // Rows: the head, then per recipe a rule (shared only) and its rails, then the shared machine's power row, then the strip.
  const sections = view.sections;
  const rowOf = (index: number) => (shared ? 3 + 2 * index : 2);
  const ruleRowOf = (index: number) => 2 + 2 * index;
  const lastRailRow = rowOf(sections.length - 1);
  const powerRow = shared && view.power ? lastRailRow + 1 : undefined;
  const pictureEnd = (powerRow ?? lastRailRow) + 1;
  const stripRow = pictureEnd;
  const countText = view.count?.text ?? "";

  const powerRowView = view.power ? (
    <div
      className="cc-row"
      data-power=""
      data-side="input"
      data-stalled={view.power.stalled ? "" : undefined}
      {...tipAttrs(
        powerTip({ nodeId: view.nodeId, power: view.power } as unknown as CleanCardView),
      )}
    >
      <span className="cc-bolt" />
      <span className="cc-num" data-unit={view.power.unit}>
        {view.power.number}
      </span>
      <span className="cc-pname">{view.power.name}</span>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="cc-card cs-card"
      data-node-glance-root=""
      data-kind={dataKindOf(view)}
      data-selected={view.selected ? "" : undefined}
      data-cannot-run={view.cannotRun ? "" : undefined}
      data-unset={view.unset ? "" : undefined}
      data-empty={view.sockets ? "" : undefined}
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
          aria-label="Machine settings"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === "settings"}
          {...tipAttrs(gearTip(view.nodeId))}
          onClick={openMenu("settings")}
        />
        {view.cropKey ? (
          <div
            role="button"
            tabIndex={0}
            className="cc-key"
            data-glyph="sprout"
            data-crop-picker-toggle=""
            aria-label="Pick a crop"
            aria-haspopup="dialog"
            aria-expanded={cropOpen}
            {...tipAttrs({
              id: `${view.nodeId}|crop`,
              title: "Pick a crop",
              notes: [{ text: "What this farm plants.", tone: "muted" }],
              actions: [{ input: "left", label: "Pick another crop" }],
            })}
            onClick={(event) => {
              glyph(event);
              if (wasClick(event) && !checklistLocked()) setCropOpen((open) => !open);
            }}
          />
        ) : null}
        <div
          role={view.hasPicker ? "button" : undefined}
          tabIndex={view.hasPicker ? 0 : undefined}
          className={view.hasPicker ? "cc-name nowheel" : "cc-name"}
          style={{ "--cc-name-size": `${view.nameSize}px` } as CSSProperties}
          data-tone={view.nameTone === "ink" ? undefined : view.nameTone}
          data-picker={view.hasPicker ? "" : undefined}
          data-open={listOpen ? "" : undefined}
          data-clip={view.nameSize <= 9 ? "" : undefined}
          data-machine-menu-toggle={view.hasPicker ? "" : undefined}
          data-wheel-steps={view.hasPicker ? "" : undefined}
          {...tipAttrs(specialNameTip(view))}
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
              selectedId={context.selectedMachineHandler?.id ?? ""}
              iconsById={machineIcons}
              onHover={() => undefined}
              onUse={(id) => {
                actions.switchMachine(id);
                setListOpen(false);
              }}
              onClose={() => setListOpen(false)}
              mapIcons={mapIcons}
              figures={!shared}
              title={shared ? "Machines that run every recipe on this card" : undefined}
              onAddRecipe={
                shared
                  ? () => {
                      setListOpen(false);
                      browseMachineRecipes(node.id);
                    }
                  : undefined
              }
            />
          ) : null}
        </div>
        {view.amps ? (
          <AmpsChip
            amps={view.amps}
            tier={view.tier?.label}
            tip={tipFor(view, "amps")}
            onSet={actions.setAmps}
            wasClick={wasClick}
          />
        ) : null}
        {view.tier ? (
          <TierChip
            label={view.tier.label}
            tip={
              view.amps
                ? tipFor(view, "tier")
                : tierTip({
                    nodeId: view.nodeId,
                    tier: view.tier,
                    power: view.power,
                  } as unknown as CleanCardView)
            }
            fixed={view.tier.fixed}
            onStep={actions.stepTier}
            wasClick={wasClick}
          />
        ) : null}
      </div>

      {sections.map((section, index) => (
        <SectionBlock
          key={section.section}
          view={view}
          section={section}
          index={index}
          ruleRow={ruleRowOf(index)}
          railRow={rowOf(index)}
          actions={actions}
          wasClick={wasClick}
          shared={shared}
          empty={view.sockets !== undefined}
          power={index === sections.length - 1 && !shared ? powerRowView : undefined}
          pick={view.pick === true}
          onPick={() => setCropOpen(true)}
        />
      ))}
      {cropOpen ? <CropPickerMenu nodeId={node.id} onClose={() => setCropOpen(false)} /> : null}
      {view.sockets ? <Sockets view={view} /> : null}
      {powerRow ? (
        <div className="cc-rail" data-side="input" style={{ gridRow: powerRow }} data-power-rail="">
          {powerRowView}
        </div>
      ) : null}

      {view.pick ? null : (
        <div
          className="cc-pic cs-pic"
          style={{ gridRow: `2 / ${pictureEnd}` }}
          data-holder={holder ? "" : undefined}
        >
          <Picture view={view} context={context} />
          {view.count ? (
            <CountBox
              view={view.count}
              tip={countTip({ nodeId: view.nodeId, count: view.count } as unknown as CleanCardView)}
              onSet={actions.setCount}
              wasClick={wasClick}
            />
          ) : null}
        </div>
      )}

      {view.chips.length > 0 ? (
        <div className="cc-strip" style={{ height: view.stripHeight, gridRow: stripRow }}>
          {view.chips.map((chip) => (
            <SpecialChipView
              key={chip.id}
              chip={chip}
              nodeId={view.nodeId}
              onStep={actions.stepChip}
              wasClick={wasClick}
            />
          ))}
        </div>
      ) : null}
      {view.warnings.length > 0 ? (
        <div className="cs-warns" style={{ gridRow: stripRow + 1 }}>
          {view.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <div
        className="cc-glance"
        data-node-detail="glance"
        data-count={countText}
        aria-hidden
        style={
          view.glyph === "gauge"
            ? ({
                backgroundImage: GAUGE_URL,
                backgroundSize: "calc(100% - 96px) calc(100% - 96px)",
              } as CSSProperties)
            : view.glanceArt
              ? { backgroundImage: `url(${view.glanceArt})` }
              : undefined
        }
      />

      {menu ? (
        <MenuShell
          anchor={menu}
          align="left"
          width={224}
          maxHeight={280}
          onClose={() => setMenu(undefined)}
        >
          <div
            role="menu"
            aria-label={menu.kind === "actions" ? "Card actions" : "Machine settings"}
            className="text-[13px] leading-[18px]"
          >
            {menu.kind === "actions" ? (
              [
                { label: "Clone node", icon: Copy, run: () => duplicateNode(node.id), show: true },
                {
                  label: "Replace the recipe",
                  icon: RefreshCw,
                  run: () => beginRecipeRefactor(node.id),
                  show: view.kind === "shared" || view.kind === "power",
                },
                {
                  label: "Add another recipe",
                  icon: Plus,
                  run: () => browseMachineRecipes(node.id),
                  show: shared,
                },
                { label: "Delete node", icon: Trash2, run: () => deleteNode(node.id), show: true },
              ]
                .filter((entry) => entry.show)
                .map(({ label, icon: Icon, run }) => (
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
            ) : context.settings.length > 0 || context.readings.length > 0 ? (
              <>
                {context.settings.map((setting) => (
                  <button
                    key={setting.id}
                    type="button"
                    role="menuitem"
                    disabled={!setting.steps}
                    onClick={() => actions.stepChip(setting.id, 1)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      actions.stepChip(setting.id, -1);
                    }}
                    className="flex min-h-8 w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[var(--mc-ink)] hover:bg-[var(--mc-93)] focus-visible:outline-none"
                  >
                    <span className="min-w-0 truncate">{setting.label}</span>
                    <span className="shrink-0 text-[var(--mc-ink-muted)]">{setting.value}</span>
                  </button>
                ))}
                {context.readings.map((reading) => (
                  <div
                    key={reading.label}
                    className="flex min-h-8 items-center justify-between gap-2 px-2 py-1.5"
                  >
                    <span className="min-w-0 truncate text-[var(--mc-ink-muted)]">
                      {reading.label}
                    </span>
                    <span className="shrink-0 text-[var(--mc-ink)]">{reading.value}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="px-2 py-2 text-[var(--mc-ink-muted)]">This card has no settings.</div>
            )}
          </div>
        </MenuShell>
      ) : null}
    </div>
  );
}

function SectionBlock({
  view,
  section,
  index,
  ruleRow,
  railRow,
  actions,
  wasClick,
  shared,
  empty,
  power,
  pick,
  onPick,
}: {
  view: SpecialView;
  section: SpecialSection;
  index: number;
  ruleRow: number;
  railRow: number;
  actions: SpecialActions;
  wasClick: (event: MouseEvent) => boolean;
  shared: boolean;
  empty: boolean;
  power?: React.ReactNode;
  pick: boolean;
  onPick: () => void;
}) {
  void index;
  return (
    <>
      {shared && section.rule ? (
        <SectionRule
          view={view}
          section={section}
          row={ruleRow}
          actions={actions}
          wasClick={wasClick}
        />
      ) : null}
      {pick ? (
        <div
          role="button"
          tabIndex={0}
          className="cs-pick"
          data-crop-picker-toggle=""
          style={{ gridRow: railRow }}
          {...tipAttrs({
            id: `${view.nodeId}|pick`,
            title: "Pick a crop",
            notes: [{ text: "Click to pick what this farm plants.", tone: "muted" }],
          })}
          onClick={(event) => {
            glyph(event);
            if (wasClick(event) && !checklistLocked()) onPick();
          }}
        >
          <span className="cs-pick-icon" />
          Pick a crop
        </div>
      ) : null}
      {empty || pick ? null : (
        <>
          <Rail
            side="input"
            ports={section.inputs}
            section={section.section}
            row={railRow}
            unset={view.unset}
            wasClick={wasClick}
            shared={shared}
            power={power}
          />
          <Rail
            side="output"
            ports={section.outputs}
            section={section.section}
            row={railRow}
            unset={view.unset}
            wasClick={wasClick}
            shared={shared}
          />
        </>
      )}
    </>
  );
}

function Picture({ view, context }: { view: SpecialView; context: SpecialContext }) {
  void context;
  if (view.glyph === "gauge")
    return <span className="cs-gauge" style={{ backgroundImage: GAUGE_URL }} />;
  if (view.art) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cc-art" src={view.art} alt="" draggable={false} />;
  }
  if (view.icon?.iconPath || view.icon?.iconAtlas) {
    return (
      <ResourceIcon
        resource={{
          kind: "item",
          id: view.icon.id,
          amount: 1,
          displayName: view.icon.displayName,
          iconPath: view.icon.iconPath,
          iconAtlas: view.icon.iconAtlas,
          dominantColor: view.icon.dominantColor,
        }}
        bare
        tooltip={false}
        showAmount={false}
        showConsumedState={false}
        iconPixelSize={109}
        className="cc-machine"
      />
    );
  }
  return null;
}

function tipFor(view: SpecialView, part: "tier" | "amps"): TipSpec {
  return {
    id: `${view.nodeId}|${part}`,
    title: "Power input",
    panel: { kind: "power", nodeId: view.nodeId },
  };
}

function specialNameTip(view: SpecialView): TipSpec {
  if (view.kind === "shared") {
    return {
      id: `${view.nodeId}|name`,
      title: view.name,
      sub: view.amps ? "Multiblock" : "Machine",
      rows: [
        { label: "Recipes", value: String(view.sections.length) },
        ...(view.count
          ? [
              {
                label: view.count.pinned ? "Pinned machines" : "Required machines",
                value: view.count.text.replace(/^×/, "x"),
              },
            ]
          : []),
      ],
      notes: [
        {
          text: "Runs its recipes one at a time; each row says how its share goes.",
          tone: "muted",
        },
      ],
      actions: view.hasPicker
        ? [
            { input: "left", label: "Machines that run them all" },
            { input: "wheel", label: "Next machine" },
          ]
        : [],
    };
  }
  if (view.kind === "custom-rate") {
    return {
      id: `${view.nodeId}|name`,
      title: view.name,
      notes: [{ text: "Wire any port to this and it adopts that resource.", tone: "muted" }],
    };
  }
  if (view.kind === "tank") {
    return {
      id: `${view.nodeId}|name`,
      title: view.name,
      notes: [
        {
          text: "Empties cells into their fluid, or fills them, free and at once. It keeps up with the plan.",
          tone: "muted",
        },
      ],
    };
  }
  return { id: `${view.nodeId}|name`, title: view.name, sub: "Generator" };
}
