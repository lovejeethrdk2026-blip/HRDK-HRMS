export default function Placeholder({ title, note }) {
  return (
    <div className="portal portal-signed-in">
      <section className="log-section placeholder-section">
        <h2 className="log-heading">{title}</h2>
        <p className="empty-note">{note || "This section is coming soon."}</p>
      </section>
    </div>
  );
}
