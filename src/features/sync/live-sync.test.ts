import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyTournamentState } from "../../domain/tournament";
import {
  FIREBASE_NULL_SENTINEL_KEY,
  SyncCoordinator,
  marshalNullsForFirebase,
  mergeRemoteWriterState,
  unmarshalNullsFromFirebase,
  type SyncStatus,
  type SyncTransport,
} from "./live-sync";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function fakeTransport() {
  const listeners = new Map<string, { value(payload: unknown): void; error(error: unknown): void }>();
  const writes: Array<{ tournamentId: string; payload: any }> = [];
  let pending: ReturnType<typeof deferred> | null = null;
  let unsubscribeCount = 0;
  const transport: SyncTransport = {
    async write(tournamentId, payload) {
      writes.push({ tournamentId, payload });
      if (pending) await pending.promise;
    },
    subscribe(tournamentId, value, error) {
      listeners.set(tournamentId, { value, error });
      return () => { listeners.delete(tournamentId); unsubscribeCount += 1; };
    },
  };
  return {
    transport,
    writes,
    listeners,
    deferWrite() { pending = deferred(); return pending; },
    get unsubscribeCount() { return unsubscribeCount; },
  };
}

describe("live synchronization protocol", () => {
  beforeEach(() => vi.useRealTimers());

  it("round-trips Firebase-null sentinels without shifting array positions", () => {
    const source = { members: [{ name: "One" }, null, { name: "Three" }], nested: null };
    const wire = marshalNullsForFirebase(source) as any;
    expect(wire.members[1]).toEqual({ [FIREBASE_NULL_SENTINEL_KEY]: true });
    expect(unmarshalNullsFromFirebase(wire)).toEqual(source);
  });

  it("strips proof, lets unrelated remote fields merge, and protects dirty scores", () => {
    const local = createEmptyTournamentState({ title: "Local", scores: { a: 8 }, finalScores: { f: 9 } });
    const merged = mergeRemoteWriterState(local, {
      title: "Remote", adminProof: "secret", scores: { a: 1, b: 2 }, finalScores: { f: 3, g: 4 },
    }, new Set(["a"]), new Set(["f"]))!;
    expect(merged.title).toBe("Remote");
    expect(merged.scores).toEqual({ a: 8, b: 2 });
    expect(merged.finalScores).toEqual({ f: 9, g: 4 });
    expect(merged).not.toHaveProperty("adminProof");
  });

  it("debounces writes and only clears a dirty key whose pushed value is still current", async () => {
    vi.useFakeTimers();
    const fake = fakeTransport();
    const statuses: SyncStatus[] = [];
    let current = createEmptyTournamentState({ tournamentId: "tour", started: true });
    const coordinator = new SyncCoordinator(current, {
      transport: fake.transport,
      delayMs: 400,
      onStatus: (status) => statuses.push(status),
      onRemote: (state) => { current = state; coordinator.setCurrent(state); },
    });
    coordinator.configure("writer", "tour", "proof");
    let next = { ...current, scores: { a: 1 }, title: "First" };
    coordinator.updateLocal(current, next);
    current = next;
    next = { ...current, scores: { a: 2 }, title: "Second" };
    coordinator.updateLocal(current, next);
    current = next;
    const inFlight = fake.deferWrite();
    await vi.advanceTimersByTimeAsync(400);
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toMatchObject({ tournamentId: "tour", payload: { title: "Second", scores: { a: 2 }, adminProof: "proof" } });

    next = { ...current, scores: { a: 3 } };
    coordinator.updateLocal(current, next);
    current = next;
    fake.listeners.get("tour")?.value({ title: "Other admin", scores: { a: 0, b: 5 }, finalScores: {} });
    expect(current.title).toBe("Other admin");
    expect(current.scores).toEqual({ a: 3, b: 5 });
    inFlight.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(400);
    expect(fake.writes).toHaveLength(2);
    expect(statuses.at(-1)).toEqual({ kind: "active" });
    coordinator.dispose();
  });

  it("supports viewer waiting/stale states, never writes, and tears listeners down", () => {
    const fake = fakeTransport();
    const statuses: SyncStatus[] = [];
    let current = createEmptyTournamentState({ tournamentId: "view" });
    const coordinator = new SyncCoordinator(current, {
      transport: fake.transport,
      onStatus: (status) => statuses.push(status),
      onRemote: (state) => { current = state; },
    });
    coordinator.configure("viewer", "view", null);
    fake.listeners.get("view")?.value(null);
    expect(statuses.at(-1)).toEqual({ kind: "waiting" });
    fake.listeners.get("view")?.value({ title: "Live", scores: {}, finalScores: {} });
    expect(current.title).toBe("Live");
    fake.listeners.get("view")?.error(new Error("offline"));
    expect(statuses.at(-1)).toEqual({ kind: "stale" });
    coordinator.updateLocal(current, { ...current, title: "must not write" });
    expect(fake.writes).toHaveLength(0);
    coordinator.configure("viewer", "another", null);
    expect(fake.unsubscribeCount).toBe(1);
    coordinator.dispose();
    expect(fake.unsubscribeCount).toBe(2);
  });

  it("merges different score keys across writers and keeps same-key updates last-write-wins", async () => {
    vi.useFakeTimers();
    const listeners = new Set<(payload: unknown) => void>();
    const transport: SyncTransport = {
      async write(_tournamentId, payload) { listeners.forEach((listener) => listener(payload)); },
      subscribe(_tournamentId, onValue) { listeners.add(onValue); return () => listeners.delete(onValue); },
    };
    let a = createEmptyTournamentState({ tournamentId: "shared", started: true });
    let b = createEmptyTournamentState({ tournamentId: "shared", started: true });
    const writerA = new SyncCoordinator(a, { transport, onStatus: () => undefined, onRemote: (state) => { a = state; writerA.setCurrent(state); } });
    const writerB = new SyncCoordinator(b, { transport, onStatus: () => undefined, onRemote: (state) => { b = state; writerB.setCurrent(state); } });
    writerA.configure("writer", "shared", "proof");
    writerB.configure("writer", "shared", "proof");
    const aLocal = { ...a, scores: { a: 10 } };
    writerA.updateLocal(a, aLocal);
    a = aLocal;
    const bLocal = { ...b, scores: { b: 20 } };
    writerB.updateLocal(b, bLocal);
    b = bLocal;
    await vi.advanceTimersByTimeAsync(400);
    expect(a.scores).toEqual({ a: 10, b: 20 });
    expect(b.scores).toEqual({ a: 10, b: 20 });

    const bWins = { ...b, scores: { ...b.scores, a: 99 } };
    writerB.updateLocal(b, bWins);
    b = bWins;
    await vi.advanceTimersByTimeAsync(400);
    expect(a.scores.a).toBe(99);
    expect(b.scores.a).toBe(99);
    writerA.dispose();
    writerB.dispose();
  });
});
