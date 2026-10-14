import { art } from "./art";
import { POWERS } from "./steps";

/**
 * The six powers, all of them, plainly: an icon, a name and one line each. Nothing is highlighted in
 * turn and nothing dims; there is one Continue under it (the screen's).
 */
export function PowerList(): JSX.Element {
  return (
    <ul className="pw-list" aria-label="Your six powers">
      {POWERS.map((p) => (
        <li key={p.id} className="pw-item">
          <img src={art(`powers/power-${p.id}-lit`)} alt="" draggable={false} />
          <span className="pw-t">{p.title}</span>
          <span className="pw-f">{p.line}</span>
        </li>
      ))}
    </ul>
  );
}
