import { useState } from "react";
import type { ActiveTab } from "../../domain/tournament";
import { AdminPasswordModal } from "../auth/AdminPasswordModal";
import { SetupView } from "../admin/SetupView";
import { RunningAdmin } from "../admin/RunningAdmin";
import { useTournamentApp } from "../tournament/TournamentProvider";

const TABS: Array<{ key: ActiveTab; label: string }> = [
  { key: "admin", label: "⚙ Admin" },
  { key: "scoreboard", label: "📊 Scoreboard" },
  { key: "bracket", label: "🗂 Bracket" },
  { key: "rankings", label: "🏆 Rankings" },
  { key: "archive", label: "🗄 Archive" },
];

function EmptyView({ children }: { children: React.ReactNode }) {
  return <div className="msg msg-info">{children}</div>;
}

export function AppShell() {
  const app = useTournamentApp();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const currentRound = app.state.rounds[app.state.curRound];

  function chooseTab(tab: ActiveTab) {
    if (tab === "admin" && !app.unlocked) {
      setPasswordOpen(true);
      return;
    }
    app.setActiveTab(tab);
  }

  return (
    <>
      <header>
        <div className="logo">CFP <span>Tour Hub</span></div>
        <div className="round-display">
          <button
            className={`hdr-title ${app.state.title ? "" : "placeholder"}`}
            onClick={() => chooseTab("admin")}
            title={app.state.title}
          >
            {app.state.title || "Unnamed Tournament — click to name"}
          </button>
          <div className="lbl">Round</div>
          <div className="num">{currentRound?.roundNum ?? "—"}</div>
        </div>
      </header>
      <nav aria-label="Tournament sections">
        {TABS.filter((tab) => !(app.isViewer && tab.key === "archive")).map((tab) => (
          <button
            key={tab.key}
            className={app.activeTab === tab.key ? "active" : ""}
            aria-current={app.activeTab === tab.key ? "page" : undefined}
            onClick={() => chooseTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main data-hydrated={app.hydrated ? "true" : "false"}>
        {app.activeTab === "admin" ? (
          <section id="view-admin">
            <div className="card">
              <div className="card-title">Admin Access</div>
              <div className="msg msg-ok">🔓 Unlocked in this browser.</div>
              <div className="btn-row">
                <button className="btn btn-amber btn-sm" onClick={app.lockAdmin}>🔒 Lock Admin</button>
              </div>
            </div>
            {app.state.started ? <RunningAdmin /> : <SetupView />}
          </section>
        ) : null}
        {app.activeTab === "scoreboard" ? (
          <section id="view-scoreboard">
            <EmptyView>{app.state.started ? "Live scoreboard is loading." : "Start a tournament in Admin to see the live scoreboard."}</EmptyView>
          </section>
        ) : null}
        {app.activeTab === "bracket" ? (
          <section id="view-bracket">
            <EmptyView>{app.state.started ? "Tournament bracket is loading." : "Start a tournament in Admin to see the bracket overview."}</EmptyView>
          </section>
        ) : null}
        {app.activeTab === "rankings" ? (
          <section id="view-rankings">
            <EmptyView>{app.state.players.length ? "Tournament rankings are loading." : "No players registered yet — check back once the organiser loads a roster in Admin."}</EmptyView>
          </section>
        ) : null}
        {app.activeTab === "archive" ? (
          <section id="view-archive"><EmptyView>No tournaments archived yet — completed tournaments saved from Admin will show up here, or import a previously exported file.</EmptyView></section>
        ) : null}
      </main>
      <AdminPasswordModal
        open={passwordOpen}
        onCancel={() => setPasswordOpen(false)}
        onUnlocked={(proof) => {
          app.unlockAdmin(proof);
          setPasswordOpen(false);
        }}
      />
    </>
  );
}
