import { X } from "lucide-react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * A panel, rendered into the shell rather than where it is written.
 *
 * `.app-shell > main` carries `z-index:1` and `.app-shell > header` carries 30, so the header
 * and the ticker paint over *everything* inside main however high its own z-index — the
 * panel asked for 61 and still had its title bar and its close button hidden under the
 * ticker. Portalling it out makes its 61 compete with the header's 30, which it wins.
 * `.app-shell` rather than `body`, because every colour token is defined there.
 */
export default function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(<>
    <button className="picker-backdrop" onClick={onClose} tabIndex={-1} aria-hidden="true" />
    <div className="picker-panel" role="dialog" aria-label={title}>
      <div className="picker-head">
        <b>{title}</b>
        <button onClick={onClose} aria-label={title}><X /></button>
      </div>
      {children}
    </div>
  </>, document.querySelector(".app-shell") ?? document.body);
}
