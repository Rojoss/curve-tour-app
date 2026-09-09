import { useEffect, useRef, useState } from "react";
import { verifyAdminSecret } from "../sync/firebase-client";

export function AdminPasswordModal({
  open,
  onCancel,
  onUnlocked,
}: {
  open: boolean;
  onCancel(): void;
  onUnlocked(proofHash: string): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError("");
    queueMicrotask(() => input.current?.focus());
  }, [open]);
  if (!open) return null;

  async function submit() {
    setChecking(true);
    setError("");
    try {
      const proof = await verifyAdminSecret(password);
      onUnlocked(proof);
    } catch (caught) {
      const code =
        typeof caught === "object" && caught && "code" in caught
          ? String(caught.code)
          : "";
      setError(
        code === "OFFLINE" || code.includes("network")
          ? "Can't verify the password right now — check your connection and try again."
          : "Incorrect password.",
      );
      setPassword("");
      queueMicrotask(() => input.current?.focus());
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
        <div className="modal-title" id="admin-dialog-title">🔒 Admin access</div>
        <div className="field">
          <input
            ref={input}
            type="password"
            placeholder="Enter admin password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !checking) void submit();
              if (event.key === "Escape" && !checking) onCancel();
            }}
          />
        </div>
        {error ? <div className="msg msg-err">{error}</div> : null}
        <div className="modal-btns">
          <button className="btn btn-success" disabled={checking} onClick={() => void submit()}>
            {checking ? "Checking…" : "Unlock"}
          </button>
          <button className="btn btn-secondary" disabled={checking} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
