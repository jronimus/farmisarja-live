import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock3, Globe, Medal } from "lucide-react";
import { demoData } from "./demoData";
import { loadLiveDashboard } from "./services/liveDashboard";
import { provisionalAutosubSquad } from "./services/fplRules";
import { translations } from "./i18n";
import ShareCard, { type CardKind } from "./ShareCard";
import type { DashboardData, GameweekFixture, Language, ManagerRow, SquadPlayer } from "./types";

type SortKey = "position" | "gameweekPoints" | "totalPoints" | "overallRank" | "captainPoints" | "upcoming" | "form" | "teamValue" | "seasonTransfers" | "benchPointsBeforeGw";

const number = new Intl.NumberFormat("fi-FI");

const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
const chipClass = (chip: string) => `chip-${chip.toLowerCase()}`;
const pad = (value: number) => String(Math.floor(value)).padStart(2, "0");

function countdownLabel(ms: number, language: Language) {
  if (ms >= 86_400_000) return `${Math.floor(ms / 86_400_000)} ${language === "fi" ? "pv" : "d"} ${Math.floor((ms % 86_400_000) / 3_600_000)} h`;
  return `${pad(ms / 3_600_000)}:${pad(ms % 3_600_000 / 60_000)}:${pad(ms % 60_000 / 1000)}`;
}

function FixtureMenu({ fixtures, played, language }: { fixtures: GameweekFixture[]; played: number; language: Language }) {
  const t = translations(language);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const kickoffFormat = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const stateLabels = { upcoming: t.fixtureUpcoming, live: t.fixtureLive, provisional: t.fixtureProvisional, final: t.fixtureFinal };
  return <div className="fixture-menu" ref={container}>
    <button type="button" className={`fixture-button ${open ? "open" : ""}`} aria-expanded={open} aria-label={t.fixtures} onClick={() => setOpen((value) => !value)}>
      <span className="fixture-count"><b>{played}/{fixtures.length}</b><small>{t.fixturesPlayed}</small></span><ChevronDown />
    </button>
    {open && <div className="fixture-panel">
      <div className="fixture-panel-head"><b>{t.fixtures}</b><span>{played}/{fixtures.length} {t.fixturesPlayed}</span></div>
      {fixtures.map((fixture) => <div className={`fixture-row fixture-${fixture.status}`} key={fixture.id}>
        <span className="fixture-kickoff">{fixture.status === "upcoming" ? kickoffFormat.format(new Date(fixture.kickoff)) : <b>{fixture.homeScore ?? 0}–{fixture.awayScore ?? 0}</b>}</span>
        <span className="fixture-teams"><b>{fixture.home}</b><i>–</i><b>{fixture.away}</b></span>
        <span className="fixture-state">{fixture.status === "live" && <i className="fixture-dot" />}{stateLabels[fixture.status]}</span>
      </div>)}
    </div>}
  </div>;
}

function GitHubLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 .7A11.3 11.3 0 0 0 8.4 22.8c.6.1.8-.3.8-.6v-2.4c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.6 0-1.2.4-2.2 1.2-3-.1-.3-.5-1.5.1-3 0 0 1-.3 3.1 1.1a10.8 10.8 0 0 1 5.7 0C16.9 5 18 5.3 18 5.3c.6 1.5.2 2.7.1 3 .7.8 1.2 1.8 1.2 3 0 4.3-2.7 5.3-5.3 5.6.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" />
  </svg>;
}

type Award = { level: 0 | 1 | 2 | 3; tone: "green" | "gold" | "red" | "blue" | "purple" };

const transferNet = (manager: ManagerRow) => manager.chip === "WC" || manager.chip === "FH"
  ? manager.wildcardPreviousTeamPoints === undefined ? Number.NaN : manager.gameweekPoints + manager.provisionalBonus - manager.wildcardPreviousTeamPoints
  : manager.transfers.reduce((sum, transfer) => sum + transfer.inPoints - transfer.outPoints, 0) - manager.hit;

const currentBenchPoints = (manager: ManagerRow, autosubs = false) => manager.chip === "BB" ? 0 : provisionalAutosubSquad(manager.squad, autosubs).filter((player) => !player.starter).reduce((sum, player) => sum + player.points + player.bonus, 0);

function TransferCell({ manager, language, award, gameweek }: { manager: ManagerRow; language: Language; award?: Award; gameweek: number }) {
  const t = translations(language);
  const nextGw = `GW${gameweek + 1}`;
  const gain = manager.transfers.reduce((sum, transfer) => sum + transfer.inPoints - transfer.outPoints, 0);
  const net = gain - manager.hit;
  const netSummary = () => manager.transfers.length > 0 && <span className="net-summary">{manager.hit > 0 && <><b className={gain >= 0 ? "positive" : "negative"}>{signed(gain)}</b><b className="negative">−{manager.hit}</b><i>→</i></>}<strong className={`${net >= 0 ? "positive" : "negative"} ${award ? `award-target award-${award.tone} award-level-${award.level}` : ""}`}>{signed(net)} net</strong></span>;
  if (manager.chip === "WC" || manager.chip === "FH") {
    const current = manager.gameweekPoints + manager.provisionalBonus;
    const previous = manager.wildcardPreviousTeamPoints;
    const isFreeHit = manager.chip === "FH";
    const previousLabel = isFreeHit ? (language === "fi" ? "Normaali" : "Regular") : t.oldTeam;
    const currentLabel = isFreeHit ? "FH" : t.currentTeam;
    return <div className="transfer-cell wildcard-transfer" data-label={t.transfers}>
      <strong>{manager.chip}</strong><small>{previousLabel} {previous ?? "ERROR"} → {currentLabel} {current}</small>
      {previous !== undefined ? <b className={current - previous >= 0 ? "positive" : "negative"}>{signed(current - previous)} {t.net}</b> : <b className="negative">ERROR</b>}
      {manager.freeTransfersAfter !== undefined && <em>{nextGw}: {manager.freeTransfersAfter} FT</em>}
    </div>;
  }
  return <div className="transfer-cell" data-label={t.transfers}>
    {manager.transfers.map((transfer, index) => {
      const difference = transfer.inPoints - transfer.outPoints;
      // The names are wrapped so the column can truncate them instead of overflowing when
      // a manager makes several transfers or picks up a long name.
      const pair = <><span className="tf-name">{transfer.out}</span> <b className="transfer-player-points">{transfer.outPoints}</b> <i>→</i> <span className="tf-name">{transfer.in}</span> <b className="transfer-player-points">{transfer.inPoints}</b></>;
      return <small key={index}><span className="desktop-transfer-row">{pair}</span><span className="mobile-transfer-row">{pair}</span><i className="transfer-equals">=</i><b className={difference >= 0 ? "positive" : "negative"}>{signed(difference)}</b></small>;
    })}
    {!manager.transfers.length && <small className="muted">{t.noTransfers}</small>}
    <div className="desktop-transfer-footer">{netSummary()}{manager.freeTransfersAfter !== undefined && <span>{nextGw}: {manager.freeTransfersAfter} FT</span>}</div>
    <div className="mobile-transfer-footer">{netSummary()}{manager.freeTransfersAfter !== undefined && <span>{nextGw}: {manager.freeTransfersAfter} FT</span>}</div>
  </div>;
}

function ChipsCell({ manager, label }: { manager: ManagerRow; label: string }) {
  return <div className="chips-cell" data-label={label}>{manager.availableChips.map((chip) => <span className={`${chipClass(chip)} ${manager.chip === chip ? "active" : manager.usedChips.includes(chip) ? "used" : ""}`} key={chip}>{chip}</span>)}</div>;
}

function TeamValueCell({ manager, label, award, available = true }: { manager: ManagerRow; label: string; award?: Award; available?: boolean }) {
  if (!available) return <div className="team-value-cell unavailable" data-label={label}><strong>—</strong></div>;
  const change = Math.round((manager.teamValue - manager.previousTeamValue) * 10) / 10;
  return <div className="team-value-cell" data-label={label}><strong className={award ? `award-target award-${award.tone} award-level-${award.level}` : ""}>£{manager.teamValue.toFixed(1)}m</strong>{change !== 0 && <span className={change > 0 ? "positive" : "negative"}>{signed(change)}m</span>}</div>;
}

function SeasonTransfersCell({ manager, label }: { manager: ManagerRow; label: string }) {
  return <div className="season-transfers-cell" data-label={label}><strong>{manager.seasonTransfers}</strong>{manager.seasonHitPoints > 0 && <span>(−{manager.seasonHitPoints})</span>}</div>;
}

function BenchPointsCell({ manager, label, award, available = true, autosubs = false }: { manager: ManagerRow; label: string; award?: Award; available?: boolean; autosubs?: boolean }) {
  if (!available) return <div className="bench-points-cell unavailable" data-label={label}><strong>—</strong></div>;
  const current = currentBenchPoints(manager, autosubs);
  const total = manager.benchPointsBeforeGw + current;
  return <div className="bench-points-cell" data-label={label}><strong className={award ? `award-target award-${award.tone} award-level-${award.level}` : ""}>{total}</strong><span>+{current}</span></div>;
}

function captainDisplay(manager: ManagerRow, autosubs: boolean) {
  const effective = provisionalAutosubSquad(manager.squad, autosubs).find((player) => player.captain);
  const multiplier = manager.chip === "TC" ? 3 : 2;
  return effective ? { name: effective.name, points: (effective.points + effective.bonus) * multiplier } : { name: manager.captain, points: manager.captainPoints };
}

function weightedProgress(manager: ManagerRow, autosubs: boolean) {
  const effectiveSquad = provisionalAutosubSquad(manager.squad, autosubs);
  const players = manager.chip === "BB" ? effectiveSquad : effectiveSquad.filter((player) => player.starter);
  return players.reduce((counts, player) => {
    const weight = player.captain ? (manager.chip === "TC" ? 3 : 2) : 1;
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
  if (current === previous || !previous) return <span className="movement neutral">—</span>;
  const improved = current < previous;
  return <span className={`movement ${improved ? "up" : "down"}`}>{improved ? <ArrowUp /> : <ArrowDown />}{Math.abs(previous - current)}</span>;
}

function compactRank(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value);
}

function BrandLogo() {
  return <div className="brand-logo" aria-label="Farmisarja">
    <span className="brand-logo-main">
      <img src={`${import.meta.env.BASE_URL}branding/fs-logo-v11.svg`} alt="" />
      <span className="brand-logo-name" data-text="FARMISARJA">FARMISARJA</span>
    </span>
  </div>;
}

const backgroundBallLayout = [
  [3, 9, 68], [17, 72, 124], [29, 31, 52], [42, 88, 148], [55, 12, 88], [67, 61, 61],
  [79, 35, 136], [93, 82, 94], [38, 55, 47], [88, 5, 112], [8, 94, 82], [73, 96, 56],
  [12, 43, 76], [24, 6, 49], [49, 73, 103], [62, 38, 58], [82, 69, 121], [97, 48, 72],
] as const;

function BackgroundPattern() {
  const rotations = useMemo(() => backgroundBallLayout.map(() => Math.round(Math.random() * 359)), []);
  return <div className="background-pattern" aria-hidden="true">{backgroundBallLayout.map(([left, top, size], index) =>
    <img key={index} src={`${import.meta.env.BASE_URL}branding/fs-logo-v9-7.svg`} alt="" style={{ left: `${left}%`, top: `${top}%`, width: size, transform: `translate(-50%, -50%) rotate(${rotations[index]}deg)` }} />,
  )}</div>;
}

function SortHeader({ label, sortKey, active, direction, onSort }: { label: string; sortKey: SortKey | null; active: SortKey; direction: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  if (!sortKey) return <span className="sort-header sort-header-static">{label}</span>;
  const isActive = active === sortKey;
  return <button className={`sort-header ${isActive ? "active" : ""}`} onClick={() => onSort(sortKey)}>{label}{isActive && <ChevronDown className={direction === "asc" ? "rotate" : ""} />}</button>;
}

function Shirt({ player }: { player: SquadPlayer }) {
  const kitSet = player.position === "GK" ? "optimized-gk" : "optimized";
  const source = `${import.meta.env.BASE_URL}kits/${kitSet}/${player.club.toLowerCase()}.webp?v=20260823-gk3`;
  return <div className="shirt"><img className="shirt-image" src={source} alt="" /></div>;
}

function PlayerCard({ player, best, language, tripleCaptain, scoreMultiplier, groupLabel, mobileGroupLabel, groupKind }: { player: SquadPlayer; best: boolean; language: Language; tripleCaptain: boolean; scoreMultiplier: number; groupLabel?: string; mobileGroupLabel?: string; groupKind?: "position" | "bench" }) {
  const t = translations(language);
  return <div className={`player player-${player.state} position-${player.position.toLowerCase()} ${player.starter ? "player-starter" : "player-bench"} ${best ? "player-best" : ""} ${groupLabel ? `group-start group-${groupKind}` : ""}`}>
    {groupLabel && <span className="player-group-label"><b className="desktop-squad-label">{groupLabel}</b><b className="mobile-squad-label">{mobileGroupLabel ?? groupLabel}</b></span>}
    <div className="player-visual">{player.captain && <span className={`armband captain ${tripleCaptain ? "triple" : ""}`}>C</span>}{player.viceCaptain && <span className={`armband ${tripleCaptain ? "triple" : ""}`}>V</span>}<Shirt player={player} /></div>
    <div className="player-name"><span>{player.name}</span></div>
    <div className="player-bottom"><span className={`player-fixture venue-${player.venue.toLowerCase()}`}><i className={`state-dot ${player.state}`} /><span className="desktop-fixture">vs. {player.opponent} {player.venue}</span><span className="mobile-opponent">{player.opponent}</span><b> · {player.position}</b></span><strong className="player-points"><span className="desktop-player-score">{(player.points + player.bonus) * scoreMultiplier}</span><span className="mobile-player-score">{(player.points + player.bonus) * scoreMultiplier}</span></strong></div>
  </div>;
}

function Squad({ manager, language, autosubs }: { manager: ManagerRow; language: Language; autosubs: boolean }) {
  const t = translations(language);
  const originalOrder = provisionalAutosubSquad(manager.squad, autosubs);
  const active = originalOrder.filter((player) => player.starter);
  const bench = originalOrder
    .filter((player) => !player.starter)
    .sort((left, right) => Number(right.position === "GK") - Number(left.position === "GK") || left.squadPosition - right.squadPosition);
  const scoringPlayers = manager.chip === "BB" ? originalOrder : active;
  const scoreMultiplier = (player: SquadPlayer) => player.captain ? (manager.chip === "TC" ? 3 : 2) : 1;
  // Only settled fixtures are comparable: an unplayed zero is not a low score, and a score from a
  // match still running is not finished with.
  const settled = (player: SquadPlayer) => player.state === "finished";
  const totals = scoringPlayers.filter(settled).map((player) => (player.points + player.bonus) * scoreMultiplier(player));
  const best = totals.length ? Math.max(...totals) : 0;
  const worst = totals.length ? Math.min(...totals) : 0;
  const hasSpread = totals.length > 1 && best > worst;
  const positionLabels = language === "fi"
    ? { GK: "MAALIVAHTI", DEF: "PUOLUSTUS", MID: "KESKIKENTTÄ", FWD: "HYÖKKÄYS" }
    : { GK: "GOALKEEPER", DEF: "DEFENCE", MID: "MIDFIELD", FWD: "FORWARDS" };
  const mobilePositionLabels = language === "fi"
    ? { GK: "MV", DEF: "PAKIT", MID: "KK", FWD: "HYÖK." }
    : { GK: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };
  const renderPlayer = (player: SquadPlayer, groupLabel?: string, mobileGroupLabel?: string, groupKind?: "position" | "bench") => {
    const liveScore = (player.points + player.bonus) * scoreMultiplier(player);
    return <PlayerCard key={player.id} player={player} best={hasSpread && settled(player) && (player.starter || manager.chip === "BB") && liveScore === best} language={language} tripleCaptain={manager.chip === "TC"} scoreMultiplier={scoreMultiplier(player)} groupLabel={groupLabel} mobileGroupLabel={mobileGroupLabel} groupKind={groupKind} />;
  };
  return <div className="squad-panel">
    <div className="squad-heading"><span><b className="mobile-squad-label">{t.squad}</b></span><div className="squad-legend"><span className="legend-finished">{t.finished}</span><span className="legend-live">{t.playing}</span><span className="legend-upcoming">{t.toPlay}</span>{hasSpread && <><span className="legend-best"><i />{t.best}</span></>}</div></div>
    <div className="squad-players">
      <div className="squad-grid starters">{active.map((player, index) => renderPlayer(player, index === 0 || active[index - 1].position !== player.position ? positionLabels[player.position] : undefined, index === 0 || active[index - 1].position !== player.position ? mobilePositionLabels[player.position] : undefined, "position"))}</div>
      <div className="squad-heading bench-heading"><span>{t.bench}</span></div>
      <div className={`squad-grid bench ${manager.chip === "BB" ? "bench-boost" : ""}`}><span className="bench-frame-label">{t.bench}{manager.chip === "BB" && <b>BB</b>}</span>{bench.map((player) => renderPlayer(player))}</div>
    </div>
  </div>;
}

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const demoMode = urlParams.has("demo");
  const screenshotMode = urlParams.has("screenshot");
  // ?card=round|total|awards|deadline renders a single share card at its delivered size and nothing else.
  const cardParam = urlParams.get("card");
  const cardKind: CardKind | null = cardParam === "round" || cardParam === "total" || cardParam === "awards" || cardParam === "deadline" ? cardParam : null;
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem("farmisarja-language") === "en" ? "en" : "fi");
  const [autosubs, setAutosubs] = useState(true);
  const [mobileDetails, setMobileDetails] = useState(true);
  const [period, setPeriod] = useState("total");
  const [expanded, setExpanded] = useState<number | null>(demoMode ? null : 101);
  const [sort, setSort] = useState<SortKey>("position");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [now, setNow] = useState(() => Date.now());
  const [data, setData] = useState<DashboardData>(demoData);
  const [liveReady, setLiveReady] = useState(demoMode);
  const [liveError, setLiveError] = useState<string | null>(null);
  // FPL answers 5xx for a while around the deadline; only surface an error once it keeps failing.
  const failureCount = useRef(0);
  const t = translations(language);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("farmisarja-language", language);
  }, [language]);

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    let refreshTimer: number | undefined;
    const fail = (message: string) => {
      failureCount.current += 1;
      // Keep the calm waiting view for short FPL outages; escalate only after roughly two minutes.
      if (failureCount.current < 8) return;
      setLiveReady(false);
      setLiveError(message);
    };
    const refresh = async () => {
      try {
        const liveData = await loadLiveDashboard();
        if (!active) return;
        if (liveData) {
          failureCount.current = 0;
          setData(liveData);
          setLiveReady(true);
          setLiveError(null);
          refreshTimer = window.setTimeout(refresh, liveData.dataPending ? 15_000 : 60_000);
        } else {
          fail("FPL API returned no dashboard data");
          refreshTimer = window.setTimeout(refresh, 15_000);
        }
      } catch (error) {
        console.warn("Live FPL data request failed.", error);
        if (active) {
          fail(error instanceof Error ? error.message : "Unknown FPL API error");
          refreshTimer = window.setTimeout(refresh, 15_000);
        }
      }
    };
    void refresh();
    return () => { active = false; if (refreshTimer) window.clearTimeout(refreshTimer); };
  }, [demoMode]);

  const managers = useMemo(() => [...data.managers].sort((a, b) => {
    // A gameweek in progress has no settled form behind it yet, so the series can be empty.
    const aValue = sort === "form" ? a.form.reduce((sum, value) => sum + value, 0) / Math.max(1, a.form.length) : a[sort];
    const bValue = sort === "form" ? b.form.reduce((sum, value) => sum + value, 0) / Math.max(1, b.form.length) : b[sort];
    return (aValue - bValue) * (direction === "asc" ? 1 : -1);
  }), [data.managers, direction, sort]);

  const awardStats = useMemo(() => {
    const captainScores = data.managers.map((manager) => captainDisplay(manager, autosubs).points);
    const gwScores = data.managers.map((manager) => manager.gameweekPoints + manager.provisionalBonus - manager.hit);
    const transferScores = data.managers.map(transferNet).filter(Number.isFinite);
    const benchScores = data.managers.map((manager) => currentBenchPoints(manager, autosubs));
    const formAverages = data.managers.map((manager) => manager.form.reduce((sum, value) => sum + value, 0) / Math.max(1, manager.form.length));
    const values = data.managers.map((manager) => manager.teamValue).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    const medianValue = values.length % 2 ? values[middle] : ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
    return {
      bestCaptain: Math.max(...captainScores), lowestCaptain: Math.min(...captainScores),
      bestGw: Math.max(...gwScores), lowestGw: Math.min(...gwScores),
      bestTransfer: transferScores.length ? Math.max(...transferScores) : Number.NaN, lowestTransfer: transferScores.length ? Math.min(...transferScores) : Number.NaN,
      worstBench: Math.max(...benchScores), lowestBench: Math.min(...benchScores),
      bestForm: Math.max(...formAverages), worstForm: Math.min(...formAverages),
      bestValue: Math.max(...values), lowestValue: Math.min(...values), medianValue,
    };
  }, [autosubs, data.managers]);

  const gwMedalRanks = useMemo(() => {
    const scores = data.managers.map((manager) => manager.gameweekPoints + manager.provisionalBonus - manager.hit);
    return new Map(data.managers.flatMap((manager) => {
      const score = manager.gameweekPoints + manager.provisionalBonus - manager.hit;
      const rank = 1 + scores.filter((otherScore) => otherScore > score).length;
      return rank <= 3 ? [[manager.id, rank] as const] : [];
    }));
  }, [data.managers]);

  const awardFor = (kind: "captain" | "gw" | "transfer" | "bench" | "formBest" | "formWorst" | "value", score: number): Award => {
    if (kind === "captain") return { level: score >= 20 ? 3 : score >= 14 ? 2 : score >= 10 ? 1 : 0, tone: "purple" };
    if (kind === "gw") return { level: score >= 90 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0, tone: "purple" };
    if (kind === "transfer") return { level: score >= 15 ? 3 : score >= 8 ? 2 : score >= 3 ? 1 : 0, tone: "green" };
    if (kind === "bench") return { level: score >= 15 ? 3 : score >= 10 ? 2 : score >= 5 ? 1 : 0, tone: "red" };
    if (kind === "formBest") return { level: score >= 70 ? 3 : score >= 60 ? 2 : score >= 50 ? 1 : 0, tone: "green" };
    if (kind === "formWorst") return { level: score < 30 ? 3 : score < 40 ? 2 : score < 50 ? 1 : 0, tone: "blue" };
    const lead = score - awardStats.medianValue;
    return { level: lead >= 3 ? 3 : lead >= 1.5 ? 2 : lead >= .5 ? 1 : 0, tone: "purple" };
  };

  const handleSort = (key: SortKey) => {
    if (sort === key) setDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection(key === "overallRank" || key === "position" ? "asc" : "desc"); }
  };

  const monthFormatter = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { month: "long" });
  // Finnish month names are lower case, but they read better capitalised beside the other menu labels.
  const monthLabel = (month: string) => { const name = monthFormatter.format(new Date(`${month}-01T12:00:00Z`)); return name.charAt(0).toUpperCase() + name.slice(1); };
  const headers: Array<[string, SortKey | null]> = [[t.position, "position"], [t.manager, null], [t.captain, "captainPoints"], [t.transfers, null], [t.seasonTransfers, "seasonTransfers"], [t.chips, null], [t.teamValue, "teamValue"], [t.benchPoints, "benchPointsBeforeGw"], [t.form, "form"], [t.gwPoints, "gameweekPoints"], [t.progress, "upcoming"], [t.total, "totalPoints"]];
  const gameweekFixtures = data.fixtures ?? [];
  const liveFixtures = gameweekFixtures.filter((fixture) => fixture.status === "live");
  const playedFixtures = gameweekFixtures.filter((fixture) => fixture.status === "provisional" || fixture.status === "final");
  const nextFixture = gameweekFixtures.find((fixture) => fixture.status === "upcoming");
  // Fixture data tells whether the gameweek is running even before any picks are published.
  const gameweekIsLive = gameweekFixtures.length ? liveFixtures.length > 0 : data.managers.some((manager) => manager.live > 0);
  const deadlineMs = Math.max(0, new Date(data.deadline).getTime() - now);
  const deadlineLabel = countdownLabel(deadlineMs, language);
  const compactDeadlineLabel = deadlineLabel;
  const nextKickoffLabel = nextFixture ? countdownLabel(Math.max(0, new Date(nextFixture.kickoff).getTime() - now), language) : "";
  // Awards are decided once every match has been played, which is before the points turn final.
  const gameweekComplete = demoMode || (gameweekFixtures.length > 0 && gameweekFixtures.every((fixture) => fixture.status === "provisional" || fixture.status === "final"));
  const updatedLabel = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { dateStyle: "short", timeStyle: "medium" }).format(new Date(data.updatedAt));

  // The capture waits for .sc-card, so an unready card renders nothing rather than a half card.
  if (cardKind) return liveReady && !liveError ? <ShareCard data={data} kind={cardKind} /> : <div className="sc-stage" />;

  return <div className="app-shell" data-mobile-details={mobileDetails ? "on" : "off"} data-screenshot={screenshotMode ? "true" : "false"}>
    <BackgroundPattern />
    <header className="topbar">
      <BrandLogo />
      <div className="top-actions">
        {liveReady && <div className={`gameweek-status ${gameweekFixtures.length > 0 ? "has-fixture-menu" : ""}`}>
          <b>GW&nbsp;{data.gameweek}</b>
          {deadlineMs > 0
            ? <span className="deadline"><Clock3 /><i className="deadline-full">{deadlineLabel}</i><i className="deadline-compact">{compactDeadlineLabel}</i></span>
            : gameweekIsLive
              ? <span className="gameweek-live"><i>{t.live}</i>{liveFixtures.length > 0 && <b>{liveFixtures.length}</b>}</span>
              : nextFixture
                ? <span className="deadline next-kickoff"><Clock3 /><small>{t.nextMatch}</small><i>{nextKickoffLabel}</i></span>
                : <span className={`gameweek-state ${data.pointsFinalized ? "is-final" : "is-provisional"}`}>{data.pointsFinalized ? "FINAL" : "PROVISIONAL"}</span>}
          {gameweekFixtures.length > 0 && <FixtureMenu fixtures={gameweekFixtures} played={playedFixtures.length} language={language} />}
        </div>}
        <button className="language-switch" type="button" onClick={() => setLanguage((value) => value === "fi" ? "en" : "fi")} aria-label={language === "fi" ? "Vaihda kieli englanniksi" : "Switch language to Finnish"}>
          <Globe className="language-globe" aria-hidden="true" />
          <span className={`language-option ${language === "fi" ? "active" : ""}`}>FI</span>
          <span className={`language-option ${language === "en" ? "active" : ""}`}>EN</span>
        </button>
      </div>
    </header>

    <main>{liveError ? <section className="data-pending data-error" role="alert">
      <strong>FPL DATA ERROR</strong>
      <span>{liveError}</span>
      <small>{language === "fi" ? "Uutta yritystä tehdään automaattisesti. Vanhentunutta tai demodataa ei näytetä." : "Retrying automatically. Stale or demo data is not shown."}</small>
    </section> : !liveReady ? <div className="initial-loading" aria-label={language === "fi" ? "Ladataan FPL-dataa" : "Loading FPL data"} /> : <>
      <div className="toolbar">
        <select className="period-select" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label={language === "fi" ? "Valitse ajanjakso" : "Select period"}>
          <option value="total">Total</option>
          {data.activeMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}
        </select>
        <div className="toolbar-toggles"><label className="details-toggle"><span>{t.details}</span><button role="switch" aria-checked={mobileDetails} onClick={() => setMobileDetails((value) => !value)} className={mobileDetails ? "enabled" : ""}><i /></button></label><label className="autosub-toggle"><span>{t.autosubs}</span><button role="switch" aria-checked={autosubs} onClick={() => setAutosubs((value) => !value)} className={autosubs ? "enabled" : ""}><i /></button></label></div>
      </div>

      {data.dataPending ? <section className="data-pending" role="status">
        <Clock3 />
        <strong>{language === "fi" ? "Peliviikon joukkueita päivitetään" : "Gameweek teams are being updated"}</strong>
        <span>{language === "fi" ? "Taulukko avautuu automaattisesti heti, kun FPL-data on saatavilla." : "The table will open automatically as soon as the FPL data is available."}</span>
      </section> : <section className="league-table">
        <div className="table-head">{headers.map(([label, key], index) => <SortHeader key={`${label}-${index}`} label={label} sortKey={key} active={sort} direction={direction} onSort={handleSort} />)}</div>
        <div className="rows">
          <div className="mobile-simple-head"><b>{t.position}</b><b>{t.manager}</b><b>GW</b><b>{t.total}</b></div>
          {managers.map((manager) => {
            const open = expanded === manager.id;
            const displayedGwPoints = manager.gameweekPoints + manager.provisionalBonus - manager.hit;
            const captain = captainDisplay(manager, autosubs);
            const rankClass = manager.overallRank < manager.previousOverallRank ? "rank-up" : manager.overallRank > manager.previousOverallRank ? "rank-down" : "rank-neutral";
            const progress = weightedProgress(manager, autosubs);
            const transferScore = transferNet(manager);
            const benchScore = currentBenchPoints(manager, autosubs);
            const formAverage = manager.form.reduce((sum, value) => sum + value, 0) / Math.max(1, manager.form.length);
            const awardsAvailable = !data.rosterOnly && gameweekComplete;
            const hasSeasonPoints = manager.totalPoints !== 0 || manager.gameweekPoints !== 0;
            const captainAward = awardsAvailable && awardStats.bestCaptain > awardStats.lowestCaptain && captain.points === awardStats.bestCaptain ? awardFor("captain", captain.points) : undefined;
            const transferAward = awardsAvailable && manager.transfers.length > 0 && Number.isFinite(transferScore) && awardStats.bestTransfer > awardStats.lowestTransfer && transferScore === awardStats.bestTransfer ? awardFor("transfer", transferScore) : undefined;
            const benchAward = awardsAvailable && awardStats.worstBench > awardStats.lowestBench && benchScore === awardStats.worstBench ? awardFor("bench", benchScore) : undefined;
            const valueAward = awardsAvailable && awardStats.bestValue > awardStats.lowestValue && manager.teamValue === awardStats.bestValue ? awardFor("value", manager.teamValue) : undefined;
            const formAward = awardsAvailable && awardStats.bestForm !== awardStats.worstForm && formAverage === awardStats.bestForm
              ? awardFor("formBest", formAverage)
              : awardsAvailable && awardStats.bestForm !== awardStats.worstForm && formAverage === awardStats.worstForm ? awardFor("formWorst", formAverage) : undefined;
            const gwAward = awardsAvailable && awardStats.bestGw > awardStats.lowestGw && displayedGwPoints === awardStats.bestGw ? awardFor("gw", displayedGwPoints) : undefined;
            const gwMedalRank = awardsAvailable ? gwMedalRanks.get(manager.id) : undefined;
            return <div className={`manager-block ${open ? "open" : ""} ${data.rosterOnly ? "roster-only" : ""}`} key={manager.id}>
              <div className="manager-row" onClick={() => setExpanded(open ? null : manager.id)}>
                <div className="position-cell"><button aria-label="Expand squad">{open ? <ChevronDown /> : <ChevronRight />}</button><strong>{manager.position}</strong>{!data.rosterOnly && <Movement current={manager.position} previous={manager.previousPosition} />}{!data.rosterOnly && manager.overallRank > 0 && hasSeasonPoints && <small className={`position-or ${rankClass}`} title={`OR ${number.format(manager.overallRank)}`}>OR {compactRank(manager.overallRank)}</small>}</div>
                <div className="manager-cell"><a href={`https://fantasy.premierleague.com/entry/${manager.id}/event/${data.gameweek}`} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer">{manager.teamName}</a><span>{manager.managerName}</span>{!data.rosterOnly && <span className="mobile-captain"><b className={manager.chip === "TC" ? "triple" : ""}>C</b><strong>{captain.name}</strong><em>{captain.points} pts</em></span>}{!data.rosterOnly && manager.overallRank > 0 && hasSeasonPoints && <small className={rankClass} title={t.rankEstimate}>OR {number.format(manager.overallRank)}</small>}</div>
                <div className={`captain-cell ${captainAward ? "award-cell" : ""}`} data-label={t.captain}><strong>{captain.name}</strong><span className={captainAward ? `award-target award-${captainAward.tone} award-level-${captainAward.level}` : ""}>{captain.points} pts</span></div>
                <TransferCell manager={manager} language={language} award={transferAward} gameweek={data.gameweek} />
                <SeasonTransfersCell manager={manager} label={t.seasonTransfers} />
                <ChipsCell manager={manager} label={t.chips} />
                <TeamValueCell manager={manager} label={t.teamValue} award={valueAward} available={!data.rosterOnly} />
                <BenchPointsCell manager={manager} label={t.benchPoints} award={benchAward} available={!data.rosterOnly} autosubs={autosubs} />
                <div className={`form-cell ${formAward ? "award-cell" : ""}`} data-label={t.form}><span className="form-values">{manager.form.map((value, index) => <b key={index} data-gw={manager.formGameweeks[index]} className={`${manager.formRankMovement[index] > 0 ? "rank-up" : manager.formRankMovement[index] < 0 ? "rank-down" : "rank-neutral"} ${index === manager.form.length - 1 ? "current" : ""}`}>{value}</b>)}</span><span className="form-meta">{manager.form.length > 0 && <strong className="form-average">{language === "fi" ? "KA" : "AVG"} {formAverage.toFixed(1)}</strong>}</span></div>
                <div className={`points-cell ${gwAward ? "award-cell" : ""}`} data-label={t.gwPoints}><span className={`gw-score ${manager.chip ? `has-chip ${chipClass(manager.chip)}` : ""} ${gwMedalRank ? `has-medal medal-rank-${gwMedalRank}` : ""}`}>{gwMedalRank && <Medal aria-label={language === "fi" ? `Kierroksen ${gwMedalRank}. paras` : `Gameweek rank ${gwMedalRank}`} />}<strong>{displayedGwPoints}</strong>{manager.chip && <b>{manager.chip}</b>}</span><span className={`points-formula ${manager.hit > 0 ? "" : "empty"}`}>{manager.hit > 0 ? <>({manager.gameweekPoints + manager.provisionalBonus} <b>− {manager.hit}</b> = {displayedGwPoints})</> : " "}</span></div>
                <div className="progress-cell" data-label={t.progress}>{!data.rosterOnly && (progress.finished === progress.total && progress.live === 0 ? <strong className={data.pointsFinalized ? "is-final" : "is-provisional"}>{data.pointsFinalized ? "FINAL" : "PROVISIONAL"}</strong> : <><span className="progress-summary">({progress.finished}/{progress.total})</span>{progress.live > 0 && <small><b>{progress.live}</b> LIVE</small>}</>)}</div>
                <div className="total-cell" data-label={t.total}><strong>{number.format(manager.totalPoints + manager.provisionalBonus - manager.hit)}</strong></div>
              </div>
              {open && (data.rosterOnly
                ? <div className="squad-panel squad-unavailable">{language === "fi" ? "Pelaajat tulevat näkyviin, kun peliviikon deadline on sulkeutunut." : "Players will appear after the gameweek deadline has passed."}</div>
                : <Squad manager={manager} language={language} autosubs={autosubs} />)}
            </div>;
          })}
        </div>
      </section>}
    </>}</main>
    <footer>
      <span>Official FPL data</span>
      {liveReady && <span>{t.updated}: {updatedLabel}</span>}
      <span className="footer-separator" aria-hidden="true">•</span>
      <a className="footer-repository" href="https://github.com/jronimus/farmisarja-live" target="_blank" rel="noreferrer">
        <GitHubLogo />
        <span>farmisarja-live</span>
      </a>
    </footer>
  </div>;
}
