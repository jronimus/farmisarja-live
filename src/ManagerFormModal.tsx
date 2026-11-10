import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { TrendingUp, X } from "lucide-react";
import type { DashboardData, Language, ManagerRow } from "./types";
import { managerFormComparison } from "./services/managerForm";
import FormHistorySection from "./FormHistorySection";
import "./playerModal.css";
import "./managerForm.css";

export default function ManagerFormModal({ manager, data, language, onClose, onPlayer, suspended = false }: {
  manager: ManagerRow; data: DashboardData; language: Language; autosubs: boolean; onClose: () => void; onPlayer: (id: number) => void; suspended?: boolean;
}) {
  const fi = language === "fi";
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (suspended) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close.current(); return; }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === dialog.current)) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && (document.activeElement === controls.at(-1) || document.activeElement === dialog.current)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus({ preventScroll: true }); };
  }, [suspended]);
  const { weeks, rows, own, average } = managerFormComparison(manager, data.managers);
  const rank = own ? 1 + rows.filter((row) => row.total > own.total).length : null;
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
  return createPortal(<div className="player-modal-overlay manager-form-overlay" hidden={suspended} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="player-modal manager-form-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="manager-form-title" tabIndex={-1}>
      <header className="player-modal-head"><TrendingUp size={30} /><div><small>{fi ? "Vire · päättyneet kierrokset" : "Form · completed gameweeks"}</small><h2 id="manager-form-title">{manager.teamName}</h2></div><button onClick={onClose} aria-label={fi ? "Sulje vire" : "Close form"}><X /></button></header>
      <div className="player-modal-body">
        <div className="manager-form-summary"><div><small>{fi ? "Pisteet / kierros" : "Points / gameweek"}</small><strong>{own?.average.toFixed(1) ?? "—"}</strong><span>{fi ? "Farmisarja" : "League"} {average?.toFixed(1) ?? "—"}</span></div><div><small>{fi ? "Sija Farmisarjan vireessä" : "Form rank in Farmisarja"}</small><strong>{rank ?? "—"}<small>/{rows.length}</small></strong><span>{weeks.map((week) => `GW${week}`).join(" · ")}</span></div><div><small>{fi ? "Ero sarjan keskiarvoon / kierros" : "Difference vs league / gameweek"}</small><strong className={own && average !== null && own.average < average ? "negative" : "positive"}>{own && average !== null ? signed(own.average - average) : "—"}</strong><span>{own?.total ?? "—"} {fi ? "pistettä yhteensä" : "points in total"}</span></div></div>
        <div className="manager-form-columns"><section><h3>{fi ? "Kierros kierrokselta" : "Gameweek by gameweek"}</h3><table className="player-data-table"><thead><tr>{["GW", fi ? "Joukkue" : "Team", "Farmisarja", "FPL"].map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{weeks.map((week, index) => <tr key={week}><th scope="row">{week}</th><td>{own?.points[index] ?? "—"}</td><td>{rows.length ? (rows.reduce((sum, row) => sum + row.points[index], 0) / rows.length).toFixed(1) : "—"}</td><td>{data.gameweekAverages?.[week] ?? "—"}</td></tr>)}</tbody></table></section>
        <section><h3>{fi ? "Farmisarjan virevertailu" : "Farmisarja form comparison"}</h3><div className="manager-form-ranking">{rows.map((row) => <div key={row.manager.id} className={row.manager.id === manager.id ? "selected" : ""}><span>{1 + rows.filter((other) => other.total > row.total).length}</span><b>{row.manager.teamName}</b><span className="manager-form-bar"><i style={{ width: `${Math.max(0, row.total / Math.max(1, rows[0].total)) * 100}%` }} /></span><strong>{row.average.toFixed(1)}</strong></div>)}</div></section></div>
        <p className="player-modal-note">{fi ? "Samat päättyneet kierrokset kaikille, pisteet ennen siirtomiinuksia. Mukana vain joukkueet, joilta kaikki valitut kierrokset löytyvät." : "The same completed gameweeks for everyone, before transfer deductions. Only teams with every selected gameweek are included."}</p>
        <FormHistorySection data={data} managerId={manager.id} weeks={weeks} managerIds={rows.map((row) => row.manager.id)} language={language} onPlayer={onPlayer} />
      </div>
    </div>
  </div>, document.querySelector(".app-shell") ?? document.body);
}
