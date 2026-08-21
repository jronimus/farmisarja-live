import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock3, Medal } from "lucide-react";
import { demoData } from "./demoData";
import { loadLiveDashboard } from "./services/liveDashboard";
import { provisionalAutosubSquad } from "./services/fplRules";
import { translations } from "./i18n";
import type { DashboardData, Language, ManagerRow, SquadPlayer } from "./types";

type SortKey = "position" | "gameweekPoints" | "totalPoints" | "overallRank" | "captainPoints" | "upcoming" | "form" | "teamValue" | "seasonTransfers" | "benchPointsBeforeGw";

const number = new Intl.NumberFormat("fi-FI");

const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
const chipClass = (chip: string) => `chip-${chip.toLowerCase()}`;

function GitHubLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 .7A11.3 11.3 0 0 0 8.4 22.8c.6.1.8-.3.8-.6v-2.4c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.6 0-1.2.4-2.2 1.2-3-.1-.3-.5-1.5.1-3 0 0 1-.3 3.1 1.1a10.8 10.8 0 0 1 5.7 0C16.9 5 18 5.3 18 5.3c.6 1.5.2 2.7.1 3 .7.8 1.2 1.8 1.2 3 0 4.3-2.7 5.3-5.3 5.6.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" />
  </svg>;
}

type Award = { label?: string; level: 0 | 1 | 2 | 3; tone: "green" | "gold" | "red" | "blue" | "purple" };

function AwardTag({ award }: { award?: Award }) {
  if (!award) return null;
  return <span className={`award-tag award-${award.tone} award-level-${award.level}`}><i aria-hidden="true" />{award.label && <b>{award.label}</b>}</span>;
}

const transferNet = (manager: ManagerRow) => manager.chip === "WC" || manager.chip === "FH"
  ? manager.wildcardPreviousTeamPoints === undefined ? Number.NaN : manager.gameweekPoints + manager.provisionalBonus - manager.wildcardPreviousTeamPoints
  : manager.transfers.reduce((sum, transfer) => sum + transfer.inPoints - transfer.outPoints, 0) - manager.hit;

const currentBenchPoints = (manager: ManagerRow, autosubs = false) => manager.chip === "BB" ? 0 : provisionalAutosubSquad(manager.squad, autosubs).filter((player) => !player.starter).reduce((sum, player) => sum + player.points + player.bonus, 0);

function TransferCell({ manager, language, award }: { manager: ManagerRow; language: Language; award?: Award }) {
  const t = translations(language);
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
      {manager.freeTransfersAfter !== undefined && <em>{t.nextGw}: {manager.freeTransfersAfter} FT</em>}
      <AwardTag award={award} />
    </div>;
  }
  return <div className="transfer-cell" data-label={t.transfers}>
    {manager.transfers.map((transfer, index) => {
      const difference = transfer.inPoints - transfer.outPoints;
      return <small key={index}><span className="desktop-transfer-row">{transfer.out} <b className="transfer-player-points">{transfer.outPoints}</b> <i>→</i> {transfer.in} <b className="transfer-player-points">{transfer.inPoints}</b></span><span className="mobile-transfer-row">{transfer.out} <b className="transfer-player-points">{transfer.outPoints}</b> <i>→</i> {transfer.in} <b className="transfer-player-points">{transfer.inPoints}</b></span><i className="transfer-equals">=</i><b className={difference >= 0 ? "positive" : "negative"}>{signed(difference)}</b></small>;
    })}
    {!manager.transfers.length && <small className="muted">{t.noTransfers}</small>}
    <div className="desktop-transfer-footer">{netSummary()}{manager.freeTransfersAfter !== undefined && <span>{t.nextGw}: {manager.freeTransfersAfter} FT</span>}</div>
    <div className="mobile-transfer-footer">{netSummary()}{manager.freeTransfersAfter !== undefined && <span>{t.nextGw}: {manager.freeTransfersAfter} FT</span>}</div>
    <AwardTag award={award} />
  </div>;
}

function ChipsCell({ manager, label }: { manager: ManagerRow; label: string }) {
  return <div className="chips-cell" data-label={label}>{manager.availableChips.map((chip) => <span className={`${chipClass(chip)} ${manager.chip === chip ? "active" : manager.usedChips.includes(chip) ? "used" : ""}`} key={chip}>{chip}</span>)}</div>;
}

function TeamValueCell({ manager, label, award, available = true }: { manager: ManagerRow; label: string; award?: Award; available?: boolean }) {
  if (!available) return <div className="team-value-cell unavailable" data-label={label}><strong>—</strong></div>;
  const change = Math.round((manager.teamValue - manager.previousTeamValue) * 10) / 10;
  return <div className="team-value-cell" data-label={label}><strong className={award ? `award-target award-${award.tone} award-level-${award.level}` : ""}>£{manager.teamValue.toFixed(1)}m</strong>{change !== 0 && <span className={change > 0 ? "positive" : "negative"}>{signed(change)}m</span>}<AwardTag award={award} /></div>;
}

function SeasonTransfersCell({ manager, label }: { manager: ManagerRow; label: string }) {
  return <div className="season-transfers-cell" data-label={label}><strong>{manager.seasonTransfers}</strong>{manager.seasonHitPoints > 0 && <span>(−{manager.seasonHitPoints})</span>}</div>;
}

function BenchPointsCell({ manager, label, award, available = true, autosubs = false }: { manager: ManagerRow; label: string; award?: Award; available?: boolean; autosubs?: boolean }) {
  if (!available) return <div className="bench-points-cell unavailable" data-label={label}><strong>—</strong></div>;
  const current = currentBenchPoints(manager, autosubs);
  const total = manager.benchPointsBeforeGw + current;
  return <div className="bench-points-cell" data-label={label}><strong className={award ? `award-target award-${award.tone} award-level-${award.level}` : ""}>{total}</strong><span>+{current}</span><AwardTag award={award} /></div>;
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
  if (current === previous) return <span className="movement neutral">—</span>;
  const improved = current < previous;
  return <span className={`movement ${improved ? "up" : "down"}`}>{improved ? <ArrowUp /> : <ArrowDown />}{Math.abs(previous - current)}</span>;
}

function compactRank(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value);
}

function BrandLogo() {
  return <div className="brand-logo" aria-label="Farmisarja">
    <span className="brand-logo-main">
      <img src={`${import.meta.env.BASE_URL}branding/fs-logo-v9-5.svg`} alt="" />
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
    <img key={index} src={`${import.meta.env.BASE_URL}branding/fs-logo-v8-5.svg`} alt="" style={{ left: `${left}%`, top: `${top}%`, width: size, transform: `translate(-50%, -50%) rotate(${rotations[index]}deg)` }} />,
  )}</div>;
}

function SortHeader({ label, sortKey, active, direction, onSort }: { label: string; sortKey: SortKey | null; active: SortKey; direction: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  if (!sortKey) return <span className="sort-header sort-header-static">{label}</span>;
  const isActive = active === sortKey;
  return <button className={`sort-header ${isActive ? "active" : ""}`} onClick={() => onSort(sortKey)}>{label}{isActive && <ChevronDown className={direction === "asc" ? "rotate" : ""} />}</button>;
}

function Shirt({ player }: { player: SquadPlayer }) {
  const source = `${import.meta.env.BASE_URL}kits/optimized/${player.club.toLowerCase()}.webp?v=20260820-3`;
  return <div className="shirt"><img className="shirt-image" src={source} alt="" /></div>;
}

function PlayerCard({ player, best, worst, language, tripleCaptain, scoreMultiplier, groupLabel, mobileGroupLabel, groupKind }: { player: SquadPlayer; best: boolean; worst: boolean; language: Language; tripleCaptain: boolean; scoreMultiplier: number; groupLabel?: string; mobileGroupLabel?: string; groupKind?: "position" | "bench" }) {
  const t = translations(language);
  return <div className={`player player-${player.state} position-${player.position.toLowerCase()} ${player.starter ? "player-starter" : "player-bench"} ${best ? "player-best" : ""} ${worst ? "player-worst" : ""} ${groupLabel ? `group-start group-${groupKind}` : ""}`}>
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
  const bench = originalOrder.filter((player) => !player.starter);
  const scoringPlayers = manager.chip === "BB" ? originalOrder : active;
  const scoreMultiplier = (player: SquadPlayer) => player.captain ? (manager.chip === "TC" ? 3 : 2) : 1;
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
    return <PlayerCard key={player.id} player={player} best={(player.starter || manager.chip === "BB") && liveScore === best} worst={(player.starter || manager.chip === "BB") && liveScore === worst} language={language} tripleCaptain={manager.chip === "TC"} scoreMultiplier={scoreMultiplier(player)} groupLabel={groupLabel} mobileGroupLabel={mobileGroupLabel} groupKind={groupKind} />;
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
  const urlParams = new URLSearchParams(window.location.search);
  const demoMode = urlParams.has("demo");
  const screenshotMode = urlParams.has("screenshot");
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
    const refresh = async () => {
      try {
        const liveData = await loadLiveDashboard();
        if (!active) return;
        if (liveData) {
          setData(liveData);
          setLiveReady(true);
          setLiveError(null);
        } else {
          setLiveReady(false);
          setLiveError("FPL API returned no dashboard data");
        }
        refreshTimer = window.setTimeout(refresh, liveData?.dataPending ? 15_000 : 60_000);
      } catch (error) {
        console.warn("Live FPL data request failed.", error);
        if (active) {
          setLiveReady(false);
          setLiveError(error instanceof Error ? error.message : "Unknown FPL API error");
          refreshTimer = window.setTimeout(refresh, 15_000);
        }
      }
    };
    void refresh();
    return () => { active = false; if (refreshTimer) window.clearTimeout(refreshTimer); };
  }, [demoMode]);

  const managers = useMemo(() => [...data.managers].sort((a, b) => {
    const aValue = sort === "form" ? a.form.reduce((sum, value) => sum + value, 0) / a.form.length : a[sort];
    const bValue = sort === "form" ? b.form.reduce((sum, value) => sum + value, 0) / b.form.length : b[sort];
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
      bestCaptain: Math.max(...captainScores), bestGw: Math.max(...gwScores), bestTransfer: transferScores.length ? Math.max(...transferScores) : Number.NaN,
      worstBench: Math.max(...benchScores), bestForm: Math.max(...formAverages), worstForm: Math.min(...formAverages),
      bestValue: Math.max(...values), medianValue,
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
    const fi = language === "fi";
    if (kind === "captain") return score >= 20 ? { label: fi ? "KAPTEENIMESTARI" : "CAPTAIN FANTASTIC", level: 3, tone: "purple" } : score >= 14 ? { label: fi ? "NAPPIOSUMA" : "NAILED IT", level: 2, tone: "purple" } : score >= 10 ? { label: fi ? "HYVÄ VALINTA" : "SOLID PICK", level: 1, tone: "purple" } : { level: 0, tone: "purple" };
    if (kind === "gw") return score >= 90 ? { label: fi ? "MELAPISTEET" : "MONSTER GW", level: 3, tone: "purple" } : score >= 70 ? { label: fi ? "HUH HUH!" : "GW KING", level: 2, tone: "purple" } : score >= 50 ? { label: fi ? "ON KOVA!" : "STRONG GW", level: 1, tone: "purple" } : { level: 0, tone: "purple" };
    if (kind === "transfer") return score >= 15 ? { label: fi ? "SIIRTOVELHO" : "TRANSFER WIZARD", level: 3, tone: "green" } : score >= 8 ? { label: fi ? "SIIRTOÄSSÄ" : "TRANSFER ACE", level: 2, tone: "green" } : score >= 3 ? { label: fi ? "HYVÄÄ BISNESTÄ" : "GOOD BUSINESS", level: 1, tone: "green" } : { level: 0, tone: "green" };
    if (kind === "bench") return score >= 15 ? { label: fi ? "EI SAATANA" : "BENCH DISASTER", level: 3, tone: "red" } : score >= 10 ? { label: fi ? "AUTS" : "BENCH PAIN", level: 2, tone: "red" } : score >= 5 ? { label: fi ? "AIKA PAHA" : "THAT HURTS", level: 1, tone: "red" } : { level: 0, tone: "red" };
    if (kind === "formBest") return score >= 70 ? { label: fi ? "PITELEMÄTÖN" : "UNSTOPPABLE", level: 3, tone: "green" } : score >= 60 ? { label: fi ? "LIEKEISSÄ" : "ON FIRE", level: 2, tone: "green" } : score >= 50 ? { label: fi ? "NOUSUSSA" : "RISING", level: 1, tone: "green" } : { level: 0, tone: "green" };
    if (kind === "formWorst") return score < 30 ? { label: fi ? "SYÖKSYKIERRE" : "FREEFALL", level: 3, tone: "blue" } : score < 40 ? { label: fi ? "JÄÄSSÄ" : "ICE COLD", level: 2, tone: "blue" } : score < 50 ? { label: fi ? "TAHMEAA" : "SLUMPING", level: 1, tone: "blue" } : { level: 0, tone: "blue" };
    const lead = score - awardStats.medianValue;
    return lead >= 3 ? { label: fi ? "ÖLJYPOHATTA" : "OIL TYCOON", level: 3, tone: "purple" } : lead >= 1.5 ? { label: fi ? "RAHAMIES" : "MONEYBAGS", level: 2, tone: "purple" } : lead >= .5 ? { label: fi ? "BISNESMIES" : "THE TRADER", level: 1, tone: "purple" } : { level: 0, tone: "purple" };
  };

  const handleSort = (key: SortKey) => {
    if (sort === key) setDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection(key === "overallRank" || key === "position" ? "asc" : "desc"); }
  };

  const monthFormatter = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { month: "long" });
  const headers: Array<[string, SortKey | null]> = [[t.position, "position"], [t.manager, null], [t.captain, "captainPoints"], [t.transfers, null], [t.seasonTransfers, "seasonTransfers"], [t.chips, null], [t.teamValue, "teamValue"], [t.benchPoints, "benchPointsBeforeGw"], [t.form, "form"], [t.gwPoints, "gameweekPoints"], [t.progress, "upcoming"], [t.total, "totalPoints"]];
  const gameweekIsLive = data.managers.some((manager) => manager.live > 0);
  const deadlineMs = Math.max(0, new Date(data.deadline).getTime() - now);
  const fullDaysToDeadline = Math.floor(deadlineMs / 86_400_000);
  const remainingHoursToDeadline = Math.floor((deadlineMs % 86_400_000) / 3_600_000);
  const deadlineLabel = deadlineMs >= 86_400_000
    ? `${fullDaysToDeadline} ${language === "fi" ? "pv" : "d"} ${remainingHoursToDeadline} h`
    : `${String(Math.floor(deadlineMs / 3_600_000)).padStart(2, "0")}:${String(Math.floor(deadlineMs % 3_600_000 / 60_000)).padStart(2, "0")}:${String(Math.floor(deadlineMs % 60_000 / 1000)).padStart(2, "0")}`;
  const compactDeadlineLabel = deadlineLabel;
  const updatedLabel = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { dateStyle: "short", timeStyle: "medium" }).format(new Date(data.updatedAt));

  return <div className="app-shell" data-mobile-details={mobileDetails ? "on" : "off"} data-screenshot={screenshotMode ? "true" : "false"}>
    <BackgroundPattern />
    <header className="topbar">
      <BrandLogo />
      <div className="top-actions">
        {liveReady && <div className="gameweek-status"><b>GW&nbsp;{data.gameweek}</b>{gameweekIsLive ? <span className="gameweek-live"><i>LIVE</i></span> : <span className="deadline"><Clock3 /><i className="deadline-full">{deadlineLabel}</i><i className="deadline-compact">{compactDeadlineLabel}</i></span>}</div>}
        <button className="language-switch" type="button" onClick={() => setLanguage((value) => value === "fi" ? "en" : "fi")} aria-label={language === "fi" ? "Vaihda kieli englanniksi" : "Switch language to Finnish"}>
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
          {data.completedMonths.map((month) => <option value={month} key={month}>{monthFormatter.format(new Date(`${month}-01T12:00:00Z`))}</option>)}
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
            const awardsAvailable = !data.rosterOnly;
            const captainAward = awardsAvailable && captain.points === awardStats.bestCaptain ? awardFor("captain", captain.points) : undefined;
            const transferAward = awardsAvailable && manager.transfers.length > 0 && Number.isFinite(transferScore) && transferScore === awardStats.bestTransfer ? awardFor("transfer", transferScore) : undefined;
            const benchAward = awardsAvailable && benchScore === awardStats.worstBench ? awardFor("bench", benchScore) : undefined;
            const valueAward = awardsAvailable && manager.teamValue === awardStats.bestValue ? awardFor("value", manager.teamValue) : undefined;
            const formAward = awardsAvailable && awardStats.bestForm !== awardStats.worstForm && formAverage === awardStats.bestForm
              ? awardFor("formBest", formAverage)
              : awardsAvailable && awardStats.bestForm !== awardStats.worstForm && formAverage === awardStats.worstForm ? awardFor("formWorst", formAverage) : undefined;
            const gwAward = awardsAvailable && displayedGwPoints === awardStats.bestGw ? awardFor("gw", displayedGwPoints) : undefined;
            const gwMedalRank = awardsAvailable ? gwMedalRanks.get(manager.id) : undefined;
            return <div className={`manager-block ${open ? "open" : ""} ${data.rosterOnly ? "roster-only" : ""}`} key={manager.id}>
              <div className="manager-row" onClick={() => setExpanded(open ? null : manager.id)}>
                <div className="position-cell"><button aria-label="Expand squad">{open ? <ChevronDown /> : <ChevronRight />}</button><strong>{manager.position}</strong>{!data.rosterOnly && <Movement current={manager.position} previous={manager.previousPosition} />}{!data.rosterOnly && <small className={`position-or ${rankClass}`} title={`OR ${number.format(manager.overallRank)}`}>OR {compactRank(manager.overallRank)}</small>}</div>
                <div className="manager-cell"><a href={`https://fantasy.premierleague.com/entry/${manager.id}/event/${data.gameweek}`} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer">{manager.teamName}</a><span>{manager.managerName}</span>{!data.rosterOnly && <span className="mobile-captain"><b className={manager.chip === "TC" ? "triple" : ""}>C</b><strong>{captain.name}</strong><em>{captain.points} pts</em></span>}{!data.rosterOnly && <small className={rankClass} title={t.rankEstimate}>OR {number.format(manager.overallRank)}</small>}</div>
                <div className={`captain-cell ${captainAward ? "award-cell" : ""}`} data-label={t.captain}><strong>{captain.name}</strong><span className={captainAward ? `award-target award-${captainAward.tone} award-level-${captainAward.level}` : ""}>{captain.points} pts</span><AwardTag award={captainAward} /></div>
                <TransferCell manager={manager} language={language} award={transferAward} />
                <SeasonTransfersCell manager={manager} label={t.seasonTransfers} />
                <ChipsCell manager={manager} label={t.chips} />
                <TeamValueCell manager={manager} label={t.teamValue} award={valueAward} available={!data.rosterOnly} />
                <BenchPointsCell manager={manager} label={t.benchPoints} award={benchAward} available={!data.rosterOnly} autosubs={autosubs} />
                <div className={`form-cell ${formAward ? "award-cell" : ""}`} data-label={t.form}><span className="form-values">{manager.form.map((value, index) => <b key={index} className={`${manager.formRankMovement[index] > 0 ? "rank-up" : manager.formRankMovement[index] < 0 ? "rank-down" : "rank-neutral"} ${index === manager.form.length - 1 ? "current" : ""}`}>{value}</b>)}</span><span className="form-meta"><strong className="form-average">{language === "fi" ? "KA" : "AVG"} {formAverage.toFixed(1)}</strong><AwardTag award={formAward} /></span></div>
                <div className={`points-cell ${gwAward ? "award-cell" : ""}`} data-label={t.gwPoints}><span className={`gw-score ${manager.chip ? `has-chip ${chipClass(manager.chip)}` : ""} ${gwMedalRank ? `has-medal medal-rank-${gwMedalRank}` : ""}`}>{gwMedalRank && <Medal aria-label={language === "fi" ? `Kierroksen ${gwMedalRank}. paras` : `Gameweek rank ${gwMedalRank}`} />}<strong>{displayedGwPoints}</strong>{manager.chip && <b>{manager.chip}</b>}</span><span className={`points-formula ${manager.hit > 0 ? "" : "empty"}`}>{manager.hit > 0 ? <>({manager.gameweekPoints + manager.provisionalBonus} <b>− {manager.hit}</b> = {displayedGwPoints})</> : " "}</span><AwardTag award={gwAward} /></div>
                <div className="progress-cell" data-label={t.progress}>{!data.rosterOnly && (progress.finished === progress.total && progress.live === 0 ? <strong className={data.pointsFinalized ? "is-final" : "is-provisional"}>{data.pointsFinalized ? "FINAL" : "PROVISIONAL"}</strong> : <><span className="progress-summary">({progress.finished}/{progress.total})</span>{progress.live > 0 && <small><b>{progress.live}</b> LIVE</small>}</>)}</div>
                <div className="total-cell" data-label={t.total}><strong>{number.format(manager.totalPoints - manager.hit)}</strong></div>
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
