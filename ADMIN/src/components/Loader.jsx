// Loading state: a thin animated progress line with a short label under it,
// always centered in the screen (see .loader in index.css).
export default function Loader({ text = "Loading…" }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader-line" aria-hidden="true">
        <span className="loader-line-bar" />
      </span>
      <span className="loader-text">{text}</span>
    </div>
  );
}
