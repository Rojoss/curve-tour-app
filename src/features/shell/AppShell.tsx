import { useState } from "react";
import type { ActiveTab } from "../../domain/tournament";
import { AdminPasswordModal } from "../auth/AdminPasswordModal";
import { BracketView } from "../bracket/BracketView";
import { SetupView } from "../admin/SetupView";
import { RunningAdmin } from "../admin/RunningAdmin";
import { RankingsView } from "../rankings/RankingsView";
import { ScoreboardView } from "../scoreboard/ScoreboardView";
import { ArchiveView } from "../archive/ArchiveView";
import { useTournamentApp } from "../tournament/TournamentProvider";

const TABS: Array<{ key: ActiveTab; label: string }> = [
  { key: "admin", label: "⚙ Admin" },
  { key: "scoreboard", label: "📊 Scoreboard" },
  { key: "bracket", label: "🗂 Bracket" },
  { key: "rankings", label: "🏆 Rankings" },
  { key: "archive", label: "🗄 Archive" },
];

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
      {app.isViewer && app.syncStatus.kind === "stale" ? <div className="msg msg-err sync-stale-banner">⚠ Live connection lost — what you&apos;re seeing may be out of date. Reload to try reconnecting.</div> : null}
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
          <section id="view-scoreboard"><ScoreboardView /></section>
        ) : null}
        <section id="view-bracket" hidden={app.activeTab !== "bracket"}><BracketView /></section>
        {app.activeTab === "rankings" ? (
          <section id="view-rankings"><RankingsView /></section>
        ) : null}
        {app.activeTab === "archive" ? (
          <section id="view-archive"><ArchiveView /></section>
        ) : null}
      </main>
      {app.isViewer && ["connecting", "waiting", "unavailable"].includes(app.syncStatus.kind) ? <div className="modal-overlay sync-viewer-overlay" role="status"><div className="modal-box">
        <div className="modal-title">{app.syncStatus.kind === "waiting" ? "Waiting for the tournament to start…" : app.syncStatus.kind === "unavailable" ? "Live sync unavailable" : "Connecting…"}</div>
        <p>{app.syncStatus.kind === "waiting"
          ? "This link is valid, but the organiser hasn’t generated a schedule yet. This page updates automatically once they do."
          : app.syncStatus.kind === "unavailable"
            ? "The live-sync library couldn’t load — check your connection and reload the page."
            : "Loading the live tournament."}</p>
      </div></div> : null}
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
