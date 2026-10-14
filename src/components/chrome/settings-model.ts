import {
  DEFAULT_UI_SCALE_PERCENT,
  UI_SCALE_MAX_PERCENT,
  UI_SCALE_MIN_PERCENT,
} from "@/lib/ui-scale-boot";
import { SEE_THROUGH_STEP } from "@/components/flow/clean/seethrough/see-through";

/** The mod's Board "Size" choices (Tiny, Small, Normal, Large) as the interface size's percent. */
export const SIZE_NAMES = ["Tiny", "Small", "Normal", "Large"] as const;
export const SIZE_PERCENT: readonly number[] = [70, 90, DEFAULT_UI_SCALE_PERCENT, 130];

/** Which Size choice a percent is, or -1 when it sits between them (a custom size from before). */
export function sizeIndexOf(percent: number): number {
  return SIZE_PERCENT.findIndex((value) => Math.abs(value - percent) < 0.5);
}

export function sizePercentOf(index: number): number {
  const percent = SIZE_PERCENT[Math.max(0, Math.min(SIZE_PERCENT.length - 1, index))];
  return Math.max(UI_SCALE_MIN_PERCENT, Math.min(UI_SCALE_MAX_PERCENT, percent));
}

/** The mod's Sounds choices and their gains (`PlannerSettings.SOUND_GAINS`); Off silences. */
export const SOUND_NAMES = ["Off", "Quiet", "Normal", "Loud"] as const;
export const SOUND_VOLUME: readonly number[] = [0, 0.5, 1, 1.7];

export function soundIndexOf(enabled: boolean, volume: number): number {
  if (!enabled) return 0;
  let best = 1;
  for (let index = 1; index < SOUND_VOLUME.length; index++) {
    if (Math.abs(SOUND_VOLUME[index] - volume) < Math.abs(SOUND_VOLUME[best] - volume)) best = index;
  }
  return best;
}

/** The See-through slider's values, "0%" to "100%" in steps of 5. */
export const SEE_THROUGH_NAMES: readonly string[] = Array.from(
  { length: 100 / SEE_THROUGH_STEP + 1 },
  (_, index) => `${index * SEE_THROUGH_STEP}%`,
);
