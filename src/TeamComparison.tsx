import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, Users, X } from "lucide-react";
import { compareHistoricalPlayers, compareTeamPeriod } from "./services/teamComparison";
import { loadFormHistory, type HistoricalRound } from "./services/formHistory";
import type { DashboardData, Language } from "./types";
import FutureTeamComparison from "./FutureTeamComparison";
import { demoComparisonRounds } from "./planningDemo";
import SquadComparison from "./SquadComparison";
import "./playerModal.css";
import "./teamComparison.css";

export default function TeamComparison({ data, language, onClose, onPlayer, autosubs, suspended = false, initialTab = "squads", demo = false }: {
  data: DashboardData; language: Language; onClose: () => void; onPlayer: (id: number) => void; autosubs: boolean; suspended?: boolean; initialTab?: "squads" | "results"; demo?: boolean;
}) {
  const fi = language === "fi";
  const last = Math.max(0, data.gameweek - (data.pointsFinalized ? 0 : 1));
  const [tab, setTab] = useState<"squads" | "results" | "future">(initialTab);
  const [squadIds, setSquadIds] = useState(() => data.managers.slice(0, 2).map((manager) => manager.id));
  const [period, setPeriod] = useState(() => ({ left: data.managers[0]?.id ?? 0, right: data.managers[1]?.id ?? 0, start: Math.max(1, last - 4), end: last }));
  const [history, setHistory] = useState<HistoricalRound[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (suspended) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close.current(); return; }
      if (event.key !== "Tab") return;
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),select,input") ?? [])].filter((item) => item.getClientRects().length > 0);
      if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialog.current)) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && (document.activeElement === items.at(-1) || document.activeElement === dialog.current)) { event.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus({ preventScroll: true }); };
  }, [suspended]);
  const left = data.managers.find((manager) => manager.id === period.left);
  const right = data.managers.find((manager) => manager.id === period.right);
  const result = left && right ? compareTeamPeriod(left, right, period.start, period.end) : null;
  const weekKey = result?.rounds.map((row) => row.gameweek).join(",") ?? "";
  const deadline = new Date(data.deadline);
  const season = String(deadline.getUTCFullYear() - (deadline.getUTCMonth() < 6 ? 1 : 0));
  useEffect(() => {
    let active = true;
    setHistory(null); setError(false);
    if (tab !== "results" || !weekKey || !period.left || !period.right) return;
    if (demo) { setHistory(demoComparisonRounds(data).filter((round) => weekKey.split(",").map(Number).includes(round.gameweek))); return; }
    const timer = window.setTimeout(() => { loadFormHistory(weekKey.split(",").map(Number), [period.left, period.right], season).then((rounds) => { if (active) setHistory(rounds); }).catch(() => { if (active) setError(true); }); }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [tab, weekKey, period.left, period.right, season, retry, demo]);
  const playerName = (id: number) => data.players?.find((player) => player.id === id)?.name ?? data.managers.flatMap((manager) => manager.squad).find((player) => player.id === id)?.name ?? `${fi ? "Pelaaja" : "Player"} #${id}`;
  let swings: ReturnType<typeof compareHistoricalPlayers> = [];
  let incomplete = false;
  try { if (history) swings = compareHistoricalPlayers(history, period.left, period.right); } catch { incomplete = true; }
  const teamControls = (<div className="team-history-controls">
        <label>{fi ? "Joukkue 1" : "Team 1"}<select value={period.left} onChange={(event) => { const left = Number(event.target.value); setPeriod({ ...period, left }); setSquadIds([left, period.right]); }}>{data.managers.map((manager) => <option key={manager.id} value={manager.id} disabled={manager.id === period.right}>{manager.teamName}</option>)}</select></label>
        <button type="button" className="team-history-swap" aria-label={fi ? "Vaihda joukkueet päittäin" : "Swap teams"} onClick={() => { setPeriod({ ...period, left: period.right, right: period.left }); setSquadIds([period.right, period.left]); }}><ArrowRightLeft size={17} /></button>
        <label>{fi ? "Joukkue 2" : "Team 2"}<select value={period.right} onChange={(event) => { const right = Number(event.target.value); setPeriod({ ...period, right }); setSquadIds([period.left, right]); }}>{data.managers.map((manager) => <option key={manager.id} value={manager.id} disabled={manager.id === period.left}>{manager.teamName}</option>)}</select></label>
        <div className="team-period-presets">{[3, 5, 10, 0].map((count) => <button type="button" key={count} aria-pressed={period.end === last && period.start === (count ? Math.max(1, last - count + 1) : 1)} onClick={() => setPeriod({ ...period, start: count ? Math.max(1, last - count + 1) : 1, end: last })}>{count ? `${count} GW` : fi ? "Koko kausi" : "Full season"}</button>)}</div>
        <div className="team-period-range"><label>{fi ? "Alkaen" : "From"} · GW {period.start}<input type="range" aria-label={fi ? "Ensimmäinen kierros" : "First gameweek"} min="1" max={Math.max(1, last)} value={period.start} onChange={(event) => { const start = Number(event.target.value); setPeriod({ ...period, start, end: Math.max(start, period.end) }); }} /></label><label>{fi ? "Asti" : "To"} · GW {period.end}<input type="range" aria-label={fi ? "Viimeinen kierros" : "Last gameweek"} min="1" max={Math.max(1, last)} value={period.end} onChange={(event) => { const end = Number(event.target.value); setPeriod({ ...period, end, start: Math.min(end, period.start) }); }} /></label></div>
      </div>);
  const metrics = result ? [
    [fi ? "Nettopisteet" : "Net points", result.left.points, result.right.points, true],
    [fi ? "Keskiarvo / kierros" : "Average / gameweek", result.left.average?.toFixed(1) ?? "—", result.right.average?.toFixed(1) ?? "—", true],
    [fi ? "Siirtomiinukset" : "Transfer deductions", result.left.hits, result.right.hits, false],
    [fi ? "Voitetut kierrokset" : "Gameweeks won", result.left.wins, result.right.wins, true],
  ] as const : [];
  return createPortal(<div className="player-modal-overlay team-history-overlay" hidden={suspended} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="player-modal team-history-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="team-history-title" tabIndex={-1}>
      <header className="player-modal-head"><Users size={28} /><div><small>Farmisarja · GW {data.gameweek}</small><h2 id="team-history-title">{fi ? "Joukkuevertailu" : "Team comparison"}</h2></div><button onClick={onClose} aria-label={fi ? "Sulje joukkuevertailu" : "Close team comparison"}><X /></button></header>
      <div className="player-modal-tabs" role="tablist" aria-label={fi ? "Vertailun tyyppi" : "Comparison type"}>
        <button role="tab" aria-selected={tab === "squads"} aria-pressed={tab === "squads"} aria-controls="team-squads-panel" onClick={() => setTab("squads")}>{fi ? "Kokoonpanot" : "Squads"}</button>
        <button role="tab" aria-selected={tab === "results"} aria-pressed={tab === "results"} aria-controls="team-results-panel" onClick={() => setTab("results")}>{fi ? "Tulokset" : "Results"}</button>
        <button role="tab" aria-selected={tab === "future"} aria-pressed={tab === "future"} aria-controls="team-future-panel" onClick={() => setTab("future")}>{fi ? "Tulevat ottelut" : "Upcoming fixtures"}</button>
      </div>
      <div className="team-comparison-tabpanel" role="tabpanel" id="team-squads-panel" hidden={tab !== "squads"}>
        <SquadComparison data={data} language={language} autosubs={autosubs} embedded selectedIds={squadIds} onSelectedIds={(ids) => { setSquadIds(ids); if (ids.length >= 2) setPeriod((current) => ({ ...current, left: ids[0], right: ids[1] })); }} onClose={onClose} />
      </div>
      <div className="team-comparison-tabpanel" role="tabpanel" id="team-results-panel" hidden={tab !== "results"}>
      {teamControls}
      <div className="player-modal-body team-history-body">{result && left && right && result.rounds.length ? <>
        <div className="team-history-heading"><h3>{left.teamName}</h3><span>GW {period.start}–{period.end}</span><h3>{right.teamName}</h3></div>
        <div className="team-history-metrics">{metrics.map(([label, a, b, higher]) => <div key={label}><strong className={a !== "—" && b !== "—" && (higher ? Number(a) > Number(b) : Number(a) < Number(b)) ? "winner" : ""}>{a}</strong><span>{label}</span><strong className={a !== "—" && b !== "—" && (higher ? Number(b) > Number(a) : Number(b) < Number(a)) ? "winner" : ""}>{b}</strong></div>)}</div>
        <div className="team-history-columns"><section><h3>{fi ? "Eron kehitys" : "How the gap developed"}</h3><div className="team-history-chart" role="img" aria-label={fi ? "Kumulatiivinen piste-ero, positiivinen joukkueelle 1" : "Cumulative net points gap, positive for team 1"}>{(() => {
          let sum = 0; const gaps = [0, ...result.rounds.map((row) => (sum += row.gap))]; const scale = Math.max(1, ...gaps.map(Math.abs));
          return <svg viewBox="0 0 440 150"><line x1="20" x2="420" y1="75" y2="75" stroke="#a9b6c6" strokeDasharray="4 4" /><polyline fill="none" stroke="#3768af" strokeWidth="3" strokeLinejoin="round" points={gaps.map((gap, i) => `${20 + i / Math.max(1, gaps.length - 1) * 400},${75 - gap / scale * 53}`).join(" ")} /><text x="22" y="14">+{scale}</text><text x="22" y="143">−{scale}</text><text x="420" y="143" textAnchor="end">{fi ? "Ero lopussa" : "Final gap"}: {sum > 0 ? "+" : ""}{sum}</text></svg>;
        })()}</div><table className="player-data-table"><thead><tr><th>GW</th><th>{fi ? "Joukkue 1" : "Team 1"}</th><th>{fi ? "Joukkue 2" : "Team 2"}</th><th>{fi ? "Ero" : "Gap"}</th></tr></thead><tbody>{result.rounds.map((row) => <tr key={row.gameweek}><th scope="row">{row.gameweek}</th><td>{row.left}</td><td>{row.right}</td><td>{row.gap > 0 ? "+" : ""}{row.gap}</td></tr>)}</tbody></table></section>
        <section><h3>{fi ? "Suurimmat pelaajien tuomat erot" : "Biggest player contributions to the gap"}</h3>{error || incomplete ? <p role="status">{fi ? "Historiatietojen lataus epäonnistui." : "Historical data unavailable."} <button className="player-history-retry" onClick={() => setRetry((n) => n + 1)}>{fi ? "Yritä uudelleen" : "Retry"}</button></p> : !history ? <p role="status">{fi ? "Ladataan kierrosten kokoonpanoja…" : "Loading historical squads…"}</p> : <table className="player-data-table"><thead><tr><th>{fi ? "Pelaaja" : "Player"}</th><th>1</th><th>2</th><th>{fi ? "Ero" : "Gap"}</th></tr></thead><tbody>{swings.slice(0, 12).map((row) => <tr key={row.id}><th scope="row"><button className="player-name-link" onClick={() => onPlayer(row.id)}>{playerName(row.id)}</button></th><td>{row.left}</td><td>{row.right}</td><td className={row.gap > 0 ? "team-one-gain" : row.gap < 0 ? "team-two-gain" : ""}>{row.gap > 0 ? "+" : ""}{row.gap}</td></tr>)}</tbody></table>}</section></div>
        {result.missing > 0 && <p className="player-modal-note">{result.missing} {fi ? "kierrokselta puuttuu yhteinen tulos; ne on jätetty pois." : "gameweeks have missing results and are excluded."}</p>}
      </> : <p>{fi ? "Valitulta ajalta ei ole yhteisiä päättyneitä kierroksia." : "No common completed gameweeks in this period."}</p>}</div>
      </div>
      <div className="team-comparison-tabpanel future-comparison-tab" role="tabpanel" id="team-future-panel" hidden={tab !== "future"}>
        {teamControls}
        {left && right && <FutureTeamComparison data={data} managers={[left, right]} language={language} onPlayer={onPlayer} />}
      </div>
    </div>
  </div>, document.querySelector(".app-shell") ?? document.body);
}
