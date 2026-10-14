import type { Client } from "./clients";
import "./newcampaign.css";

/**
 * A client's mark: its first letter on a tile. No favicon lookups, so a
 * client's domain is never sent to a third party just to draw a list.
 */
export function ClientLogo({ client, size = 28 }: { client: Pick<Client, "name">; size?: number }) {
  return (
    <span className="clg" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }} aria-hidden="true">
      <b style={{ fontSize: Math.max(12, Math.round(size * 0.42)) }}>{client.name.trim().charAt(0).toUpperCase() || "?"}</b>
    </span>
  );
}
