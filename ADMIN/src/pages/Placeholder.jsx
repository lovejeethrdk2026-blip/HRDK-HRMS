export default function Placeholder({ title, note }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
      </div>

      <div className="card">
        <p className="state-panel">{note}</p>
      </div>
    </div>
  );
}
