import type { KeyboardEvent } from "react";

/** Enter or Space presses a div that plays a button (role="button", radio, tab, menu row) from the keyboard. */
export function activateOnKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.currentTarget.click();
}
