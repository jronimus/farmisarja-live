import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, X } from "lucide-react";
import { compareSquads, comparisonManagers } from "./services/squadComparison";
import type { DashboardData, Language, ManagerRow, SquadPlayer } from "./types";
import "./comparison.css";

const multiplier = (p: SquadPlayer, m: ManagerRow) => p.captain ? m.chip === "TC" ? 3 : 2 : 1;

export default function SquadComparisonModal({ data, language, autosubs: initialAutosubs, onClose }: { data: DashboardData; language: Language; autosubs: boolean; onClose: () => void }) {
  const fi = language === "fi";
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [ids, setIds] = useState<number[]>(() => data.managers.filter((m) => m.squad.length).slice(0, 2).map((m) => m.id));
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [starters, setStarters] = useState(true);
  const [ownershipOrder, setOwnershipOrder] = useState(false);
  const [autosubs, setAutosubs] = useState(initialAutosubs);
  const teams = comparisonManagers(ids.map((id) => data.managers.find((m) => m.id === id)).filter((m): m is ManagerRow => Boolean(m)), autosubs);
  const rows = compareSquads(teams, starters);
  const shared = new Map(rows.map((row) => [row.player.id, row.picks.size]));
  const owners = new Map(rows.map((row) => [row.player.id, teams.filter((team) => row.picks.has(team.id)).map((team) => team.teamName).join(" · ")]));
  const ownershipCounts = [...new Set(rows.map((row) => row.picks.size))].sort((a, b) => a - b);
  const common = new Set(rows.filter((row) => row.picks.size === teams.length).map((row) => row.player.id));
  // Captain multipliers and starter/bench differences still matter for a shared player.
  const identical = new Set(rows.filter((row) => row.picks.size === teams.length && teams.every((team) => {
    const first = row.picks.get(teams[0].id)!;
    const own = row.picks.get(team.id)!;
    return own.starter === first.starter && multiplier(own, team) === multiplier(first, teams[0]);
  })).map((row) => row.player.id));
  const positions = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close.current(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input:not(:disabled),[tabindex="0"]') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, []);
  const available = data.managers.filter((m) => m.squad.length && !ids.includes(m.id));
  return createPortal(<div className="comparison-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="comparison-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="comparison-title" tabIndex={-1}>
      <header className="comparison-modal-header"><h2 id="comparison-title">{fi ? "Joukkuevertailu" : "Team comparison"}<span>GW {data.gameweek}</span></h2>
        <div className="comparison-head-actions"><b>{common.size} {fi ? "yhteistä" : "shared"}</b><button type="button" onClick={onClose} aria-label={fi ? "Sulje vertailu" : "Close comparison"}><X size={19} /></button></div></header>
      <div className="comparison-toolbar"><div className="comparison-options">
        <label><input type="checkbox" checked={onlyDifferences} onChange={(e) => setOnlyDifferences(e.target.checked)} />{fi ? "Vain erot" : "Differences only"}</label>
        <label><input type="checkbox" checked={starters} onChange={(e) => setStarters(e.target.checked)} />{fi ? "Vain avaus" : "Starters only"}</label>
        <label><input type="checkbox" checked={autosubs} onChange={(e) => setAutosubs(e.target.checked)} />{fi ? "Aut. vaihdot" : "Autosubs"}</label>
        <label><input type="checkbox" checked={ownershipOrder} onChange={(e) => setOwnershipOrder(e.target.checked)} />{fi ? "Vähiten omistetut ensin" : "Least owned first"}</label></div>
        <button className="comparison-add" type="button" disabled={!available.length} onClick={() => available[0] && setIds([...ids, available[0].id])}><Plus size={14} />{fi ? "Lisää joukkue" : "Add team"}</button></div>
      {data.dataPending ? <p className="comparison-empty">{fi ? "Kokoonpanoja odotetaan." : "Waiting for squads."}</p> :
        <div className="comparison-columns" style={{ gridTemplateColumns: `repeat(${Math.max(teams.length, 1)}, minmax(var(--comparison-column-min, 215px), 1fr))` }} tabIndex={0} aria-label={fi ? "Joukkueet rinnakkain" : "Teams side by side"}>
          {teams.map((manager, index) => {
            const squad = manager.squad.filter((p) => (!starters || p.starter) && (!onlyDifferences || !identical.has(p.id))).sort((a, b) =>
              (ownershipOrder ? (shared.get(a.id) ?? 0) - (shared.get(b.id) ?? 0) : Number(identical.has(a.id)) - Number(identical.has(b.id)))
              || positions[a.position] - positions[b.position] || a.name.localeCompare(b.name, "fi"));
            const different = squad.filter((p) => !identical.has(p.id)).length;
            return <section className="comparison-column" key={index} aria-label={manager.teamName}>
              <div className="comparison-team-picker"><div className="comparison-team-choice"><span className="comparison-team-name" aria-hidden="true"><b>{manager.teamName}</b><small>{manager.managerName}</small><ChevronDown size={12} /></span><select aria-label={`${fi ? "Joukkue" : "Team"} ${index + 1}`} value={manager.id} onChange={(e) => setIds(ids.map((id, i) => i === index ? Number(e.target.value) : id))}>
                {data.managers.filter((m) => m.squad.length && (m.id === manager.id || !ids.includes(m.id))).map((m) => <option key={m.id} value={m.id}>{m.teamName} · {m.managerName}</option>)}
              </select></div>{teams.length > 2 && <button type="button" aria-label={`${fi ? "Poista" : "Remove"} ${manager.teamName}`} onClick={() => setIds(ids.filter((id) => id !== manager.id))}><X size={14} /></button>}</div>
              <div className="comparison-team-stats"><div><b>{manager.gameweekPoints + manager.provisionalBonus - manager.hit}</b><small>GW</small></div><div><b>{manager.totalPoints + manager.provisionalBonus - manager.hit}</b><small>{fi ? "YHT." : "TOTAL"}</small></div><div><b>{manager.chip || "—"}</b><small>CHIP</small></div><div><b>{different}</b><small>{fi ? "EROA" : "DIFF."}</small></div></div>
              <div className="comparison-column-labels"><span>{fi ? "Pelaaja" : "Player"}</span><span title={fi ? "Omistajia valituissa joukkueissa" : "Owners among selected teams"}>{fi ? "Om." : "Own."}</span><span>{fi ? "Pist." : "Pts"}</span></div>
              <div>{squad.map((player, rowIndex) => <div data-owners={shared.get(player.id)} className={`comparison-player ${identical.has(player.id) ? "same" : "different"} ${!player.starter ? "bench" : ""} ${!ownershipOrder && rowIndex === different && different > 0 ? "shared-start" : ""}`} key={player.id}>
                <div className="comparison-player-info"><img alt="" src={`${import.meta.env.BASE_URL}kits/${player.position === "GK" ? "optimized-gk" : "optimized"}/${player.club.toLowerCase()}.webp?v=20260823-gk3`} />
                  <span><b>{player.name}</b><small>{player.position} · {player.club}{!player.starter ? fi ? " · P" : " · B" : ""}</small></span>
                  {player.captain ? <i className="comparison-armband">{manager.chip === "TC" ? "TC" : "C"}</i> : player.viceCaptain ? <i className="comparison-armband vice">V</i> : null}</div>
                <span className="comparison-owned" title={owners.get(player.id)} aria-label={`${shared.get(player.id)}/${teams.length}: ${owners.get(player.id)}`}>{shared.get(player.id)}/{teams.length}</span>
                <strong className="comparison-score">{(player.points + player.bonus) * multiplier(player, manager)}</strong>
              </div>)}</div>
              {!squad.length && <p className="comparison-empty">{fi ? "Ei eroja" : "No differences"}</p>}
            </section>;
          })}
        </div>}
      <footer className="comparison-modal-footer"><div className="comparison-ownership-legend" aria-label={fi ? "Omistajamäärien värit" : "Ownership colours"}>{ownershipCounts.map((count) => <span key={count} data-owners={count}><i />{count}/{teams.length}{count === teams.length ? fi ? " kaikilla" : " all" : ""}</span>)}<small>{fi ? "Samat valinnat himmennetty" : "Identical picks faded"}</small></div><span>{fi ? "P = penkki · Kapteenikerroin mukana · " : "B = bench · Captain multiplier included · "}{autosubs ? fi ? "Aut. vaihdot päällä" : "Autosubs on" : fi ? "Julkaistut valinnat" : "Published picks"}</span></footer>
    </div>
  </div>, document.body);
}
