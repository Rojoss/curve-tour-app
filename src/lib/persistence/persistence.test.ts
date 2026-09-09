import { describe, expect, it } from "vitest";
import {
  LEGACY_ADMIN_PROOF_HASH_KEY,
  LEGACY_ADMIN_UNLOCKED_KEY,
  LEGACY_BRACKET_FOLLOW_KEY,
  LEGACY_LIVE_STATE_KEY,
  createFixedClock,
  createLegacyCompatibleIdSource,
  createPersistedTournamentFixture,
} from "../../domain/tournament";
import {
  clearAdminSession,
  loadLiveEnvelope,
  parseLiveEnvelope,
  readAdminSession,
  readBracketFollow,
  saveAdminSession,
  saveBracketFollow,
  saveLiveEnvelope,
  serializeLiveEnvelope,
  type BrowserStorage,
} from "./index";

class MemoryStorage implements BrowserStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const ids = createLegacyCompatibleIdSource(
  createFixedClock(1_700_000_000_123),
);

describe("legacy live-state envelope", () => {
  it("serializes the exact state/setup/tab envelope without adding a version", () => {
    const fixture = createPersistedTournamentFixture({
      activeTab: "scoreboard",
      state: { title: "Stored Cup" },
    });
    expect(JSON.parse(serializeLiveEnvelope(fixture))).toEqual(fixture);
    expect(Object.keys(JSON.parse(serializeLiveEnvelope(fixture)))).toEqual([
      "T",
      "setup",
      "activeTab",
    ]);
    expect(parseLiveEnvelope(serializeLiveEnvelope(fixture), ids)).toEqual(
      fixture,
    );
  });

  it("normalizes pre-pooling setup and assigns a missing tournament ID", () => {
    const parsed = parseLiveEnvelope(
      JSON.stringify({
        T: {
          title: "Old Cup",
          players: ["A", "B"],
          rounds: [{ roundNum: 1 }],
          tournamentId: null,
          unknownLegacyState: { preserved: true },
        },
        setup: {
          qual: "yes",
          roster: "A\nB",
          unknownSetupField: "legacy drops this on its next save",
        },
        activeTab: "rankings",
      }),
      ids,
    );
    expect(parsed.T).toMatchObject({
      title: "Old Cup",
      tournamentId: "1700000000123",
      unknownLegacyState: { preserved: true },
    });
    expect(parsed.setup).toMatchObject({
      poolingPhase: "qual-table",
      roster: "A\nB",
      finalsGames: "3",
    });
    expect(parsed.setup).not.toHaveProperty("qual");
    expect(parsed.setup).not.toHaveProperty("unknownSetupField");
    expect(parsed.activeTab).toBe("rankings");
  });

  it("pads old team rosters with real null slots without mutating input", () => {
    const raw = {
      T: {
        gameFormat: "team-3v3",
        players: [{
          teamId: "team-old",
          teamName: "Old Team",
          members: [{ name: "One" }],
        }],
        reserves: [{ teamId: "reserve-old", teamName: "Reserve" }],
      },
      setup: { gameFormat: "team-3v3" },
      activeTab: "admin",
    };
    const parsed = parseLiveEnvelope(JSON.stringify(raw), ids);
    expect(parsed.T.players).toEqual([{
      teamId: "team-old",
      teamName: "Old Team",
      members: [{ name: "One" }, null, null],
    }]);
    expect(parsed.T.reserves).toEqual([{
      teamId: "reserve-old",
      teamName: "Reserve",
      members: [null, null, null],
    }]);
    expect((raw.T.players[0].members as unknown[]).length).toBe(1);
  });
});

describe("storage policy", () => {
  it("loads, saves, and rejects malformed JSON without throwing", () => {
    const storage = new MemoryStorage();
    expect(loadLiveEnvelope(storage, ids)).toEqual({ status: "empty" });
    const fixture = createPersistedTournamentFixture({
      state: { title: "Saved" },
    });
    expect(saveLiveEnvelope(storage, fixture, { isViewer: false })).toEqual({
      status: "saved",
    });
    expect(loadLiveEnvelope(storage, ids)).toMatchObject({
      status: "loaded",
      envelope: { T: { title: "Saved" } },
    });
    storage.setItem(LEGACY_LIVE_STATE_KEY, "not json");
    expect(loadLiveEnvelope(storage, ids).status).toBe("invalid");
  });

  it("never overwrites the organiser state from viewer mode", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_LIVE_STATE_KEY, "organiser-state");
    const fixture = createPersistedTournamentFixture({
      state: { title: "Viewer" },
    });
    expect(saveLiveEnvelope(storage, fixture, { isViewer: true })).toEqual({
      status: "skipped-viewer",
    });
    expect(storage.getItem(LEGACY_LIVE_STATE_KEY)).toBe("organiser-state");
  });

  it("preserves credential string semantics and bracket-follow lifecycle", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_ADMIN_UNLOCKED_KEY, "TRUE");
    expect(readAdminSession(storage)).toEqual({
      unlocked: false,
      proofHash: null,
    });
    saveAdminSession(storage, "proof");
    expect(readAdminSession(storage)).toEqual({
      unlocked: true,
      proofHash: "proof",
    });
    clearAdminSession(storage);
    expect(storage.getItem(LEGACY_ADMIN_UNLOCKED_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_ADMIN_PROOF_HASH_KEY)).toBeNull();

    expect(readBracketFollow(storage)).toBeNull();
    saveBracketFollow(storage, "Team A");
    expect(storage.getItem(LEGACY_BRACKET_FOLLOW_KEY)).toBe("Team A");
    saveBracketFollow(storage, null);
    expect(readBracketFollow(storage)).toBeNull();
  });
});
