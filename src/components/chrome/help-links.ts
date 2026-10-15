import { BUG_REPORT_URL, DISCORD_THREAD_URL, GITHUB_URL, KOFI_URL } from "@/components/HeaderLinks";
import { openWelcomeTab } from "@/lib/welcome/welcome-tab";
import { leaveLibrary } from "@/lib/library/library-tab";
import { APP_VERSION } from "@/lib/version";
import { MOD_RELEASE_URL } from "@/components/ModAnnouncement";

/** The help menu's outside doors, in one place. */
export const HelpLinks = {
  github: GITHUB_URL,
  discord: DISCORD_THREAD_URL,
  kofi: KOFI_URL,
  bugReport: BUG_REPORT_URL,
  /** The in-game planner's newest release. */
  mod: MOD_RELEASE_URL,
  version: `v${APP_VERSION}`,
  open(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  openWelcome() {
    leaveLibrary();
    openWelcomeTab();
  },
};
