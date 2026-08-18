import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock3, Languages, Moon, Sun } from "lucide-react";
import { demoData } from "./demoData";
import { loadLiveDashboard } from "./services/liveDashboard";
import { translations } from "./i18n";
import type { DashboardData, Language, ManagerRow, SquadPlayer } from "./types";

type SortKey = "position" | "gameweekPoints" | "totalPoints" | "overallRank" | "captainPoints" | "upcoming" | "form" | "teamValue" | "seasonTransfers" | "benchPointsBeforeGw";

const number = new Intl.NumberFormat("fi-FI");

const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";

function TransferCell({ manager, language }: { manager: ManagerRow; language: Language }) {
  const t = translations(language);
  const gain = manager.transfers.reduce((sum, transfer) => sum + transfer.inPoints - transfer.outPoints, 0);
  const net = gain - manager.hit;
  const netSummary = () => manager.transfers.length > 0 && <span className="net-summary">{manager.hit > 0 && <><b className={gain >= 0 ? "positive" : "negative"}>{signed(gain)}</b><b className="negative">−{manager.hit}</b><i>→</i></>}<strong className={net >= 0 ? "positive" : "negative"}>{signed(net)} net</strong></span>;
  if (manager.chip === "WC") {
    const current = manager.gameweekPoints + manager.provisionalBonus;
    const previous = manager.wildcardPreviousTeamPoints ?? current;
    return <div className="transfer-cell wildcard-transfer" data-label={t.transfers}>
      <strong>WC</strong><small>{t.oldTeam} {previous} → {t.currentTeam} {current}</small>
      <b className={current - previous >= 0 ? "positive" : "negative"}>{signed(current - previous)} {t.net}</b>
      {manager.freeTransfersAfter !== undefined && <em>{t.nextGw}: {manager.freeTransfersAfter} FT</em>}
    </div>;
  }
  return <div className="transfer-cell" data-label={t.transfers}>
    {manager.transfers.map((transfer, index) => {
      const difference = transfer.inPoints - transfer.outPoints;
      return <small key={index}><span className="desktop-transfer-row">{transfer.out} ({transfer.outPoints}) <i>→</i> {transfer.in} ({transfer.inPoints})</span><span className="mobile-transfer-row">{transfer.out} {transfer.outPoints} <i>→</i> {transfer.in} {transfer.inPoints}</span><b className={difference >= 0 ? "positive" : "negative"}>{signed(difference)}</b></small>;
    })}
    {!manager.transfers.length && <small className="muted">{t.noTransfers}</small>}
    <div className="desktop-transfer-footer">{netSummary()}{manager.freeTransfersAfter !== undefined && <span>GW{demoData.gameweek + 1}: {manager.freeTransfersAfter} FT</span>}</div>
    <div className="mobile-transfer-footer">{netSummary()}{manager.freeTransfersAfter !== undefined && <span>GW{demoData.gameweek + 1}: {manager.freeTransfersAfter} FT</span>}</div>
  </div>;
}

function ChipsCell({ manager, label }: { manager: ManagerRow; label: string }) {
  return <div className="chips-cell" data-label={label}>{manager.availableChips.map((chip) => <span className={manager.chip === chip ? "active" : manager.usedChips.includes(chip) ? "used" : ""} key={chip}>{chip}</span>)}</div>;
}

function TeamValueCell({ manager, label }: { manager: ManagerRow; label: string }) {
  const change = Math.round((manager.teamValue - manager.previousTeamValue) * 10) / 10;
  return <div className="team-value-cell" data-label={label}><strong>£{manager.teamValue.toFixed(1)}m</strong>{change !== 0 && <span className={change > 0 ? "positive" : "negative"}>{signed(change)}m</span>}</div>;
}

function SeasonTransfersCell({ manager, label }: { manager: ManagerRow; label: string }) {
  return <div className="season-transfers-cell" data-label={label}><strong>{manager.seasonTransfers}</strong>{manager.seasonHitPoints > 0 && <span>(−{manager.seasonHitPoints} hit)</span>}</div>;
}

function BenchPointsCell({ manager, label }: { manager: ManagerRow; label: string }) {
  const currentBenchPoints = manager.chip === "BB" ? 0 : manager.squad.filter((player) => !player.starter).reduce((sum, player) => sum + player.points + player.bonus, 0);
  const total = manager.benchPointsBeforeGw + currentBenchPoints;
  return <div className="bench-points-cell" data-label={label}><strong>{total}</strong><span>+{currentBenchPoints}</span></div>;
}

function captainDisplay(manager: ManagerRow, autosubs: boolean) {
  const captain = manager.squad.find((player) => player.captain);
  const vice = manager.squad.find((player) => player.viceCaptain);
  const captainMissedOut = autosubs && captain?.state === "finished" && captain.minutes === 0;
  const viceCanTakeOver = vice && !(vice.state === "finished" && vice.minutes === 0);
  const effective = captainMissedOut && viceCanTakeOver ? vice : captain;
  const multiplier = manager.chip === "3×C" ? 3 : 2;
  return effective ? { name: effective.name, points: (effective.points + effective.bonus) * multiplier } : { name: manager.captain, points: manager.captainPoints };
}

function weightedProgress(manager: ManagerRow) {
  const players = manager.chip === "BB" ? manager.squad : manager.squad.filter((player) => player.starter);
  return players.reduce((counts, player) => {
    const weight = player.captain ? (manager.chip === "3×C" ? 3 : 2) : 1;
    const fixtures = player.fixtures ?? [{ state: player.state }];
    fixtures.forEach((fixture) => {
      counts.total += weight;
      if (fixture.state === "finished") counts.finished += weight;
      if (fixture.state === "live") counts.live += weight;
    });
    return counts;
  }, { finished: 0, live: 0, total: 0 });
}

function Movement({ current, previous }: { current: number; previous: number }) {
  if (current === previous) return <span className="movement neutral">—</span>;
  const improved = current < previous;
  return <span className={`movement ${improved ? "up" : "down"}`}>{improved ? <ArrowUp /> : <ArrowDown />}{Math.abs(previous - current)}</span>;
}

function compactRank(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value);
}

function BrandLogo({ isLive }: { isLive: boolean }) {
  return <div className={`brand-logo ${isLive ? "is-live" : "is-idle"}`} aria-label={isLive ? "Farmisarja Live" : "Farmisarja"}>
    <svg className="brand-logo-desktop" viewBox={isLive ? "0 0 475 58" : "0 0 375 58"} role="img" aria-hidden="true">
      <path className="brand-logo-base" d={isLive ? "M12 3h374l-17 52H12C5.4 55 2 51.6 2 45V13C2 6.4 5.4 3 12 3Z" : "M12 3h351c6.6 0 10 3.4 10 10v32c0 6.6-3.4 10-10 10H12C5.4 55 2 51.6 2 45V13C2 6.4 5.4 3 12 3Z"} />
      {isLive && <>
      <path className="brand-logo-live" d="M380 3h83c6.6 0 10 3.4 10 10v32c0 6.6-3.4 10-10 10H363l17-52Z" />
      </>}
      <image href={`${import.meta.env.BASE_URL}branding/fantasy-logo.svg`} x="15" y="12" width="130" height="34" />
      <path className="brand-logo-divider" d="M157 12v34" />
      <text className="brand-logo-name" x="170" y="38">FARMISARJA</text>
      {isLive && <><circle className="brand-logo-dot" cx="401" cy="29" r="6" /><text className="brand-logo-live-text" x="415" y="38">LIVE</text></>}
    </svg>
    <svg className="brand-logo-mobile" viewBox={isLive ? "0 0 370 58" : "0 0 270 58"} role="img" aria-hidden="true">
      <path className="brand-logo-base" d={isLive ? "M12 3h268l-17 52H12C5.4 55 2 51.6 2 45V13C2 6.4 5.4 3 12 3Z" : "M12 3h246c6.6 0 10 3.4 10 10v32c0 6.6-3.4 10-10 10H12C5.4 55 2 51.6 2 45V13C2 6.4 5.4 3 12 3Z"} />
      {isLive && <path className="brand-logo-live" d="M274 3h83c6.6 0 10 3.4 10 10v32c0 6.6-3.4 10-10 10H257l17-52Z" />}
      <svg x="17" y="9" width="30" height="40" viewBox="0 0 76 104" preserveAspectRatio="xMidYMid meet"><image href={`${import.meta.env.BASE_URL}branding/fantasy-logo.svg`} width="453" height="104" /></svg>
      <path className="brand-logo-divider" d="M55 12v34" />
      <text className="brand-logo-name" x="68" y="38">FARMISARJA</text>
      {isLive && <><circle className="brand-logo-dot" cx="295" cy="29" r="6" /><text className="brand-logo-live-text" x="309" y="38">LIVE</text></>}
    </svg>
  </div>;
}

function SortHeader({ label, sortKey, active, direction, onSort }: { label: string; sortKey: SortKey; active: SortKey; direction: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  return <button className={`sort-header ${active === sortKey ? "active" : ""}`} onClick={() => onSort(sortKey)}>{label}<ChevronDown className={active === sortKey && direction === "asc" ? "rotate" : ""} /></button>;
}

function Shirt({ player }: { player: SquadPlayer }) {
  const source = `${import.meta.env.BASE_URL}kits/optimized/${player.club.toLowerCase()}.webp`;
  return <div className="shirt"><img className="shirt-image" src={source} alt="" /></div>;
}

function PlayerCard({ player, best, worst, language, tripleCaptain, scoreMultiplier, groupLabel, mobileGroupLabel, groupKind }: { player: SquadPlayer; best: boolean; worst: boolean; language: Language; tripleCaptain: boolean; scoreMultiplier: number; groupLabel?: string; mobileGroupLabel?: string; groupKind?: "position" | "bench" }) {
  const t = translations(language);
  return <div className={`player player-${player.state} ${player.starter ? "player-starter" : "player-bench"} ${best ? "player-best" : ""} ${worst ? "player-worst" : ""} ${groupLabel ? `group-start group-${groupKind}` : ""}`}>
    {groupLabel && <span className="player-group-label"><b className="desktop-squad-label">{groupLabel}</b><b className="mobile-squad-label">{mobileGroupLabel ?? groupLabel}</b></span>}
    <div className="player-visual">{player.captain && <span className={`armband captain ${tripleCaptain ? "triple" : ""}`}>C</span>}{player.viceCaptain && <span className={`armband ${tripleCaptain ? "triple" : ""}`}>V</span>}<Shirt player={player} /></div>
    <div className="player-name">{player.name}</div>
    <div className="player-bottom"><span className={`player-fixture venue-${player.venue.toLowerCase()}`}><i className={`state-dot ${player.state}`} /><span className="desktop-fixture">vs. {player.opponent} {player.venue}</span><span className="mobile-opponent">{player.opponent}</span><b> · {player.position}</b></span><strong className="player-points"><span className="desktop-player-score">{(player.points + player.bonus) * scoreMultiplier}</span><span className="mobile-player-score">{(player.points + player.bonus) * scoreMultiplier}</span></strong></div>
  </div>;
}

function Squad({ manager, language, autosubs }: { manager: ManagerRow; language: Language; autosubs: boolean }) {
  const t = translations(language);
  const originalCaptain = manager.squad.find((player) => player.captain);
  const originalVice = manager.squad.find((player) => player.viceCaptain);
  const captainMissedOut = autosubs && originalCaptain?.state === "finished" && originalCaptain.minutes === 0;
  const viceCanTakeOver = originalVice && !(originalVice.state === "finished" && originalVice.minutes === 0);
  const promotedViceId = captainMissedOut && viceCanTakeOver ? originalVice.id : undefined;
  const originalOrder = manager.squad.map((player) => promotedViceId ? {
    ...player,
    captain: player.id === promotedViceId,
    viceCaptain: player.id === originalCaptain?.id,
  } : player).sort((a, b) => a.squadPosition - b.squadPosition);
  const active = originalOrder.filter((player) => player.starter);
  const bench = originalOrder.filter((player) => !player.starter);
  const scoringPlayers = manager.chip === "BB" ? originalOrder : active;
  const scoreMultiplier = (player: SquadPlayer) => player.captain ? (manager.chip === "3×C" ? 3 : 2) : 1;
  const totals = scoringPlayers.map((player) => (player.points + player.bonus) * scoreMultiplier(player));
  const best = Math.max(...totals);
  const worst = Math.min(...totals);
  const positionLabels = language === "fi"
    ? { GK: "MAALIVAHTI", DEF: "PUOLUSTUS", MID: "KESKIKENTTÄ", FWD: "HYÖKKÄYS" }
    : { GK: "GOALKEEPER", DEF: "DEFENCE", MID: "MIDFIELD", FWD: "FORWARDS" };
  const mobilePositionLabels = language === "fi"
    ? { GK: "MV", DEF: "PAKIT", MID: "KK", FWD: "HYÖK." }
    : { GK: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };
  const renderPlayer = (player: SquadPlayer, groupLabel?: string, mobileGroupLabel?: string, groupKind?: "position" | "bench") => {
    const liveScore = (player.points + player.bonus) * scoreMultiplier(player);
    return <PlayerCard key={player.id} player={player} best={(player.starter || manager.chip === "BB") && liveScore === best} worst={(player.starter || manager.chip === "BB") && liveScore === worst} language={language} tripleCaptain={manager.chip === "3×C"} scoreMultiplier={scoreMultiplier(player)} groupLabel={groupLabel} mobileGroupLabel={mobileGroupLabel} groupKind={groupKind} />;
  };
  return <div className="squad-panel">
    <div className="squad-heading"><span><b className="mobile-squad-label">{t.squad}</b></span><div className="squad-legend"><span className="legend-finished">{t.finished}</span><span className="legend-live">{t.playing}</span><span className="legend-upcoming">{t.toPlay}</span><span className="legend-best"><i />{t.best}</span><span className="legend-worst"><i />{t.worst}</span></div></div>
    <div className="squad-players">
      <div className="squad-grid starters">{active.map((player, index) => renderPlayer(player, index === 0 || active[index - 1].position !== player.position ? positionLabels[player.position] : undefined, index === 0 || active[index - 1].position !== player.position ? mobilePositionLabels[player.position] : undefined, "position"))}</div>
      <div className="squad-heading bench-heading"><span>{t.bench}</span></div>
      <div className={`squad-grid bench ${manager.chip === "BB" ? "bench-boost" : ""}`}><span className="bench-frame-label">{t.bench}{manager.chip === "BB" && <b>BB</b>}</span>{bench.map((player) => renderPlayer(player))}</div>
    </div>
  </div>;
}

export default function App() {
  const [language, setLanguage] = useState<Language>("fi");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [autosubs, setAutosubs] = useState(true);
  const [mobileDetails, setMobileDetails] = useState(true);
  const [period, setPeriod] = useState("total");
  const [expanded, setExpanded] = useState<number | null>(101);
  const [sort, setSort] = useState<SortKey>("position");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [now, setNow] = useState(() => Date.now());
  const [data, setData] = useState<DashboardData>(demoData);
  const t = translations(language);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    loadLiveDashboard().then((liveData) => {
      if (active && liveData) setData(liveData);
    }).catch((error) => console.warn("Live FPL data is not ready; keeping preview data.", error));
    return () => { active = false; };
  }, []);

  const managers = useMemo(() => [...data.managers].sort((a, b) => {
    const aValue = sort === "form" ? a.form.reduce((sum, value) => sum + value, 0) / a.form.length : a[sort];
    const bValue = sort === "form" ? b.form.reduce((sum, value) => sum + value, 0) / b.form.length : b[sort];
    return (aValue - bValue) * (direction === "asc" ? 1 : -1);
  }), [data.managers, direction, sort]);

  const handleSort = (key: SortKey) => {
    if (sort === key) setDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection(key === "overallRank" || key === "position" ? "asc" : "desc"); }
  };

  const highest = Math.max(...data.managers.map((manager) => manager.gameweekPoints + manager.provisionalBonus - manager.hit));
  const monthFormatter = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { month: "long" });
  const headers: Array<[string, SortKey]> = [[t.position, "position"], [t.manager, "position"], [t.captain, "captainPoints"], [t.transfers, "position"], [t.seasonTransfers, "seasonTransfers"], [t.chips, "position"], [t.teamValue, "teamValue"], [t.benchPoints, "benchPointsBeforeGw"], [t.form, "form"], [t.gwPoints, "gameweekPoints"], [t.progress, "upcoming"], [t.total, "totalPoints"]];
  const gameweekIsLive = data.managers.some((manager) => manager.live > 0);
  const deadlineMs = Math.max(0, new Date(data.deadline).getTime() - now);
  const deadlineLabel = deadlineMs >= 86_400_000
    ? `${Math.ceil(deadlineMs / 86_400_000)} ${language === "fi" ? "pv deadlineen" : "days to deadline"}`
    : `${String(Math.floor(deadlineMs / 3_600_000)).padStart(2, "0")}:${String(Math.floor(deadlineMs % 3_600_000 / 60_000)).padStart(2, "0")}:${String(Math.floor(deadlineMs % 60_000 / 1000)).padStart(2, "0")}`;
  const compactDeadlineLabel = deadlineMs >= 86_400_000
    ? `${Math.ceil(deadlineMs / 86_400_000)} ${language === "fi" ? "pv" : "d"}`
    : deadlineLabel;
  const updatedLabel = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { dateStyle: "short", timeStyle: "medium" }).format(new Date(data.updatedAt));

  return <div className="app-shell" data-theme={theme} data-mobile-details={mobileDetails ? "on" : "off"}>
    <header className="topbar">
      <BrandLogo isLive={gameweekIsLive} />
      <div className="top-actions">
        <div className="gameweek-status"><b>GW&nbsp;{data.gameweek}</b>{!gameweekIsLive && <span className="deadline"><Clock3 /><i className="deadline-full">{deadlineLabel}</i><i className="deadline-compact">{compactDeadlineLabel}</i></span>}</div>
        <button className="theme-toggle" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <button className="language" onClick={() => setLanguage((value) => value === "fi" ? "en" : "fi")}><Languages />{language === "fi" ? "EN" : "FI"}</button>
      </div>
    </header>

    <main>
      <div className="toolbar">
        <select className="period-select" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label={language === "fi" ? "Valitse ajanjakso" : "Select period"}>
          <option value="total">Total</option>
          {data.completedMonths.map((month) => <option value={month} key={month}>{monthFormatter.format(new Date(`${month}-01T12:00:00Z`))}</option>)}
        </select>
        <div className="toolbar-toggles"><label className="details-toggle"><span>{t.details}</span><button role="switch" aria-checked={mobileDetails} onClick={() => setMobileDetails((value) => !value)} className={mobileDetails ? "enabled" : ""}><i /></button></label><label className="autosub-toggle"><span>{t.autosubs}</span><button role="switch" aria-checked={autosubs} onClick={() => setAutosubs((value) => !value)} className={autosubs ? "enabled" : ""}><i /></button><b>{autosubs ? t.on : t.off}</b></label></div>
      </div>

      <section className="league-table">
        <div className="table-head">{headers.map(([label, key], index) => <SortHeader key={`${label}-${index}`} label={label} sortKey={key} active={sort} direction={direction} onSort={handleSort} />)}</div>
        <div className="rows">
          <div className="mobile-simple-head"><span /><span /><b>GW</b><b>{t.total}</b></div>
          {managers.map((manager) => {
            const open = expanded === manager.id;
            const topScore = !data.rosterOnly && manager.gameweekPoints + manager.provisionalBonus - manager.hit === highest;
            const displayedGwPoints = manager.gameweekPoints + manager.provisionalBonus - manager.hit;
            const captain = captainDisplay(manager, autosubs);
            const rankClass = manager.overallRank < manager.previousOverallRank ? "rank-up" : manager.overallRank > manager.previousOverallRank ? "rank-down" : "rank-neutral";
            const progress = weightedProgress(manager);
            return <div className={`manager-block ${open ? "open" : ""} ${data.rosterOnly ? "roster-only" : ""}`} key={manager.id}>
              <div className="manager-row" onClick={() => setExpanded(open ? null : manager.id)}>
                <div className="position-cell"><button aria-label="Expand squad">{open ? <ChevronDown /> : <ChevronRight />}</button><strong>{manager.position}</strong>{!data.rosterOnly && <Movement current={manager.position} previous={manager.previousPosition} />}{!data.rosterOnly && <small className={`position-or ${rankClass}`} title={`OR ${number.format(manager.overallRank)}`}>OR {compactRank(manager.overallRank)}</small>}{manager.chip && <span className="mobile-active-chip">{manager.chip}</span>}</div>
                <div className="manager-cell"><a href={`https://fantasy.premierleague.com/entry/${manager.id}/event/${data.gameweek}`} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer">{manager.teamName}</a><span>{manager.managerName}</span>{!data.rosterOnly && <span className="mobile-captain"><b>C</b><strong>{captain.name}</strong><em>{captain.points} pts</em></span>}{!data.rosterOnly && <small className={rankClass} title={t.rankEstimate}>OR {number.format(manager.overallRank)}</small>}</div>
                <div className="captain-cell" data-label={t.captain}><strong>{captain.name}</strong><span>{captain.points} pts</span></div>
                <TransferCell manager={manager} language={language} />
                <SeasonTransfersCell manager={manager} label={t.seasonTransfers} />
                <ChipsCell manager={manager} label={t.chips} />
                <TeamValueCell manager={manager} label={t.teamValue} />
                <BenchPointsCell manager={manager} label={t.benchPoints} />
                <div className="form-cell" data-label={t.form}>{manager.form.map((value, index) => <span key={index} className={`${manager.formRankMovement[index] > 0 ? "rank-up" : manager.formRankMovement[index] < 0 ? "rank-down" : "rank-neutral"} ${index === manager.form.length - 1 ? "current" : ""}`}>{value}</span>)}</div>
                <div className={`points-cell ${topScore ? "top-score" : ""}`} data-label={t.gwPoints}><strong>{displayedGwPoints}</strong><span className={`points-formula ${manager.hit > 0 ? "" : "empty"}`}>{manager.hit > 0 ? <>({manager.gameweekPoints + manager.provisionalBonus} <b>− {manager.hit}</b> = {displayedGwPoints})</> : " "}</span></div>
                <div className="progress-cell" data-label={t.progress}>{progress.finished === progress.total && progress.live === 0 ? <strong className={data.pointsFinalized ? "is-final" : "is-provisional"}>{data.pointsFinalized ? "FINAL" : "PROVISIONAL"}</strong> : <><span className="progress-summary">({progress.finished}/{progress.total})</span>{progress.live > 0 && <small><b>{progress.live}</b> LIVE</small>}</>}</div>
                <div className="total-cell" data-label={t.total}><strong>{number.format(manager.totalPoints - manager.hit)}</strong></div>
              </div>
              {open && (data.rosterOnly
                ? <div className="squad-panel squad-unavailable">{language === "fi" ? "Pelaajat tulevat näkyviin, kun peliviikon deadline on sulkeutunut." : "Players will appear after the gameweek deadline has passed."}</div>
                : <Squad manager={manager} language={language} autosubs={autosubs} />)}
            </div>;
          })}
        </div>
      </section>
    </main>
    <footer><span>Official FPL data</span><span>{t.updated}: {updatedLabel}</span></footer>
  </div>;
}
