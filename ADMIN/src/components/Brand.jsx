import mark from "../assets/logo.png";

// Company lockup shared with the other HRDK apps: the HR mark, the name in a
// serif, the trade line in small teal capitals.
export default function Brand({ className = "" }) {
  return (
    <span className={`hrdk ${className}`}>
      <img className="hrdk-mark" src={mark} alt="" width="128" height="128" draggable="false" />
      <span className="hrdk-text">
        <span className="hrdk-name">HRDK</span>
        <span className="hrdk-trade">Jewel Craft</span>
      </span>
    </span>
  );
}
