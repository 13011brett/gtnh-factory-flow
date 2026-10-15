import type { ShareMode } from "@/components/community/SharePlanDialog";
import type { MenuEntry } from "./ChromeMenu";

/**
 * The rows that put a plan in the library, in the Share menu and a tab's menu, in the mod's words: a plan not
 * posted yet has Save to library; one posted has Update in library (its own post, votes kept) and Save as new
 * post. A post is a copy: nothing follows the plan by itself.
 */
export function libraryRows(
  linked: boolean,
  open: (mode: ShareMode) => void,
  options: { disabled?: boolean } = {},
): MenuEntry[] {
  if (!linked) {
    return [{ label: "Save to library...", detail: "for other players", onSelect: () => open("save"), disabled: options.disabled }];
  }
  return [
    { label: "Update in library...", detail: "with the plan as it is", onSelect: () => open("update"), disabled: options.disabled },
    { label: "Save as new post...", detail: "a post of its own", onSelect: () => open("new"), disabled: options.disabled },
  ];
}
