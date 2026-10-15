import type { EntryIcon } from "@/lib/model/types";

/**
 * The wire shapes between the browser's library and the account's copy of
 * it. Timestamps are ISO strings and are the CLIENT's: the server stores
 * what it is told, so both sides can agree that a row is synced by comparing
 * the same value. See `library-sync.ts` for the rules.
 */

/** A design as the list endpoint returns it: everything but the plan. */
export interface RemoteDesignMeta {
  id: string;
  name: string;
  icon: EntryIcon | null;
  folderId: string | null;
  closed: boolean;
  favorite: boolean;
  order: number | null;
  communityPlanId: string | null;
  createdAt: string;
  /** Moves on any change. */
  updatedAt: string;
  /** Moves only when the plan itself did. */
  planUpdatedAt: string;
  /** A tombstone: the design was deleted on some device at this time. */
  deletedAt: string | null;
  /** Accounts the design is shared with (the list endpoint fills it in; empty when it is not shared). */
  members?: PlanMember[];
}

/** An account a cloud plan is shared with. */
export interface PlanMember {
  id: string;
  username: string;
}

/** A plan someone else shared with this account (GET /api/library, `shared`). */
export interface SharedDesign {
  ownerId: string;
  ownerName: string;
  id: string;
  name: string;
  icon: EntryIcon | null;
  updatedAt: string;
  planUpdatedAt: string;
  /** Everyone it is shared with, this account included. */
  members: PlanMember[];
}

export interface RemoteFolder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LibraryListResponse {
  designs: RemoteDesignMeta[];
  folders: RemoteFolder[];
  /** Plans other accounts shared with this one. */
  shared?: SharedDesign[];
}

/** PUT /api/library/designs/[id]. The plan rides only when it changed. */
export interface DesignUpsertBody {
  name: string;
  icon: EntryIcon | null;
  folderId: string | null;
  closed: boolean;
  favorite: boolean;
  order: number | null;
  communityPlanId: string | null;
  createdAt: string;
  updatedAt: string;
  planUpdatedAt: string;
  plan?: unknown;
}

/** PUT /api/library/folders/[id]. */
export interface FolderUpsertBody {
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** How many designs one account may hold. Plans are large. */
export const LIBRARY_MAX_DESIGNS = 500;
export const LIBRARY_MAX_FOLDERS = 200;
export const LIBRARY_DESIGN_NAME_MAX_LENGTH = 80;
export const LIBRARY_FOLDER_NAME_MAX_LENGTH = 60;
/** How many accounts one plan may be shared with. */
export const LIBRARY_MAX_MEMBERS = 20;
