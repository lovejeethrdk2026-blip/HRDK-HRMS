import { createContext, useContext, useEffect, useRef, useState } from "react";

// The app's own "Are you sure?" box, in place of the browser's
// window.confirm: centred over the page in the same card as the Department
// dialogs. Anywhere under ConfirmProvider (main.jsx):
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title, message, confirmLabel, danger: true }))) return;
//
// resolves true on the confirm button (or Enter), false on Cancel, Escape or a
// click outside.

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null); // { title, message, confirmLabel, danger, resolve }

  function confirm(options) {
    return new Promise((resolve) => setRequest({ ...options, resolve }));
  }

  function close(answer) {
    request?.resolve(answer);
    setRequest(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmBox request={request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

function ConfirmBox({ request, onClose }) {
  const { title = "Are you sure?", message, confirmLabel = "OK", danger = false } = request;
  const confirmButton = useRef(null);

  useEffect(() => {
    confirmButton.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") onClose(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div
        className={`modal-card dept-modal confirm-modal${danger ? " is-danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className="confirm-body">
          <span className="confirm-icon" aria-hidden="true">
            {danger ? (
              <svg viewBox="0 0 20 20" width="20" height="20">
                <path
                  d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10M9 9v4M11 9v4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" width="20" height="20">
                <path
                  d="M10 6v5M10 14v.01M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
          <div>
            <h2 id="confirm-title" className="confirm-title">
              {title}
            </h2>
            {message && (
              <p id="confirm-message" className="confirm-message">
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="dept-modal-actions confirm-actions">
          <button type="button" className="btn" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button
            ref={confirmButton}
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
