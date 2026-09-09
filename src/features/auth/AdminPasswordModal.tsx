import { useEffect, useRef, useState } from "react";
import { verifyAdminSecret } from "../sync/firebase-client";
import { Alert, Button, Field, Input, Modal, ModalActions } from "../../components/ui";

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
    <Modal title="🔒 Admin access" titleId="admin-dialog-title">
        <Field label="Password">
          <Input
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
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <ModalActions>
          <Button variant="success" disabled={checking} onClick={() => void submit()}>
            {checking ? "Checking…" : "Unlock"}
          </Button>
          <Button disabled={checking} onClick={onCancel}>Cancel</Button>
        </ModalActions>
    </Modal>
  );
}
