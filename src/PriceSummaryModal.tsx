import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { nightSummary, nextPriceDeadline, projectedAt, type NightGroup } from "./services/priceChanges";
import type { PlayerOwner } from "./services/ownership";
import type { Language, PriceMarket } from "./types";
import "./playerModal.css";

export default function PriceSummaryModal({ market, owners, language, now, onClose }: {
  market: PriceMarket; owners: Map<number, PlayerOwner[]>; language: Language; now: number; onClose: () => void;
}) {
  const fi = language === "fi";
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button,[tabindex="0"]') ?? [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, []);
  const groups = nightSummary(market, now);
  const next = nextPriceDeadline(market, now);
  const titles: Array<[NightGroup, string, string]> = [["risers", "Nousijat", "Risers"], ["fallers", "Laskijat", "Fallers"], ["maybeRisers", "Saattaa nousta", "May rise"], ["maybeFallers", "Saattaa laskea", "May fall"]];
  return createPortal(<div className="player-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="player-modal price-night-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="price-night-title" tabIndex={-1}>
      <header className="player-modal-head"><div><small>{next ? new Intl.DateTimeFormat(fi ? "fi-FI" : "en-GB", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(next)) : "—"}</small><h2 id="price-night-title">{fi ? "Yön hintamuutokset" : "Tonight’s price changes"}</h2></div><button onClick={onClose} aria-label={fi ? "Sulje yhteenveto" : "Close summary"}><X size={21} /></button></header>
      <div className="player-modal-body"><p className="player-modal-note">{fi ? "Kaikki pelaajat seuraavassa hinnanmuutoksessa. Ennuste perustuu samoihin lukuihin kuin taulukko. Saattaa nousta/laskea -ryhmissä ennuste on lähellä muutosrajaa tai muutos saattaa siirtyä seuraavaan yöhön. Ennuste ei takaa hinnanmuutosta." : "All players at the next price change, using the same forecast as the table. Possible changes are near the threshold or may slip to the following night. Predictions are not guaranteed."}</p>
        {!next ? <p>{fi ? "Seuraavaa hinnanmuutosaikaa ei ole saatavilla." : "No upcoming price-change time available."}</p> : <div className="price-night-groups">{(["rising", "falling"] as const).map((side) => {
          const nonempty = titles.filter(([key]) => (key.toLowerCase().includes("risers") ? "rising" : "falling") === side && groups[key].length > 0);
          return <div className="price-night-column" key={side}>{nonempty.length ? nonempty.map(([key, fin, en]) => <section className={`price-night-group ${key.toLowerCase().includes("risers") ? "rising" : "falling"}`} key={key}>
          <h3>{fi ? fin : en}<span>{groups[key].length}</span></h3>
          {groups[key].map((row) => <div className="price-night-player" key={row.id}><img alt="" src={`${import.meta.env.BASE_URL}kits/${row.position === "GK" ? "optimized-gk" : "optimized"}/${row.club.toLowerCase()}.webp?v=20260823-gk3`} />
            <div><b>{row.name}</b><small>{row.club} · {row.position}{(owners.get(row.id)?.length ?? 0) > 0 ? ` · ${owners.get(row.id)!.map((o) => o.teamName).join(", ")}` : ""}</small></div>
            <span><b>£{row.cost.toFixed(1)}m <i>{key.toLowerCase().includes("risers") ? "+" : "−"}0.1</i></b><small>{projectedAt(row, next, now).toFixed(1)} %</small></span>
          </div>)}
        </section>) : <p className="price-night-empty">{side === "rising" ? fi ? "Nousijoita ei ennusteta seuraavaan hinnanmuutokseen." : "No price rises forecast for the next change." : fi ? "Laskijoita ei ennusteta seuraavaan hinnanmuutokseen." : "No price falls forecast for the next change."}</p>}</div>;
        })}</div>}
      </div>
    </div>
  </div>, document.querySelector(".app-shell") ?? document.body);
}
