import { useEffect, useState } from "react";
import api, { API_URL } from "../api/axios";

// Popup that shows one employee document large over the page: an image
// fitted to the screen, a PDF in a frame, Excel only as Download. The cross,
// Esc or a click outside closes it. The file is fetched through the API (with
// the sign-in) as a blob, so it also works when the admin site and the API are
// on different hosts. Used by Add Employee > Documents and All Documents.

// Images and PDFs can be shown; Excel only downloads.
export const viewable = (doc) => doc?.mimeType === "application/pdf" || /^image\//.test(doc?.mimeType || "");

export const documentUrl = (employeeId, doc, download) =>
  `${API_URL}/employees/${encodeURIComponent(employeeId)}/documents/${doc.id}${download ? "?download=1" : ""}`;

// employeeId + doc to show; onClose when the popup closes. Renders nothing
// without a doc.
export default function DocumentViewer({ employeeId, doc, onClose, label }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!doc) return undefined;
    let gone = false;
    let made = "";
    setUrl("");
    setError("");
    if (viewable(doc)) {
      api
        .get(`/employees/${encodeURIComponent(employeeId)}/documents/${doc.id}`, { responseType: "blob" })
        .then(({ data }) => {
          made = URL.createObjectURL(new Blob([data], { type: doc.mimeType }));
          if (gone) URL.revokeObjectURL(made);
          else setUrl(made);
        })
        .catch((err) => !gone && setError(err.response?.status === 404 ? "File missing on server" : err.message));
    }
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
      window.removeEventListener("keydown", onKey);
    };
  }, [employeeId, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <div className="doc-viewer" role="dialog" aria-modal="true" aria-label={doc.title} onClick={onClose}>
      <div className="doc-viewer-bar" onClick={stop}>
        <span className="doc-viewer-title">{label || `${doc.title} · ${doc.fileName}`}</span>
        <a className="btn" href={documentUrl(employeeId, doc, true)}>
          Download
        </a>
        <button type="button" className="doc-viewer-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="doc-viewer-body">
        {!viewable(doc) ? (
          <p className="doc-viewer-note" onClick={stop}>
            An Excel file can't be shown here. Use Download to open it.
          </p>
        ) : error ? (
          <p className="doc-viewer-note" onClick={stop}>
            Could not open: {error}
          </p>
        ) : !url ? (
          <p className="doc-viewer-note">Opening…</p>
        ) : doc.mimeType === "application/pdf" ? (
          <iframe className="doc-viewer-pdf" src={url} title={doc.fileName} onClick={stop} />
        ) : (
          <img className="doc-viewer-img" src={url} alt={doc.title} onClick={stop} />
        )}
      </div>
    </div>
  );
}
