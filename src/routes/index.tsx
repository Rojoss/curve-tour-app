import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: MigrationShell,
});

function MigrationShell() {
  return (
    <main className="migration-shell">
      <p className="eyebrow">Curve Fever Pro Tour Hub</p>
      <h1>TanStack migration shell</h1>
      <p>
        The new application is intentionally empty until each legacy behavior is
        covered by a characterization test and migrated as a bounded slice.
      </p>
      <p>
        Run <code>pnpm dev:legacy</code> to use the frozen reference application.
      </p>
    </main>
  );
}
