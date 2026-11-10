import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Armchair, Radio, X } from "lucide-react";
import type { DashboardData, Language } from "./types";
import { livePlayerSelections, type HighlightSelection } from "./services/highlights";
import { provisionalAutosubSquad } from "./services/fplRules";
import { liveTeamGroups } from "./services/livePlayers";
import { pickMultiplier } from "./services/ownership";
import { PlayerFace } from "./MatchCentre";
import { highlightStyle } from "./HighlightSelections";
import "./playerModal.css";
import "./livePlayers.css";

export default function LivePlayersModal({ data, selected, language, autosubs, suspended, onClose, onPlayer }: {
  data: DashboardData; selected: HighlightSelection[]; language: Language; autosubs: boolean; suspended: boolean; onClose: () => void; onPlayer: (id: number) => void;
}) {
  const fi = language === "fi";
  const [showAll, setShowAll] = useState(false);
  const [grouping, setGrouping] = useState<"matches" | "teams">("matches");
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (suspended) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopImmediatePropagation(); close.current(); return; }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === dialog.current)) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && (document.activeElement === controls.at(-1) || document.activeElement === dialog.current)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus({ preventScroll: true }); };
  }, [suspended]);
  const players = new Map([...(data.players ?? []), ...data.managers.flatMap((manager) => manager.squad)].map((player) => [player.id, player]));
  const choices = showAll && grouping === "matches" ? livePlayerSelections(data.managers, data.players) : selected;
  const rows = choices.flatMap((selection) => {
    const player = selection.highlight.kind === "player" ? players.get(selection.highlight.id) : undefined;
    return player ? [{ selection, player }] : [];
  }).sort((a, b) => (b.player.points + b.player.bonus) - (a.player.points + a.player.bonus) || a.player.name.localeCompare(b.player.name));
  const groups = (data.fixtures ?? []).filter((fixture) => fixture.status === "live").map((fixture) => ({
    key: String(fixture.id),
    title: `${fixture.home} ${fixture.homeScore ?? 0}–${fixture.awayScore ?? 0} ${fixture.away}`,
    minutes: fixture.minutes,
    rows: rows.filter(({ player }) => player.club === fixture.home || player.club === fixture.away),
  })).filter((group) => group.rows.length > 0);
  const assigned = new Set(groups.flatMap((group) => group.rows.map(({ player }) => player.id)));
  const remaining = rows.filter(({ player }) => !assigned.has(player.id));
  if (remaining.length) groups.push({ key: "other", title: fi ? "Muut livepelaajat" : "Other live players", minutes: 0, rows: remaining });
  return createPortal(<div className="player-modal-overlay live-players-overlay" hidden={suspended} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="player-modal live-players-modal" role="dialog" aria-modal="true" aria-labelledby="live-players-title" ref={dialog} tabIndex={-1}>
      <header className="player-modal-head"><Radio size={28} /><div><small>{fi ? "Ottelut käynnissä" : "Matches in progress"}</small><h2 id="live-players-title">{fi ? "Livepelaajat" : "Live players"} <span>{rows.length}</span></h2></div><button type="button" onClick={onClose} aria-label={fi ? "Sulje livepelaajat" : "Close live players"}><X /></button></header>
      <div className="live-players-filter"><span>{fi ? "Pisteet sisältävät livebonukset" : "Points include live bonus"}</span><div className="live-group-toggle" role="group" aria-label={fi ? "Ryhmittely" : "Group by"}>
        <button type="button" aria-pressed={grouping === "matches"} onClick={() => setGrouping("matches")}>{fi ? "Otteluittain" : "By match"}</button>
        <button type="button" aria-pressed={grouping === "teams"} onClick={() => setGrouping("teams")}>{fi ? "Joukkueittain" : "By FPL team"}</button>
      </div><button type="button" className="live-all-players" style={grouping === "teams" ? { visibility: "hidden" } : undefined} disabled={grouping === "teams"} aria-pressed={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? fi ? "Vain Farmisarjan pelaajat" : "Only Farmisarja players" : fi ? "Kaikki pelaajat" : "All players"}</button></div>
      <div className={`player-modal-body live-players-grid ${grouping === "teams" ? "live-team-grid" : ""}`}>
        {!rows.length && <p>{fi ? "Ei livepelaajia juuri nyt." : "No live players right now."}</p>}
        {grouping === "teams" ? liveTeamGroups(data, selected, autosubs).map(({ manager, rows: teamRows, total }) => <section className="live-match-group live-team-group" key={manager.id}>
          <h3><span>{manager.teamName}<small>{teamRows.length} {fi ? "livepelaajaa" : "live players"}</small></span><strong>{total}<small>p</small></strong></h3>
          {teamRows.map(({ player, selection, multiplier }) => <article className="live-player-card" style={highlightStyle(selection.color)} key={player.id}>
            <header><button type="button" className="live-player-name" onClick={() => onPlayer(player.id)}><PlayerFace name={player.name} club={player.club} photoCode={player.photoCode} position={player.position} /><span><b>{player.name}</b><small>{player.club} · {player.minutes} min</small></span></button>
              {multiplier !== 1 && <span className={`live-team-role ${multiplier === 0 ? "bench" : "captain"}`} title={multiplier === 0 ? fi ? "Penkki" : "Bench" : multiplier === 3 ? fi ? "Triplakapteeni" : "Triple captain" : fi ? "Kapteeni" : "Captain"}>{multiplier === 0 ? <Armchair size={12} /> : multiplier === 3 ? "TC" : "C"}</span>}
              <strong className="live-player-score">{(player.points + player.bonus) * multiplier}<small>{multiplier === 0 ? `(${player.points + player.bonus}p)` : "p"}</small></strong>
            </header>
          </article>)}
        </section>) : groups.map((group) => <section className="live-match-group" key={group.key}>
          <h3><span>{group.title}</span><small>{group.minutes > 0 ? `${group.minutes}′ · ` : ""}{group.rows.length} {fi ? "pelaajaa" : "players"}</small></h3>
          {group.rows.map(({ player, selection }) => {
          const owners = data.managers.flatMap((manager) => {
            const owned = provisionalAutosubSquad(manager.squad, autosubs).find((pick) => pick.id === player.id);
            return owned ? [{ manager, multiplier: pickMultiplier(owned, manager.chip) }] : [];
          });
          return <article key={player.id} style={highlightStyle(selection.color)} className="live-player-card">
            <header><button type="button" className="live-player-name" onClick={() => onPlayer(player.id)}><PlayerFace name={player.name} club={player.club} photoCode={player.photoCode} position={player.position} /><span><b>{player.name}</b><small>{player.club} · {player.position} · {player.minutes} min</small></span></button><strong className="live-player-score">{player.points + player.bonus}<small>p</small></strong></header>
            <div className="live-player-owners">{owners.length ? owners.map(({ manager, multiplier }) => <span key={manager.id} className={`live-owner ${multiplier === 0 ? "bench" : multiplier === 3 ? "triple" : multiplier === 2 ? "captain" : ""}`} title={`${manager.managerName} · ${multiplier === 0 ? fi ? "Penkki" : "Bench" : multiplier === 3 ? fi ? "Triplakapteeni" : "Triple captain" : multiplier === 2 ? fi ? "Kapteeni" : "Captain" : fi ? "Avaus" : "Starting"}`}>
              {multiplier === 0 && <Armchair size={12} />}{multiplier > 1 && <b>{multiplier === 3 ? "TC" : "C"}</b>}{manager.teamName}<strong>{(player.points + player.bonus) * multiplier}</strong>
            </span>) : <span className="live-no-owners">{fi ? "Ei omistajia Farmisarjassa" : "No owners in Farmisarja"}</span>}</div>
          </article>;
        })}</section>)}
      </div>
    </div>
  </div>, document.querySelector(".app-shell") ?? document.body);
}
