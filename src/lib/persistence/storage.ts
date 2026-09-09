import {
  LEGACY_ADMIN_PROOF_HASH_KEY,
  LEGACY_ADMIN_UNLOCKED_KEY,
  LEGACY_BRACKET_FOLLOW_KEY,
  LEGACY_LIVE_STATE_KEY,
  type IdSource,
  type PersistedTournamentEnvelope,
} from "../../domain/tournament";
import { parseLiveEnvelope, serializeLiveEnvelope } from "./live-state";

export interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadLiveEnvelopeResult =
  | { status: "empty" }
  | { status: "loaded"; envelope: PersistedTournamentEnvelope }
  | { status: "invalid"; error: unknown };

export function loadLiveEnvelope(
  storage: BrowserStorage,
  ids: Pick<IdSource, "tournamentId">,
): LoadLiveEnvelopeResult {
  try {
    const raw = storage.getItem(LEGACY_LIVE_STATE_KEY);
    if (!raw) return { status: "empty" };
    return { status: "loaded", envelope: parseLiveEnvelope(raw, ids) };
  } catch (error) {
    return { status: "invalid", error };
  }
}

export function saveLiveEnvelope(
  storage: BrowserStorage,
  envelope: PersistedTournamentEnvelope,
  options: { isViewer: boolean },
): { status: "saved" | "skipped-viewer" | "failed"; error?: unknown } {
  if (options.isViewer) return { status: "skipped-viewer" };
  try {
    storage.setItem(LEGACY_LIVE_STATE_KEY, serializeLiveEnvelope(envelope));
    return { status: "saved" };
  } catch (error) {
    return { status: "failed", error };
  }
}

export function clearLiveEnvelope(storage: BrowserStorage): void {
  storage.removeItem(LEGACY_LIVE_STATE_KEY);
}

export interface AdminSession {
  unlocked: boolean;
  proofHash: string | null;
}

export function readAdminSession(storage: BrowserStorage): AdminSession {
  return {
    unlocked: storage.getItem(LEGACY_ADMIN_UNLOCKED_KEY) === "true",
    proofHash: storage.getItem(LEGACY_ADMIN_PROOF_HASH_KEY),
  };
}

export function saveAdminSession(
  storage: BrowserStorage,
  proofHash: string,
): void {
  storage.setItem(LEGACY_ADMIN_UNLOCKED_KEY, "true");
  storage.setItem(LEGACY_ADMIN_PROOF_HASH_KEY, proofHash);
}

export function clearAdminSession(storage: BrowserStorage): void {
  storage.removeItem(LEGACY_ADMIN_UNLOCKED_KEY);
  storage.removeItem(LEGACY_ADMIN_PROOF_HASH_KEY);
}

export function readBracketFollow(storage: BrowserStorage): string | null {
  return storage.getItem(LEGACY_BRACKET_FOLLOW_KEY);
}

export function saveBracketFollow(
  storage: BrowserStorage,
  unitKey: string | null,
): void {
  if (unitKey === null) storage.removeItem(LEGACY_BRACKET_FOLLOW_KEY);
  else storage.setItem(LEGACY_BRACKET_FOLLOW_KEY, unitKey);
}
