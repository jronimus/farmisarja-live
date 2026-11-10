import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Scale, X } from "lucide-react";
import { buildOwnership, pickMultiplier } from "./services/ownership";
import { provisionalAutosubSquad } from "./services/fplRules";
import type { DashboardData, Language, PlayerLiveStats, PlayerStat } from "./types";
import { loadPlayerHistory, type PlayerHistory } from "./services/playerHistory";
import { fixtureHeading, playerFixtureBreakdown } from "./services/playerDetails";
import "./playerModal.css";

const labels: Record<string, [string, string]> = {
  minutes: ["Peliminuutit", "Minutes"], goals_scored: ["Maalit", "Goals"], assists: ["Syötöt", "Assists"],
  clean_sheets: ["Nollapelit", "Clean sheets"], goals_conceded: ["Päästetyt maalit", "Goals conceded"],
  own_goals: ["Omat maalit", "Own goals"], penalties_saved: ["Torjutut rangaistuspotkut", "Penalties saved"],
  penalties_missed: ["Epäonnistuneet rangaistuspotkut", "Penalties missed"], yellow_cards: ["Keltaiset kortit", "Yellow cards"],
  red_cards: ["Punaiset kortit", "Red cards"], saves: ["Torjunnat", "Saves"], bonus: ["Bonus", "Bonus"],
  defensive_contribution: ["Puolustuspanos", "Defensive contribution"],
};
const seasonFields: Array<[keyof PlayerStat, string, string]> = [
  ["totalPoints", "Pisteet", "Points"], ["pointsPerGame", "Pisteet / ottelu", "Points / game"], ["form", "Vire", "Form"],
  ["minutes", "Minuutit", "Minutes"], ["starts", "Avaukset", "Starts"], ["goals", "Maalit", "Goals"], ["assists", "Syötöt", "Assists"],
  ["cleanSheets", "Nollapelit", "Clean sheets"], ["bonus", "Bonuspisteet", "Bonus points"], ["bps", "BPS", "BPS"],
  ["defensiveContribution", "Puolustuspanos", "Defensive contribution"], ["saves", "Torjunnat", "Saves"],
  ["expectedGoals", "Odotetut maalit · xG", "Expected goals · xG"], ["expectedAssists", "Odotetut syötöt · xA", "Expected assists · xA"],
  ["yellowCards", "Keltaiset", "Yellow cards"], ["redCards", "Punaiset", "Red cards"],
];
const signed = (n: number) => n > 0 ? `+${n}` : String(n);
const liveFields: Array<[keyof PlayerLiveStats, string, string]> = [
  ["bps", "BPS", "BPS"],
  ["clearances_blocks_interceptions", "Purut, blokit ja katkot", "Clearances, blocks & interceptions"],
  ["recoveries", "Pallonriistot", "Recoveries"],
  ["tackles", "Taklaukset", "Tackles"],
  ["defensive_contribution", "Puolustuspanos yhteensä", "Total defensive contribution"],
  ["saves", "Torjunnat", "Saves"],
  ["goals_conceded", "Päästetyt maalit", "Goals conceded"],
  ["expected_goals", "Odotetut maalit · xG", "Expected goals · xG"],
  ["expected_assists", "Odotetut syötöt · xA", "Expected assists · xA"],
  ["expected_goal_involvements", "Odotetut maali­osuudet · xGI", "Expected goal involvements · xGI"],
  ["expected_goals_conceded", "Odotetut päästetyt · xGC", "Expected goals conceded · xGC"],
];

export default function PlayerModal({ selection, data, language, autosubs, onCompare, onClose }: {
  selection: { id: number; managerId?: number }; data: DashboardData; language: Language; autosubs: boolean; onCompare: (id: number) => void; onClose: () => void;
}) {
  const fi = language === "fi";
  const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
  const [tab, setTab] = useState(selection.managerId === undefined ? "season" : "round");
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [matchView, setMatchView] = useState<"history" | "upcoming">("history");
  const [historyError, setHistoryError] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]') ?? [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, []);
  const historyThrough = Math.max(0, data.gameweek - (data.pointsFinalized ? 0 : 1));
  const deadline = new Date(data.deadline);
  const seasonKey = String(deadline.getUTCFullYear() - (deadline.getUTCMonth() < 6 ? 1 : 0));
  useEffect(() => {
    if (tab !== "matches") return;
    const controller = new AbortController();
    setHistoryError(false);
    loadPlayerHistory(selection.id, historyThrough, seasonKey, controller.signal).then((result) => {
      if (!controller.signal.aborted) setHistory(result);
    }).catch(() => { if (!controller.signal.aborted) setHistoryError(true); });
    return () => controller.abort();
  }, [tab, selection.id, retry, historyThrough, seasonKey]);
  const owners = data.managers.flatMap((manager) => {
    const player = provisionalAutosubSquad(manager.squad, autosubs).find((p) => p.id === selection.id);
    return player ? [{ manager, player, multiplier: pickMultiplier(player, manager.chip) }] : [];
  });
  const selected = selection.managerId === undefined ? undefined : owners.find((o) => o.manager.id === selection.managerId);
  const generic = data.players?.find((p) => p.id === selection.id) ?? owners[0]?.player;
  const player = selected?.player ?? (generic ? { ...generic, captain: false, viceCaptain: false } : undefined);
  if (!player) return null;
  const upcoming = history?.fixtures ?? (data.planningFixtures ?? []).filter(fixture=>fixture.home===player.club || fixture.away===player.club).map((fixture,index)=>({id:index,gameweek:fixture.gameweek,kickoff:fixture.kickoff,opponent:fixture.home===player.club?fixture.away:fixture.home,venue:fixture.home===player.club?"H":"A",difficulty:fixture.home===player.club?fixture.homeDifficulty:fixture.awayDifficulty}));
  const manager = selected?.manager;
  const portrait = player.photoCode ? `https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.photoCode}.png` : null;
  const showPortrait = Boolean(portrait && portrait !== failedPortrait);
  const shirt = `${import.meta.env.BASE_URL}kits/${player.position === "GK" ? "optimized-gk" : "optimized"}/${player.club.toLowerCase()}.webp?v=20260823-gk3`;
  const score = player.points + player.bonus;
  const displayMultiplier = player.captain ? manager?.chip === "TC" ? 3 : 2 : 1;
  const ownership = buildOwnership(data.managers, autosubs).find((p) => p.id === player.id);
  const season = data.playerStats?.find((p) => p.id === player.id);
  const breakdown = playerFixtureBreakdown(player, data.fixtures);
  const explained = (breakdown ?? []).reduce((sum, f) => sum + f.stats.reduce((n, s) => n + s.points, 0), 0);
  return createPortal(<div className="player-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="player-modal player-details-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="player-modal-title" tabIndex={-1}>
      <header className={`player-modal-head ${showPortrait ? "has-portrait" : ""}`}><span className="player-modal-avatar"><img className={showPortrait ? "player-portrait" : ""} src={showPortrait ? portrait! : shirt} onError={showPortrait ? () => setFailedPortrait(portrait) : undefined} referrerPolicy="no-referrer" alt="" /></span>
        <div><small>{player.club} · {player.position} · £{player.cost.toFixed(1)}m</small><h2 id="player-modal-title">{player.name}</h2></div>
        <div className="player-modal-actions"><button className="player-compare-open" aria-label={fi ? "Vertaa pelaajia" : "Compare players"} onClick={() => onCompare(player.id)} aria-haspopup="dialog"><Scale size={16} /><span>{fi ? "Vertaa" : "Compare"}</span></button><button onClick={onClose} aria-label={fi ? "Sulje pelaajatiedot" : "Close player details"}><X size={21} /></button></div>
      </header>
      <div className="player-modal-tabs" role="group" aria-label={fi ? "Pelaajatiedot" : "Player details"}>
        <button aria-pressed={tab === "round"} onClick={() => setTab("round")}>GW {data.gameweek} · {fi ? "Pisteet ja omistajat" : "Points & owners"}</button>
        <button aria-pressed={tab === "season"} onClick={() => setTab("season")}>{fi ? "Kausi" : "Season"}</button>
        <button aria-pressed={tab === "matches"} onClick={() => setTab("matches")}>{fi ? "Ottelut" : "Matches"}</button>
      </div>
      <div className={`player-modal-body ${tab === "round" ? "player-round-layout" : tab === "matches" ? "player-matches-layout" : ""} ${player.liveStats ? "has-live-stats" : ""}`}>
        {tab === "round" ? <>
          <div className="player-modal-summary">
            <div className={`player-score-box ${displayMultiplier > 1 ? "is-captain" : ""} ${displayMultiplier === 3 ? "is-triple" : ""}`}>
              <div className="player-score-heading"><small>{fi ? "Pisteet" : "Points"}</small>{displayMultiplier > 1 && <b className="player-score-badge">{displayMultiplier === 3 ? fi ? "Triplakapteeni" : "Triple captain" : fi ? "Kapteeni" : "Captain"}</b>}</div>
              <strong>{score * displayMultiplier}</strong>{(player.minutes > 0 || player.state !== "upcoming") && <span>{player.minutes} min{player.state === "live" ? " · LIVE" : ""}</span>}
            </div>
            <div><small>{fi ? "Farmisarjan tosiasiallinen omistus" : "Farmisarja effective ownership"}</small><strong>{ownership?.effectivePercent.toFixed(1)}<small>%</small></strong><span>FPL {player.ownership.toFixed(1)} %</span></div>
          </div>
          <section className="player-round-breakdown"><h3>{fi ? "Pisteiden erittely" : "Points breakdown"}</h3>
            {breakdown?.map((block) => {
              const fixture = data.fixtures?.find((f) => f.id === block.fixture);
              const heading = fixture ? fixtureHeading(fixture, language) : null;
              return <div className={`player-point-match ${fixture?.status ?? "unknown"}`} key={block.fixture}>
                <h4><b>{heading?.title ?? `${fi ? "Ottelu" : "Fixture"} ${block.fixture}`}</b><span>{heading?.status ?? (fi ? "Ottelutiedot päivittyvät" : "Fixture details updating")}</span></h4>
                {heading?.upcoming ? <p className="player-modal-note player-match-waiting">{fi ? "Ottelu ei ole vielä alkanut." : "This match has not started yet."}</p> : <>
                <div className="player-point-labels"><span>{fi ? "Tapahtuma" : "Event"}</span><span>{fi ? "Määrä" : "Count"}</span><span>{fi ? "Pisteet" : "Points"}</span></div>
                {block.stats.map((stat) => <div className={`player-point-row ${stat.identifier === "bonus" ? "is-bonus" : ""}`} key={stat.identifier}><span>{labels[stat.identifier]?.[fi ? 0 : 1] ?? stat.identifier.replaceAll("_", " ")}</span><span>{stat.value}</span><b>{signed(stat.points)}</b></div>)}
                </>}
              </div>;
            })}
            {!breakdown?.length && <p className="player-modal-note">{player.minutes === 0 && score === 0 ? fi ? "Ei vielä pisteitä tai peliminuutteja tällä kierroksella." : "No points or minutes yet this round." : fi ? "Piste-erittely ei ole saatavilla tässä datassa." : "Points breakdown is unavailable in this data."}</p>}
            {Boolean(breakdown?.length) && explained !== score && <div className="player-point-row"><span>{fi ? "Muu FPL-pistepäivitys" : "Other FPL points update"}</span><span>—</span><b>{signed(score - explained)}</b></div>}
            <div className="player-point-total"><span>{fi ? "Yhteensä" : "Total"}</span><b>{score}</b></div>
            <p className="player-modal-note">{fi ? "Sisältää bonukset. Pisteiden erittely on ilman kapteenikerrointa." : "Includes bonus. Breakdown is shown before the captain multiplier."}</p>
          </section>
          {player.liveStats && <section className="player-round-live"><h3>{fi ? "Kierroksen ottelutilastot" : "Gameweek match stats"}</h3>
            <table className="player-data-table player-live-table"><tbody>{liveFields.flatMap(([key, fin, en]) => {
              const value = player.liveStats?.[key];
              if (key === "saves" && player.position !== "GK") return [];
              if (key === "defensive_contribution" && player.position === "GK") return [];
              if (value === undefined || value === null || !Number.isFinite(Number(value))) return [];
              const sum = key === "defensive_contribution";
              const formula = player.position === "DEF" ? fi ? "Purut, blokit, katkot ja taklaukset. Pallonriistot eivät kuulu puolustajan summaan." : "Clearances, blocks, interceptions and tackles. Recoveries are excluded for defenders." : fi ? "Purut, blokit, katkot, taklaukset ja pallonriistot yhteensä." : "Clearances, blocks, interceptions, tackles and recoveries combined.";
              const name = key === "recoveries" && player.position === "DEF" ? fi ? "Pallonriistot · ei summaan" : "Recoveries · excluded" : fi ? fin : en;
              return [<tr key={key} className={sum ? "live-stat-total" : undefined}><th scope="row" title={sum ? formula : undefined}>{name}</th><td>{key.startsWith("expected_") ? Number(value).toFixed(2) : value}</td></tr>];
            })}</tbody></table>
            <p className="player-modal-note">{fi ? "FPL:n kierrosluvut, tuplakierroksella otteluiden yhteissumma. Luvut voivat päivittyä viiveellä." : "FPL gameweek totals, summed across double gameweeks. Updates may be delayed."}</p>
          </section>}
          <section className="player-round-owners"><h3>{fi ? `Kenellä kaikilla on ${player.name}` : `Who owns ${player.name}`}<span>{owners.length}/{data.managers.length}</span></h3>
            {owners.map((owner) => <div className={`player-owner-row ${owner.manager.id === manager?.id ? "selected" : ""}`} key={owner.manager.id}><div><b>{owner.manager.teamName}</b><small>{owner.manager.managerName}</small></div><span>{owner.multiplier === 0 ? fi ? "Penkki" : "Bench" : owner.multiplier > 1 ? owner.multiplier === 3 ? fi ? "Triplakapteeni" : "Triple captain" : fi ? "Kapteeni" : "Captain" : fi ? "Avaus" : "Starting"}</span><strong>{score * owner.multiplier}</strong></div>)}
          </section>
          {!owners.length && <p className="player-modal-note player-round-note">{fi ? "Ei Farmisarjan joukkueilla." : "No Farmisarja teams own this player."}</p>}
          {player.news && <p className="player-modal-note player-round-note">{player.news}</p>}
        </> : tab === "season" ? <section><h3>{fi ? "Kauden tilastot" : "Season statistics"}</h3><p className="player-modal-note">{fi ? "FPL:n kausiluvut. Käynnissä olevan kierroksen tiedot voivat päivittyä viiveellä." : "FPL season totals. Current gameweek updates may appear with a delay."}</p>
          {season ? <table className="player-data-table player-season-table"><thead><tr><th>{fi ? "Tilasto" : "Statistic"}</th><th>{fi ? "Kausi" : "Season"}</th></tr></thead><tbody>{seasonFields.filter(([key]) => key !== "saves" || player.position === "GK").map(([key, fin, en]) => <tr key={key}><th scope="row">{fi ? fin : en}</th><td>{season[key] ?? "—"}</td></tr>)}</tbody></table> : <p>{fi ? "Kauden tilastot eivät ole saatavilla." : "Season statistics unavailable."}</p>}
        </section> : <section className="player-matches-section"><div className="player-match-toolbar"><h3>{matchView==="upcoming"?fi?"Tulevat ottelut":"Upcoming fixtures":fi?"Ottelukohtaiset tilastot":"Match history"}</h3><div className="player-match-view" role="group" aria-label={fi?"Otteluiden ajankohta":"Fixture period"}><button aria-pressed={matchView==="history"} onClick={()=>setMatchView("history")}>{fi?"Pelatut":"Played"}</button><button aria-pressed={matchView==="upcoming"} onClick={()=>setMatchView("upcoming")}>{fi?"Tulevat":"Upcoming"}</button></div></div><p className="player-modal-note">{matchView==="upcoming"?fi?"Otteluohjelma ja FPL:n vaikeustasot: 1 on helpoin, 5 vaikein. Ajat voivat muuttua.":"Fixture schedule and FPL difficulty: 1 is easiest, 5 hardest. Kickoff times may change.":fi?"Vain vahvistetut kierrokset, ilman kapteenikerrointa. Jokainen ottelu omalla rivillään. Historia päivittyy vasta kierroksen vahvistuttua.":"Confirmed gameweeks only, before captain multipliers. One row per fixture. History refreshes only after a gameweek is confirmed."}</p>
          {historyError ? <p role="status">{fi ? "Otteluhistorian lataus epäonnistui." : "Could not load match history."} <button className="player-history-retry" onClick={() => setRetry((n) => n + 1)}>{fi ? "Yritä uudelleen" : "Retry"}</button></p> : !history ? <p role="status">{fi ? "Ladataan otteluita…" : "Loading matches…"}</p> : matchView === "upcoming" ? !upcoming.length ? <p>{fi?"Ei tulevia otteluita tällä kaudella.":"No upcoming fixtures this season."}</p> : <div className="player-history-scroll" tabIndex={0} aria-label={fi?"Tulevien otteluiden taulukko":"Upcoming fixtures table"}><table className="player-data-table player-future-table"><thead><tr><th>GW</th><th>{fi?"Vastustaja":"Opponent"}</th><th>{fi?"Kenttä":"Venue"}</th><th>{fi?"Alkamisaika":"Kickoff"}</th><th>{fi?"Vaikeustaso":"Difficulty"}</th></tr></thead><tbody>{upcoming.map(fixture=><tr key={fixture.id}><th scope="row">{fixture.gameweek??"—"}</th><td>{fixture.opponent}</td><td>{fixture.venue==="H"?fi?"Koti":"Home":fi?"Vieras":"Away"}</td><td>{fixture.kickoff?new Intl.DateTimeFormat(fi?"fi-FI":"en-GB",{weekday:"short",day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(fixture.kickoff)):fi?"Aika vahvistamatta":"To be confirmed"}</td><td><b className={`player-fixture-difficulty fdr-${fixture.difficulty}`}>{fixture.difficulty>0?`${fixture.difficulty}/5`:"—"}</b></td></tr>)}</tbody></table></div> : !history.history.length ? <p>{fi ? "Ei otteluita tällä kaudella." : "No matches this season."}</p> :
          <div className="player-history-scroll" tabIndex={0} aria-label={fi ? "Ottelutilastot, vieritä sivulle" : "Match statistics, scroll horizontally"}><table className="player-data-table player-history-table"><thead><tr>
            {[["GW", "GW"], ["Vastustaja", "Opponent"], ["Tulos", "Result"], ["Pist.", "Pts"], ["Min", "Min"], ["Maalit", "Goals"], ["Syötöt", "Assists"], ["Nollapelit", "Clean sheets"], ["Bonus", "Bonus"], ["BPS", "BPS"], ["Puolustuspanos", "Def. contrib."], ["Torjunnat", "Saves"], ["Kelt.", "YC"], ["Pun.", "RC"], ["xG", "xG"], ["xA", "xA"]].filter((_, i) => i !== 11 || player.position === "GK").map(([fin, en]) => <th key={en} scope="col">{fi ? fin : en}</th>)}
          </tr></thead><tbody>{history.history.map((match) => <tr key={match.fixture}>
            <th scope="row">{match.round}</th><td>{history.teams[match.opponent_team] ?? match.opponent_team} {match.was_home ? "(H)" : "(A)"}</td><td>{match.team_h_score ?? "–"}–{match.team_a_score ?? "–"}</td><td className="match-points">{match.total_points}</td>
            {[match.minutes, match.goals_scored, match.assists, match.clean_sheets, match.bonus, match.bps, match.defensive_contribution, match.saves, match.yellow_cards, match.red_cards, match.expected_goals, match.expected_assists].filter((_, i) => i !== 7 || player.position === "GK").map((value, i) => <td key={i}>{value ?? "—"}</td>)}
          </tr>)}</tbody></table></div>}
        </section>}
      </div>
    </div>
  </div>, document.querySelector(".app-shell") ?? document.body);
}
