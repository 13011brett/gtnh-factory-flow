"use client";

import "./chrome.css";

import { useState } from "react";
import { useCommunityUser } from "@/components/community/auth";
import { initialsOf, inkOn } from "@/components/live/LiveFaces";
import { colorFor } from "@/lib/live/protocol";
import { useLiveSession } from "@/store/live-session";
import { BarKey } from "./bar-parts";
import { ChromeMenu, chromeAnchorOf, type ChromeAnchor } from "./ChromeMenu";
import { SignInPanel } from "./SignInPanel";

/**
 * The account key, after Share: "Sign in" while signed out (it opens the sign-in form), the account's face (initials in
 * its colour) while signed in, with a menu of the username and Sign out.
 */
export function AccountKey() {
  const { user, isLoading, signOut } = useCommunityUser();
  const me = useLiveSession((state) => state.me);
  const [open, setOpen] = useState<{ kind: "form" | "menu"; anchor: ChromeAnchor }>();
  if (isLoading) {
    return null;
  }
  const toggle = (kind: "form" | "menu", element: Element) => {
    const anchor = chromeAnchorOf(element);
    setOpen((current) => (current?.kind === kind ? undefined : { kind, anchor }));
  };
  if (!user) {
    return (
      <>
        <BarKey
          id="account"
          label="Sign in"
          tip="Sign in: your plans are kept in your account, and shared from it"
          open={open?.kind === "form"}
          onClick={(event) => toggle("form", event.currentTarget)}
          menuAnchor
        />
        {open?.kind === "form" ? <SignInPanel anchor={open.anchor} onClose={() => setOpen(undefined)} /> : null}
      </>
    );
  }
  // The account's own colour comes with the live service's hello; until then the name's.
  const color = me?.username === user.username ? me.color : colorFor(user.username);
  return (
    <>
      <BarKey
        id="account"
        icon
        ariaLabel={`Account: ${user.username}`}
        tip={`Signed in as ${user.username}`}
        tipSub="Sign out"
        open={open?.kind === "menu"}
        onClick={(event) => toggle("menu", event.currentTarget)}
        menuAnchor
      >
        <span className="mb-me" style={{ background: color, color: inkOn(color) }}>
          {initialsOf(user.username)}
        </span>
      </BarKey>
      {open?.kind === "menu" ? (
        <ChromeMenu
          anchor={open.anchor}
          label="Account"
          minWidth={110}
          align="right"
          entries={[
            { label: user.username, disabled: true, onSelect: () => undefined },
            { label: "Sign out", ruleAbove: true, onSelect: () => void signOut() },
          ]}
          onClose={() => setOpen(undefined)}
        />
      ) : null}
    </>
  );
}
