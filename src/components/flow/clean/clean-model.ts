"use client";

import { useMemo } from "react";
import type { FactoryNode, MachineConfigTierOption, Recipe } from "@/lib/model/types";
import {
  GT_OVERCLOCK_TIERS,
  applyMachineHandlerToRecipe,
  applyRecipeInputOverrides,
  formatCompact,
  formatPowerValue,
  getRecipeAvailableVoltageTiers,
  getRecipeCoilTierControl,
  getRecipeMachineConfigTierControls,
  getRecipeMachineHandlers,
  getRecipeMaximumVoltageTier,
  getRunVoltageTier,
  getSelectedMachineHandler,
  getVoltageTierIndex,
  isSteamMachineHandler,
  makeResourceKey,
  type MachineConfigTierControl,
} from "@/lib/model";
import { powerDisplayFromEuT, powerDisplaySuffix, rateSuffixForKind } from "@/lib/model/rate-unit";
import { getRecipeProgrammedCircuit, type RecipeProgrammedCircuit } from "@/lib/model/programmed-circuit";
import { stripBeeFrameSlotInputs } from "@/lib/model/bee-display";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { applyMachineOutputMultipliers, getMachineParallelMultiplier } from "@/lib/solver/machine-effects";
import { getNodePowerReport, getNodeSteamReport, hasPowerReport } from "@/lib/solver/power-report";
import { isMultiblockRecipe } from "@/lib/solver/power";
import { prefersCuratedMachineMath } from "@/lib/solver/runtime-calculation";
import { getFusionMachine } from "@/lib/machines/fusion";
import { energyHatchTypeExistsAtTier } from "@/lib/machines/energy-hatches";
import { carryMachineVoltage } from "@/lib/solver/hatch-input";
import { getVoltageTierMaxEuT } from "@/lib/model/tiers";
import { makePortKey } from "@/lib/solver/plan/port-key";
import { getMachineStructureArt } from "@/lib/power/structure-art";
import { useFactoryStore, useRateDisplayUnits } from "@/store/factory-store";
import { useWorkspaceView } from "@/lib/workspace-view";
import { formatEnergyPerUnitParts, formatSlotRateBare, portReadsEnergy } from "../flow-explainers";
import { buildRailPorts, deriveNodeVerdict, type RailPort } from "../node-verdict";
import {
  machineIconAtTier,
  useMachineHandlerIconEntries,
  useRecipeMapIcons,
  type MachineHandlerIcon,
} from "../machine-icons";
import { orderMachineHandlers } from "../MachinePicker";
import type { RecipeNodeData } from "../RecipeNode";
import { CC_GEOMETRY } from "./tokens";
import { isPinned, pinMachineKey, settingControls } from "./menus/settings-model";
import { measureClean } from "./text-measure";

type VoltageTier = Parameters<typeof getVoltageTierIndex>[0];

/** What one port row prints. All strings are final; the row does no formatting. */
export interface CleanPortView {
  key: string;
  nodeId: string;
  handleId: string;
  side: "input" | "output";
  port: RailPort;
  number: string;
  unit: string;
  name: string;
  /** The tooltip: the name, plus the chance an output comes with. */
  title: string;
  zero: boolean;
  /** The rate on this port is one the player set. */
  gold: boolean;
  /** That rate, per second (`FactoryNode.portRates`), when set. */
  rate?: number;
  /** Number and unit do not fit the words column at figure size. */
  numberSmall: boolean;
  /** The name does not fit one line at its normal size. */
  nameSmall: boolean;
  /** The name does not fit one line even at its small size. */
  nameClipped: boolean;
  wired: boolean;
  choice: boolean;
  resourceKey: string;
  /** What the solve sends out of / brings into the plan at this port with no drawer. */
  forced?: { number: string; unit: string };
}

export interface CleanChipView {
  id: string;
  label: string;
  value: string;
  /** The setting's own block or item, drawn as the chip's background. */
  icon?: string;
  /** A reading is words only, no box. */
  reading?: boolean;
  warn?: boolean;
  title: string;
  /** Computed layout, card-local px. */
  x: number;
  y: number;
  width: number;
}

export interface CleanPowerView {
  number: string;
  unit: string;
  name: string;
  stalled: boolean;
  title: string;
}

export interface CleanCardView {
  nodeId: string;
  name: string;
  nameSize: number;
  hasPicker: boolean;
  tier?: { label: string; fixed: boolean; title: string };
  amps?: { label: string; value: number; editable: boolean };
  inputs: CleanPortView[];
  outputs: CleanPortView[];
  power?: CleanPowerView;
  art?: string;
  /** What the zoomed-out view draws: the structure render, or the machine item. */
  glanceArt?: string;
  count: {
    text: string;
    pinned: boolean;
    zero: boolean;
    note: "" | "(pinned)" | "(set count)";
    value: number;
    title: string;
  };
  circuit?: RecipeProgrammedCircuit;
  chips: CleanChipView[];
  stripHeight: number;
  selected: boolean;
  cannotRun: boolean;
  unset: boolean;
}

export interface CleanCardActions {
  stepTier: (direction: -1 | 1) => void;
  setAmps: (amps: number) => void;
  cycleMachine: (direction: -1 | 1) => void;
  switchMachine: (handlerId: string) => void;
  setCount: (count: number | undefined) => void;
  stepSetting: (id: string, direction: -1 | 1) => void;
}

/** What the component needs besides the view: the menus' inputs. */
export interface CleanCardContext {
  machineHandlers: ReturnType<typeof getRecipeMachineHandlers>;
  selectedMachineHandler: ReturnType<typeof getSelectedMachineHandler>;
  machineIcon?: MachineHandlerIcon;
  /** The settings behind the strip and the gear menu. */
  settings: Array<{ id: string; label: string; value: string; steps: boolean }>;
  /** Port keys of every rail port, in render order, for React Flow's handle bookkeeping. */
  handleIds: string[];
}

/** The card's tier ladder, with the classic card's rules. */
function getNodeTierControl(recipe: Recipe, node: FactoryNode) {
  const fusion = getFusionMachine(recipe.machineType);
  if (fusion) {
    return {
      minimum: fusion.tier as VoltageTier,
      maximum: fusion.tier as VoltageTier | undefined,
      current: fusion.tier as VoltageTier,
      available: undefined as VoltageTier[] | undefined,
      allowBelowMinimum: false,
      fixed: true,
    };
  }
  const hasVoltageTier = GT_OVERCLOCK_TIERS.some((entry) => entry.tier === recipe.minimumTier);
  const recipeMap = (recipe.source?.recipeMap ?? recipe.machineType).toLowerCase().trim();
  if (recipe.durationTicks <= 0 || (recipe.eut === 0 && !hasVoltageTier && recipeMap !== "tree growth simulator")) {
    return undefined;
  }
  const minimum = getOverclockedRecipeStats(recipe, node).minimumTier as VoltageTier;
  const allowBelowMinimum = isMultiblockRecipe(recipe);
  const maximum = allowBelowMinimum ? undefined : (getRecipeMaximumVoltageTier(recipe) as VoltageTier | undefined);
  const available = allowBelowMinimum ? undefined : (getRecipeAvailableVoltageTiers(recipe) as VoltageTier[] | undefined);
  const current = (
    allowBelowMinimum
      ? (GT_OVERCLOCK_TIERS.find((entry) => entry.tier === node.overclockTier)?.tier ?? minimum)
      : getRunVoltageTier(recipe, node.overclockTier)
  ) as VoltageTier;
  return { minimum, maximum, current, available, allowBelowMinimum, fixed: false };
}

function adjacentTier(
  current: VoltageTier,
  floor: VoltageTier | undefined,
  direction: -1 | 1,
  ceiling?: VoltageTier,
  available?: VoltageTier[],
): VoltageTier {
  const currentIndex = getVoltageTierIndex(current);
  const floorIndex = floor ? getVoltageTierIndex(floor) : 0;
  const ceilingIndex = ceiling ? getVoltageTierIndex(ceiling) : GT_OVERCLOCK_TIERS.length - 1;
  if (available) {
    const choices = available.filter((tier) => {
      const index = getVoltageTierIndex(tier);
      return index >= floorIndex && index <= ceilingIndex;
    });
    return (
      (direction > 0
        ? choices.find((tier) => getVoltageTierIndex(tier) > currentIndex)
        : choices.findLast((tier) => getVoltageTierIndex(tier) < currentIndex)) ?? current
    );
  }
  const next = Math.min(ceilingIndex, Math.max(floorIndex, currentIndex + direction));
  return (GT_OVERCLOCK_TIERS[next]?.tier ?? current) as VoltageTier;
}

/** `x1.2` form: three decimals under 1, two under 10, one under 100, whole from 100. */
export function formatSolvedMachines(value: number): string {
  if (value <= 0.0000005) return "0";
  if (value < 0.0005) return "<0.001";
  if (value >= 100) return String(Math.ceil(value - 0.000001));
  const decimals = value < 1 ? 3 : value < 10 ? 2 : 1;
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function isLocked(): boolean {
  const s = useFactoryStore.getState();
  return s.isReadOnly || s.checklistMode;
}

const WORDS = CC_GEOMETRY.wordsWidth;

export function buildPortView(
  nodeId: string,
  port: RailPort,
  node: Pick<FactoryNode, "portRates">,
  forcedAt: ReadonlyMap<string, number> | undefined,
): CleanPortView {
  let number: string;
  let unit: string;
  if (portReadsEnergy(port)) {
    const parts = formatEnergyPerUnitParts(port.energyPerUnit!, port.kind);
    number = parts.value;
    unit = parts.unit;
  } else {
    number = formatSlotRateBare(port.currentPerSecond, port.kind);
    unit = rateSuffixForKind(port.kind).trim();
  }
  const chance = (port.resource as { chance?: number } | undefined)?.chance;
  const chanceText = chance !== undefined && chance < 1 ? `${Math.round(chance * 10000) / 100}%` : undefined;
  const forcedRate = forcedAt?.get(makePortKey(nodeId, port.side === "input" ? "i" : "o", port.handleId));
  return {
    key: port.key,
    nodeId,
    handleId: port.handleId,
    side: port.side,
    port,
    number,
    unit,
    name: port.displayName,
    title: chanceText ? `${port.displayName} (${chanceText} chance)` : port.displayName,
    zero: !(port.currentPerSecond > 0),
    gold: node.portRates?.[port.handleId] !== undefined,
    rate: node.portRates?.[port.handleId],
    numberSmall: measureClean(number, 13) + 2 + measureClean(unit, 8) > WORDS,
    nameSmall: measureClean(port.displayName, 8) > WORDS,
    nameClipped: measureClean(port.displayName, 6) > WORDS,
    wired: port.connected,
    choice: (port.resource?.alternatives?.length ?? 0) > 1,
    resourceKey: makeResourceKey(port.kind, port.resourceId),
    forced:
      forcedRate !== undefined && forcedRate > 0
        ? { number: formatSlotRateBare(forcedRate, port.kind), unit: rateSuffixForKind(port.kind).trim() }
        : undefined,
  };
}

/**
 * Lay the strip's chips out in rows of the card's inner width, one cell
 * apart. Positions are computed (not flowed) so the card's height is a pure
 * function of the data: nothing is measured from the DOM.
 */
export function layoutStrip(chips: Array<Omit<CleanChipView, "x" | "y" | "width">>): {
  chips: CleanChipView[];
  height: number;
} {
  if (chips.length === 0) return { chips: [], height: 0 };
  const G = CC_GEOMETRY;
  const inner = G.cardWidth - 2 * G.stripInset;
  let x = 0;
  let row = 0;
  const placed = chips.map((chip) => {
    const text = measureClean(chip.label, 8) + (chip.value ? 4 + measureClean(chip.value, 8) : 0);
    const width = Math.min(inner, Math.ceil(text + (chip.reading ? 0 : 12) + (chip.icon ? 17 : 0)));
    if (x > 0 && x + width > inner) {
      x = 0;
      row += 1;
    }
    const out: CleanChipView = {
      ...chip,
      x: G.stripInset + x,
      y: G.stripGap + G.stripPad + row * G.stripPitch,
      width,
    };
    x += width + G.stripChipGap;
    return out;
  });
  return { chips: placed, height: (row + 1) * G.stripPitch + G.cell };
}

/** Everything the clean card draws and does, from the same inputs as the classic card. */
export function useCleanCardModel(
  data: RecipeNodeData,
  selected: boolean,
): { view: CleanCardView; actions: CleanCardActions; context: CleanCardContext } {
  const { projectNode, recipe, result } = data;
  const updateNode = useFactoryStore((state) => state.updateNode);
  const averageDraw = useWorkspaceView().averageMachineDraw;
  useRateDisplayUnits();
  // Pins live on the project, not the node: re-render when they move.
  useFactoryStore((state) => state.project.settingPins);
  const machineIcons = useMachineHandlerIconEntries();
  const mapIcons = useRecipeMapIcons();
  // The solve is read lazily like the classic card does: this component
  // re-renders on every solver tick, which is when any of it can change.
  const { project: liveProject, lastResult } = useFactoryStore.getState();

  const derived = useMemo(() => {
    const machineHandlers = getRecipeMachineHandlers(recipe);
    const selectedMachineHandler = getSelectedMachineHandler(recipe, projectNode);
    const nodeRecipe = applyRecipeInputOverrides(recipe, projectNode);
    const effectiveRecipe = applyMachineHandlerToRecipe(nodeRecipe, projectNode);
    const machineDrawsEu = effectiveRecipe.eut > 0 && !isSteamMachineHandler(selectedMachineHandler);
    const tierControl = machineDrawsEu ? getNodeTierControl(effectiveRecipe, projectNode) : undefined;
    const powerReport =
      machineDrawsEu && tierControl && hasPowerReport(nodeRecipe) ? getNodePowerReport(nodeRecipe, projectNode) : undefined;
    const steamReport = !machineDrawsEu ? getNodeSteamReport(nodeRecipe, projectNode) : undefined;
    const showHatchControl = Boolean(
      powerReport?.isMultiblock &&
        prefersCuratedMachineMath(effectiveRecipe) &&
        !getFusionMachine(effectiveRecipe.machineType),
    );
    const coilControl = getRecipeCoilTierControl(effectiveRecipe, projectNode);
    const controls = getRecipeMachineConfigTierControls(effectiveRecipe, projectNode);
    const overclockedStats = getOverclockedRecipeStats(nodeRecipe, projectNode);
    const displayRecipe = stripBeeFrameSlotInputs(effectiveRecipe);
    const adjusted = applyMachineOutputMultipliers(displayRecipe, projectNode, overclockedStats.tier);
    const overclockedRecipe = { ...displayRecipe, ...adjusted, ...overclockedStats };
    return {
      machineHandlers,
      selectedMachineHandler,
      nodeRecipe,
      tierControl,
      powerReport,
      steamReport,
      showHatchControl,
      coilControl,
      controls,
      overclockedRecipe,
      parallel: getMachineParallelMultiplier(effectiveRecipe, projectNode),
      circuit: getRecipeProgrammedCircuit(effectiveRecipe) as RecipeProgrammedCircuit | undefined,
    };
  }, [recipe, projectNode]);

  const pinControls = useMemo(() => settingControls(recipe, projectNode), [recipe, projectNode]);
  const verdict = deriveNodeVerdict(liveProject, lastResult, projectNode.id);
  const rails = buildRailPorts(liveProject, lastResult, projectNode.id, derived.overclockedRecipe, verdict);
  const plan = lastResult?.plan;

  // Only this card's forced entries; the plan list is short, so no memo.
  const forcedAt = new Map<string, number>();
  for (const entry of plan?.forced ?? []) {
    if (entry.nodeId === projectNode.id) forcedAt.set(entry.portKey, entry.perSecond);
  }

  const { selectedMachineHandler, machineHandlers, tierControl, powerReport, steamReport } = derived;
  const pictureTier = (tierControl?.current ?? projectNode.overclockTier) as string;
  const recipeMapIcon = mapIcons.get(recipe.source?.recipeMap ?? recipe.machineType) as MachineHandlerIcon | undefined;
  const machineIcon = machineIconAtTier(machineIcons.get(selectedMachineHandler.id), pictureTier) ?? recipeMapIcon;
  const name = machineIcon?.displayName ?? selectedMachineHandler.label;
  const art = getMachineStructureArt(selectedMachineHandler.id);

  const hasPicker = machineHandlers.length > 1;
  const tierLabel = powerReport?.isMultiblock ? powerReport.tier : tierControl?.current;
  const ampsLabel =
    powerReport?.isMultiblock && derived.showHatchControl
      ? (powerReport.hatchChip ?? `${formatCompact(powerReport.amps)}A`)
      : undefined;

  const G = CC_GEOMETRY;
  const chipsLeft = G.cardWidth - 8 - (tierLabel ? G.chipWidth : 0) - (ampsLabel ? 2 + G.chipWidth : 0);
  const nameRoom = Math.max(40, chipsLeft - 8 - 8 - 2 * (G.keySize + 2) - 8 - (hasPicker ? 15 : 0));
  // The mod's name is x1.25 of its 8 px text (10); Monocraft runs wider than the mod's face, so it steps down to 8 before it clips with an ellipsis.
  const nameSize = [10, 9].find((size) => measureClean(name, size) <= nameRoom) ?? 8;

  // Power row: a machine's draw, or a steam machine's litres.
  const usage = Math.min(1, Math.max(0, result?.utilization ?? 1));
  const drawScale = averageDraw ? usage : usage > 0 ? 1 : 0;
  // The card's demand is what the card runs: the solved count (or the pinned one, fractions and all) times one
  // machine's draw, as the mod prints it, not the built machine count the classic card multiplied by.
  const solvedNeeded = result?.theoreticalMachinesRequired ?? 0;
  const solvedPin = projectNode.solvePin;
  const machines = (solvedPin !== undefined && solvedPin > 0 ? solvedPin : solvedNeeded) * Math.max(1, projectNode.parallel);
  let power: CleanPowerView | undefined;
  if (powerReport) {
    const stalled = powerReport.state !== "ok";
    power = {
      number: stalled ? "TIER!" : formatPowerValue(powerDisplayFromEuT(powerReport.drawEuT * machines * drawScale)),
      unit: stalled ? "" : powerDisplaySuffix(),
      name: "Power",
      stalled,
      title: stalled
        ? (powerReport.recipeGateReason ?? "This machine's tier is too low to run the recipe.")
        : `${powerReport.tier} machine, ${formatCompact(powerReport.amps)}A`,
    };
  } else if (steamReport) {
    power = {
      number: formatCompact(steamReport.drawSteamPerTick * 20 * machines * drawScale),
      unit: "L/s",
      name: steamReport.highPressure ? "HP steam" : "Steam",
      stalled: false,
      title: "Steam this machine burns",
    };
  }

  // Count: the solved number, gold when pinned, a prompt when nothing sets it.
  const needed = result?.theoreticalMachinesRequired ?? 0;
  const pin = projectNode.solvePin;
  const pinned = pin !== undefined && pin > 0;
  const unset =
    plan !== undefined && !pinned && (plan.unanchored.includes(projectNode.id) || plan.unneeded.includes(projectNode.id));
  const countValue = pinned ? pin : needed;
  const count = {
    text: `×${formatSolvedMachines(countValue)}`,
    pinned,
    zero: !pinned && needed <= 0.0000005,
    note: (pinned ? "(pinned)" : unset ? "(set count)" : "") as "" | "(pinned)" | "(set count)",
    value: countValue,
    title: pinned
      ? "Pinned count. Click to change it, clear the field to let the plan decide."
      : "How many of this machine the plan needs. Click to pin a count.",
  };

  // Settings strip (the mod's pins): the settings pinned to this machine's cards, the coil by default on a heat recipe.
  const settings: CleanCardContext["settings"] = [];
  const rawChips: Array<Omit<CleanChipView, "x" | "y" | "width">> = [];
  const pinKey = pinMachineKey(recipe, projectNode);
  for (const control of pinControls) {
    settings.push({ id: control.id, label: control.label, value: control.value, steps: control.options.length > 1 });
    if (!isPinned(liveProject, pinKey, control)) continue;
    rawChips.push({
      id: control.id,
      label: control.label,
      value: control.value,
      icon: control.icon,
      warn: control.warn || undefined,
      title: `${control.label}: ${control.value}`,
    });
  }
  const parallels = powerReport?.parallels ?? steamReport?.parallels ?? derived.parallel;
  if (parallels > 1) {
    rawChips.push({
      id: "parallel",
      label: "Parallel",
      value: `×${formatCompact(parallels)}`,
      reading: true,
      title: "Operations at once. Set by the machine and its configuration.",
    });
  }
  const strip = layoutStrip(rawChips);

  const inputs = rails.inputs.map((port) => buildPortView(projectNode.id, port, projectNode, forcedAt));
  const outputs = rails.outputs.map((port) => buildPortView(projectNode.id, port, projectNode, forcedAt));

  const view: CleanCardView = {
    nodeId: projectNode.id,
    name,
    nameSize,
    hasPicker,
    tier: tierLabel
      ? {
          label: tierLabel,
          fixed: tierControl?.fixed === true,
          title: tierControl?.fixed ? "Fixed by the reactor mark" : `Tier ${tierLabel}. Click up, right click down.`,
        }
      : undefined,
    amps: ampsLabel && powerReport ? { label: ampsLabel, value: powerReport.amps, editable: true } : undefined,
    inputs,
    outputs,
    power,
    art,
    glanceArt: art ?? machineIcon?.iconPath,
    count,
    circuit: derived.circuit,
    chips: strip.chips,
    stripHeight: strip.height,
    selected,
    cannotRun: powerReport !== undefined && powerReport.state !== "ok",
    unset,
  };

  const actions: CleanCardActions = {
    stepTier: (direction) => {
      if (isLocked() || !tierControl || tierControl.fixed) return;
      if (derived.showHatchControl && powerReport) {
        const next = adjacentTier(powerReport.tier as VoltageTier, undefined, direction);
        if (next !== powerReport.tier) {
          updateNode(projectNode.id, {
            hatchVoltageTier: next as NonNullable<FactoryNode["hatchVoltageTier"]>,
            hatchAmps: powerReport.amps,
            powerInputMode: projectNode.powerInputMode ?? "amps",
            powerEuT: powerReport.amps * getVoltageTierMaxEuT(next),
          });
        }
        return;
      }
      const next = adjacentTier(
        tierControl.current,
        tierControl.allowBelowMinimum ? undefined : tierControl.minimum,
        direction,
        tierControl.maximum,
        tierControl.available,
      );
      if (next !== tierControl.current) updateNode(projectNode.id, { overclockTier: next });
    },
    setAmps: (amps) => {
      if (isLocked() || !powerReport) return;
      const value = Math.min(16_777_216, Math.max(1, Math.round(amps)));
      updateNode(projectNode.id, {
        hatchVoltageTier: powerReport.tier as NonNullable<FactoryNode["hatchVoltageTier"]>,
        hatchAmps: value,
        powerInputMode: projectNode.powerInputMode ?? "amps",
        powerEuT: value * getVoltageTierMaxEuT(powerReport.tier),
      });
    },
    switchMachine: (handlerId) => {
      if (isLocked() || machineHandlers.length <= 1) return;
      const next = machineHandlers.find((handler) => handler.id === handlerId);
      if (!next || next.id === selectedMachineHandler.id) return;
      updateNode(projectNode.id, {
        machineHandlerId: next.id,
        overclockTier: next.minimumTier,
        ...(energyHatchTypeExistsAtTier(projectNode.energyHatchType, next.minimumTier)
          ? undefined
          : { energyHatchType: undefined }),
        ...carryMachineVoltage(
          { recipe: derived.nodeRecipe, node: projectNode },
          { recipe: derived.nodeRecipe, machineHandlerId: next.id },
        ),
      });
    },
    cycleMachine: (direction) => {
      if (isLocked() || machineHandlers.length <= 1) return;
      const ordered = orderMachineHandlers(machineHandlers);
      const index = Math.max(0, ordered.findIndex((handler) => handler.id === selectedMachineHandler.id));
      const next = ordered[(index + direction + ordered.length) % ordered.length];
      if (next) actions.switchMachine(next.id);
    },
    setCount: (value) => {
      if (isLocked()) return;
      updateNode(projectNode.id, { solvePin: value });
    },
    stepSetting: (id, direction) => {
      if (isLocked()) return;
      const control: MachineConfigTierControl | undefined =
        id === "heatingCoil" ? derived.coilControl : derived.controls.find((entry) => entry.id === id);
      if (!control || control.tiers.length <= 1) return;
      const index = control.tiers.findIndex((tier: MachineConfigTierOption) => tier.key === control.current.key);
      const next = control.tiers[(index + direction + control.tiers.length) % control.tiers.length];
      if (!next) return;
      if (id === "heatingCoil") {
        updateNode(projectNode.id, { coilTier: next.key });
      } else {
        updateNode(projectNode.id, { machineConfigTiers: { ...(projectNode.machineConfigTiers ?? {}), [id]: next.key } });
      }
    },
  };

  const context: CleanCardContext = {
    machineHandlers,
    selectedMachineHandler,
    machineIcon,
    settings,
    handleIds: [...inputs.filter((p) => !p.port.free).map((p) => p.handleId), ...outputs.map((p) => p.handleId)],
  };

  return { view, actions, context };
}

export type { RailPort };
