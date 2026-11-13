import { useEffect, useState } from "react";
import api from "../api/axios";
import { useConfirm } from "./ConfirmDialog";

// Users page (admin): connect Google Drive, where employee documents are saved
// as hrdk-hrms/10001_RISHIKA_SONI/10001_RISHIKA_SONI_Aadhaar_Card.pdf.
// Server side: server/drive/.

// After Google's "Allow" page the server sends us back with ?drive=connected
// or ?drive=error:<why>. Read it once and tidy the address bar.
function takeRedirectResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("drive");
  if (!result) return null;
  params.delete("drive");
  const rest = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  return result === "connected"
    ? { ok: true, text: "Google Drive connected. New documents will be saved there." }
    : { ok: false, text: `Could not connect Google Drive: ${result.replace(/^error:/, "")}` };
}

export default function GoogleDriveCard() {
  const confirm = useConfirm();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState(takeRedirectResult);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get("/drive/status");
      setStatus(data);
      setError("");
      return data;
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      return null;
    }
  }

  useEffect(() => {
    load();
  }, []);

  // While old files are being moved, check progress every 2 seconds.
  const moving = status?.move?.running;
  useEffect(() => {
    if (!moving) return undefined;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [moving]);

  async function disconnectDrive() {
    const ok = await confirm({
      title: "Disconnect Google Drive?",
      message: "Files already in Drive stay there. New uploads will be saved on this PC until you connect again.",
      confirmLabel: "Disconnect",
      danger: true
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post("/drive/disconnect");
      setNote({ ok: true, text: "Google Drive disconnected." });
      await load();
    } catch (err) {
      setNote({ ok: false, text: err.response?.data?.message || err.message });
    } finally {
      setBusy(false);
    }
  }

  async function moveOldFiles() {
    setBusy(true);
    try {
      await api.post("/drive/move");
      await load();
    } catch (err) {
      setNote({ ok: false, text: err.response?.data?.message || err.message });
    } finally {
      setBusy(false);
    }
  }

  const move = status?.move;
  const folderUrl = status?.rootFolderId ? `https://drive.google.com/drive/folders/${status.rootFolderId}` : "";

  return (
    <section className="card drive-card">
      <div className="drive-card-head">
        <div>
          <h3 className="card-title">Google Drive</h3>
          <p className="kpi-sub">
            Employee documents are saved as hrdk-hrms / 10001_NAME / 10001_NAME_Aadhaar_Card.pdf
          </p>
        </div>
        {status?.connected && (
          <span className="drive-badge" title={status.email}>
            Connected{status.email ? ` · ${status.email}` : ""}
          </span>
        )}
      </div>

      {note && <p className={note.ok ? "drive-note" : "drive-note drive-note-error"}>{note.text}</p>}

      {error ? (
        <p className="state-panel">Could not check Google Drive: {error}</p>
      ) : !status ? (
        <p className="state-panel">Checking Google Drive…</p>
      ) : !status.configured ? (
        <p className="drive-note drive-note-error">
          Fill {status.missing.join(", ")} in server/.env, then restart the server.
        </p>
      ) : !status.connected ? (
        <div className="drive-actions">
          <p className="kpi-sub">Not connected: new documents are saved on this PC.</p>
          <button type="button" className="btn btn-primary" onClick={() => (window.location.href = "/api/drive/connect")}>
            Connect Google Drive
          </button>
        </div>
      ) : (
        <div className="drive-actions">
          {folderUrl && (
            <a className="btn" href={folderUrl} target="_blank" rel="noreferrer">
              Open hrdk-hrms folder
            </a>
          )}
          <button type="button" className="btn" disabled={busy || moving} onClick={moveOldFiles}>
            {moving ? `Moving… ${move.done} of ${move.total}` : "Move old files to Drive"}
          </button>
          <button type="button" className="btn btn-danger-outline" disabled={busy} onClick={disconnectDrive}>
            Disconnect
          </button>
        </div>
      )}

      {move?.finishedAt && !moving && (
        <p className={move.failedCount ? "drive-note drive-note-error" : "drive-note"}>
          {move.total
            ? `Moved ${move.done - move.failedCount} of ${move.total} files to Drive (copies stay on this PC as backup).`
            : "No old files left on this PC to move."}
          {move.failedCount ? ` ${move.failedCount} failed: ${move.failed.join("; ")}` : ""}
        </p>
      )}
    </section>
  );
}
