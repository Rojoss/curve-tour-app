import { describe, expect, it } from "vitest";
import { createEmptyTournamentState } from "../../domain/tournament";
import {
  archiveBundle,
  deleteArchive,
  findLatestArchiveEntryForTournament,
  loadArchiveEntry,
  loadArchiveIndex,
  parseArchiveImport,
  runArchiveImport,
  updateArchiveAnnotations,
  writeArchiveSnapshot,
  type ArchiveEntry,
  type BrowserStorage,
} from "./index";

function memoryStorage(): BrowserStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("legacy-compatible tournament archive", () => {
  it("writes the exact entry and summary shape and preserves annotations on overwrite", () => {
    const storage = memoryStorage();
    const state = createEmptyTournamentState({
      title: "Weekly", tournamentId: "tour-1", players: ["A", "B"],
      rounds: [{ roundNum: 3, players: 2, rooms: [2], byeCount: 0, isQual: false, isNoElim: false, isSemis: false, isFinal: true, advPerRoom: null, advTotal: 0, luckyCount: 0 }],
    });
    const first = writeArchiveSnapshot({ storage, state, id: "10", dateSaved: "2026-01-01T00:00:00.000Z" });
    updateArchiveAnnotations(storage, "10", [{ text: "note", timestamp: "2026-01-02T00:00:00.000Z" }]);
    const second = writeArchiveSnapshot({ storage, state: { ...state, title: "Renamed" }, id: "10", dateSaved: "2026-01-03T00:00:00.000Z", keepAnnotations: true });
    expect(Object.keys(first)).toEqual(["id", "title", "dateSaved", "tournamentId", "snapshot", "annotations"]);
    expect(loadArchiveIndex(storage)).toEqual([{ id: "10", title: "Renamed", dateSaved: "2026-01-03T00:00:00.000Z", tournamentId: "tour-1", playerCount: 2, roundsPlayed: 3 }]);
    expect(second.annotations).toEqual([{ text: "note", timestamp: "2026-01-02T00:00:00.000Z" }]);
  });

  it("selects the newest archive sharing a tournament ID", () => {
    expect(findLatestArchiveEntryForTournament([
      { id: "new", title: "X", dateSaved: "2026-02-01T00:00:00Z", tournamentId: "same", playerCount: 1, roundsPlayed: 1 },
      { id: "old", title: "X", dateSaved: "2026-01-01T00:00:00Z", tournamentId: "same", playerCount: 1, roundsPlayed: 1 },
    ], "same")?.id).toBe("new");
  });

  it("routes single and bundle imports structurally and rejects malformed data", () => {
    const entry = { id: "a", snapshot: { players: [], rounds: [], assignments: [] } };
    expect(parseArchiveImport(JSON.stringify(entry))).toMatchObject({ status: "valid", isBundle: false });
    expect(parseArchiveImport(JSON.stringify({ tournaments: [entry, {}] }))).toMatchObject({ status: "valid", isBundle: true, invalid: 1 });
    expect(parseArchiveImport("{")).toEqual({ status: "invalid-json" });
    expect(parseArchiveImport("{}" )).toEqual({ status: "invalid-shape" });
    expect(parseArchiveImport('{"tournaments":[]}')).toEqual({ status: "empty-bundle" });
  });

  it("imports overwrite/new/skip collisions without touching unrelated entries", () => {
    const storage = memoryStorage();
    const state = createEmptyTournamentState({ title: "Original", tournamentId: "tour" });
    writeArchiveSnapshot({ storage, state, id: "same", dateSaved: "2026-01-01T00:00:00Z" });
    const raw: ArchiveEntry = { id: "same", title: "Imported", dateSaved: "bad", tournamentId: "tour", snapshot: { ...state, title: "Imported" }, annotations: [] };
    const skipped = runArchiveImport({ storage, entries: [raw], mode: "skip", now: "2026-02-01T00:00:00Z", mintId: () => "new" });
    expect(skipped.skippedDup).toBe(1);
    const copied = runArchiveImport({ storage, entries: [raw], mode: "new", now: "2026-02-01T00:00:00Z", mintId: () => "copy" });
    expect(copied.added).toBe(1);
    expect(loadArchiveEntry(storage, "copy")?.dateSaved).toBe("2026-02-01T00:00:00Z");
    expect(archiveBundle(storage, "2026-03-01T00:00:00Z").tournaments).toHaveLength(2);
    deleteArchive(storage, "same");
    expect(loadArchiveEntry(storage, "same")).toBeNull();
    expect(loadArchiveIndex(storage).map((entry) => entry.id)).toEqual(["copy"]);
  });
});
