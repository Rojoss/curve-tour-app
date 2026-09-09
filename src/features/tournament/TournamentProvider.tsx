import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createEmptyTournamentState,
  createLegacySetupFixture,
  createTournamentRuntime,
  type ActiveTab,
  type PersistedSetup,
  type TournamentRuntime,
  type TournamentState,
} from "../../domain/tournament";
import {
  clearAdminSession,
  loadLiveEnvelope,
  readAdminSession,
  saveAdminSession,
  saveLiveEnvelope,
} from "../../lib/persistence";

export interface TournamentAppContext {
  state: TournamentState;
  setup: PersistedSetup;
  activeTab: ActiveTab;
  hydrated: boolean;
  unlocked: boolean;
  isViewer: boolean;
  viewTournamentId: string | null;
  runtime: TournamentRuntime;
  setActiveTab(tab: ActiveTab): void;
  updateState(
    updater: TournamentState | ((current: TournamentState) => TournamentState),
  ): void;
  updateSetup(
    updater: PersistedSetup | ((current: PersistedSetup) => PersistedSetup),
  ): void;
  unlockAdmin(proofHash: string): void;
  lockAdmin(): void;
}

const Context = createContext<TournamentAppContext | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const runtime = useMemo(() => createTournamentRuntime(), []);
  const [state, setState] = useState(createEmptyTournamentState);
  const [setup, setSetup] = useState(createLegacySetupFixture);
  const [activeTab, setActiveTabState] = useState<ActiveTab>("bracket");
  const [hydrated, setHydrated] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [isViewer, setIsViewer] = useState(false);
  const [viewTournamentId, setViewTournamentId] = useState<string | null>(null);

  useEffect(() => {
    const queryId = new URLSearchParams(window.location.search).get("t");
    const admin = readAdminSession(window.localStorage);
    const viewer = Boolean(queryId) && !admin.unlocked;
    let loadedState = createEmptyTournamentState();
    let loadedSetup = createLegacySetupFixture();
    let loadedTab: ActiveTab = "bracket";
    if (!viewer) {
      const loaded = loadLiveEnvelope(window.localStorage, runtime.ids);
      if (loaded.status === "loaded") {
        loadedState = loaded.envelope.T;
        loadedSetup = loaded.envelope.setup;
        loadedTab = loaded.envelope.activeTab;
      } else if (loaded.status === "invalid") {
        console.warn("Could not restore saved tournament state", loaded.error);
      }
      if (queryId && queryId !== loadedState.tournamentId) {
        loadedState = { ...loadedState, tournamentId: queryId };
      }
    } else if (queryId) {
      loadedState = { ...loadedState, tournamentId: queryId };
    }
    setState(loadedState);
    setSetup(loadedSetup);
    setActiveTabState(viewer ? "bracket" : loadedTab);
    setUnlocked(admin.unlocked);
    setIsViewer(viewer);
    setViewTournamentId(queryId);
    setHydrated(true);
  }, [runtime]);

  const persist = useCallback(
    (
      nextState: TournamentState,
      nextSetup: PersistedSetup,
      nextTab: ActiveTab,
      viewer = isViewer,
    ) => {
      if (typeof window === "undefined") return;
      const result = saveLiveEnvelope(
        window.localStorage,
        { T: nextState, setup: nextSetup, activeTab: nextTab },
        { isViewer: viewer },
      );
      if (result.status === "failed") {
        console.warn("Could not save tournament state", result.error);
      }
    },
    [isViewer],
  );

  const setActiveTab = useCallback(
    (tab: ActiveTab) => {
      setActiveTabState(tab);
      persist(state, setup, tab);
    },
    [persist, setup, state],
  );
  const updateState = useCallback(
    (
      updater: TournamentState | ((current: TournamentState) => TournamentState),
    ) => {
      setState((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        persist(next, setup, activeTab);
        return next;
      });
    },
    [activeTab, persist, setup],
  );
  const updateSetup = useCallback(
    (
      updater: PersistedSetup | ((current: PersistedSetup) => PersistedSetup),
    ) => {
      setSetup((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        persist(state, next, activeTab);
        return next;
      });
    },
    [activeTab, persist, state],
  );
  const unlockAdmin = useCallback(
    (proofHash: string) => {
      saveAdminSession(window.localStorage, proofHash);
      setUnlocked(true);
      if (isViewer) {
        setIsViewer(false);
        const next = {
          ...state,
          tournamentId: viewTournamentId,
        };
        setState(next);
        persist(next, setup, "admin", false);
      }
      setActiveTabState("admin");
    },
    [isViewer, persist, setup, state, viewTournamentId],
  );
  const lockAdmin = useCallback(() => {
    clearAdminSession(window.localStorage);
    setUnlocked(false);
    setActiveTabState("bracket");
    persist(state, setup, "bracket");
  }, [persist, setup, state]);

  const value = useMemo<TournamentAppContext>(
    () => ({
      state,
      setup,
      activeTab,
      hydrated,
      unlocked,
      isViewer,
      viewTournamentId,
      runtime,
      setActiveTab,
      updateState,
      updateSetup,
      unlockAdmin,
      lockAdmin,
    }),
    [
      activeTab,
      hydrated,
      isViewer,
      lockAdmin,
      runtime,
      setActiveTab,
      setup,
      state,
      unlockAdmin,
      unlocked,
      updateSetup,
      updateState,
      viewTournamentId,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTournamentApp(): TournamentAppContext {
  const value = useContext(Context);
  if (!value) throw new Error("useTournamentApp requires TournamentProvider.");
  return value;
}
