import { useState } from "react";

const DOCUMENT_TYPES = [
  "Aadhaar Card",
  "PAN Card",
  "Voter ID Card",
  "Passport",
  "Driving Licence",
  "Ration Card",
  "Bank Passbook",
  "Customer Photograph",
  "Signature Proof"
];

export default function Document() {
  const [files, setFiles] = useState({}); // docType -> File

  function handleSelect(docType, fileList) {
    const file = fileList?.[0] || null;
    setFiles((prev) => ({ ...prev, [docType]: file }));
  }

  function handleRemove(docType) {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
  }

  return (
    <div className="portal portal-signed-in">
      <section className="log-section">
        <h2 className="log-heading">Documents</h2>
        <p className="empty-note doc-note">
          Select a file for each document you want to keep on record. Nothing is uploaded yet
          &mdash; this is a preview.
        </p>

        <div className="doc-list">
          {DOCUMENT_TYPES.map((docType) => {
            const file = files[docType];
            const inputId = `doc-${docType.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

            return (
              <div key={docType} className="doc-row">
                <span className="doc-name">{docType}</span>

                <div className="doc-action">
                  {file ? (
                    <>
                      <span className="doc-filename mono">{file.name}</span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleRemove(docType)}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="doc-filename doc-filename-empty">No file chosen</span>
                  )}

                  <label className="btn upload-btn" htmlFor={inputId}>
                    {file ? "Change" : "Upload"}
                  </label>
                  <input
                    id={inputId}
                    type="file"
                    className="doc-file-input"
                    onChange={(e) => handleSelect(docType, e.target.files)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
