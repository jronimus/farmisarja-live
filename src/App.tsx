import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, ExternalLink, Globe, Medal, Search, Scale, TriangleAlert, Users, X } from "lucide-react";
import PlanningDashboard from "./PlanningDashboard";
import { createDemoArchive, createPlanningDemo, planningDemoArticles } from "./planningDemo";
import { isPlanningPeriod } from "./services/planning";
import { demoData } from "./demoData";
import { planningPlayer } from "./services/planningSquad";
import { loadLiveDashboard } from "./services/liveDashboard";
import { gameweekHandsOverAt, provisionalAutosubSquad } from "./services/fplRules";
import { translations } from "./i18n";
import { buildClubOwnership, buildOwnership, ownershipOf, type ClubOwnership, type Highlight, type PlayerOwnership } from "./services/ownership";
import { flagOf } from "./services/playerNews";
import { translateNews, translateReturn } from "./services/phrases";
import { absencesByElement, isStrong, loadFotmob, reportsSince, strongestByPlayer, type Absence, type Rumour } from "./services/rumours";
import { loadLineups, watchFrom, type LineupWatch } from "./services/lineups";
import ShareCard, { type CardKind } from "./ShareCard";
import PriceChanges from "./PriceChanges";
import TeamNews from "./TeamNews";
import Stats from "./Stats";
import MatchCentre from "./MatchCentre";
import PlayerComparison from "./PlayerComparison";
import { LiveMotionContext, LiveNumber, SquadDisclosure, useLiveRowMotion, usePageVisible } from "./LiveMotion";
import PlayerModal from "./PlayerModal";
import ManagerFormModal from "./ManagerFormModal";
import TeamComparison from "./TeamComparison";
import LivePlayersModal from "./LivePlayersModal";
import { ManagerSelectionMarks, SelectionPills, highlightStyle } from "./HighlightSelections";
import { highlightKey, highlightMatches, livePlayerSelections, toggleHighlight, type HighlightSelection } from "./services/highlights";
import { liveLeagueStandings } from "./services/leagueStandings";
import { pointsForPeriod } from "./services/periodScores";
import Sources from "./Sources";
import Ticker from "./Ticker";
import { estimateRank, loadRankCurve, type RankCurve } from "./services/liveRank";
import type { DashboardData, Language, ManagerRow, SquadPlayer } from "./types";

type SortKey = "position" | "gameweekPoints" | "totalPoints" | "overallRank" | "captainPoints" | "upcoming" | "form" | "teamValue" | "seasonTransfers" | "benchPointsBeforeGw" | "freeTransfersAfter";

const number = new Intl.NumberFormat("fi-FI");

const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
const chipClass = (chip: string) => `chip-${chip.toLowerCase()}`;
const pad = (value: number) => String(Math.floor(value)).padStart(2, "0");

function countdownLabel(ms: number, language: Language) {
  if (ms >= 86_400_000) return `${Math.floor(ms / 86_400_000)} ${language === "fi" ? "pv" : "d"} ${Math.floor((ms % 86_400_000) / 3_600_000)} h`;
  return `${pad(ms / 3_600_000)}:${pad(ms % 3_600_000 / 60_000)}:${pad(ms % 60_000 / 1000)}`;
}


function GitHubLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 .7A11.3 11.3 0 0 0 8.4 22.8c.6.1.8-.3.8-.6v-2.4c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.6 0-1.2.4-2.2 1.2-3-.1-.3-.5-1.5.1-3 0 0 1-.3 3.1 1.1a10.8 10.8 0 0 1 5.7 0C16.9 5 18 5.3 18 5.3c.6 1.5.2 2.7.1 3 .7.8 1.2 1.8 1.2 3 0 4.3-2.7 5.3-5.3 5.6.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" />
  </svg>;
}

type Award = { level: 0 | 1 | 2 | 3; tone: "green" | "gold" | "red" | "blue" | "purple" };

/**
 * One control per setting: the name inside the pill, a plain switch beside it. The pill
 * and its filled state are the price page's, so a toggle reads the same on both pages
 * without spelling out both states — what the switch is set to is the switch's own job.
 */
function StateToggle({ label, checked, onChange, className = "" }: { label: string; checked: boolean; onChange: (value: boolean) => void; className?: string }) {
  return <div className={`state-toggle ${className}`}>
    <span>{label}</span>
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`state-switch ${checked ? "active" : ""}`} onClick={() => onChange(!checked)}><i /></button>
  </div>;
}

/**
 * The highlight picker: one menu, two lists, one selection.
 *
 * A native `<select>` can hold a list and nothing else, so "Vain avaus" sat outside it as a
 * third control in the toolbar and there was no way to ask the list a question at all —
 * least of all the one this league actually asks, which is *who here owns Arsenal
 * players*. That question is a club, not a player, and it wants the same answer painted on
 * the same table, so the club list is a second tab rather than a filter on the first: a
 * filter narrows the players you can pick, and what was wanted was to pick the club.
 *
 * The trigger is a `<button>` wearing `.period-select` rather than a restyled button. The
 * page's later layers restyle that class twice over and a copy of it would drift.
 */
function HighlightPicker({ players, clubs, total, selections, onSelect, startersOnly, onStartersOnly, language }: {
  players: PlayerOwnership[];
  clubs: ClubOwnership[];
  total: number;
  selections: HighlightSelection[];
  onSelect: (next: Highlight) => void;
  startersOnly: boolean;
  onStartersOnly: (value: boolean) => void;
  language: Language;
}) {
  const t = translations(language);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"players" | "clubs">("players");
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const share = (value: number) => language === "fi" ? Math.round(value) + " %" : Math.round(value) + "%";

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tab === "players"
      ? players.filter((entry) => !term || entry.name.toLowerCase().includes(term) || entry.club.toLowerCase().includes(term))
      : clubs.filter((entry) => !term || entry.club.toLowerCase().includes(term));
  }, [players, clubs, search, tab]);

  // The same rule the form popover follows: anything that is not the menu closes it.
  useEffect(() => {
    if (!open) return;
    const away = () => setOpen(false);
    window.addEventListener("click", away);
    return () => window.removeEventListener("click", away);
  }, [open]);
  useEffect(() => { if (open) field.current?.focus(); }, [open]);
  useEffect(() => { setActive(0); }, [search, tab]);
  // The arrow keys move a highlight through a list longer than the box, so the row has to
  // be scrolled to and not merely marked.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const dismiss = (next?: Highlight) => {
    if (next !== undefined) onSelect(next);
    setOpen(false);
    setSearch("");
  };
  const pick = (index: number) => {
    const entry = matches[index];
    if (!entry) return;
    onSelect("id" in entry ? { kind: "player", id: entry.id } : { kind: "club", club: entry.club });
  };

  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { dismiss(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (event.key === "Enter" && (event.target === field.current || event.target === event.currentTarget)) { event.preventDefault(); pick(active); }
  };

  const label = `${language === "fi" ? "Valitse pelaajia" : "Select players"}${selections.length ? ` (${selections.length})` : ""}`;

  return <div className="player-picker" onClick={(event) => event.stopPropagation()}>
    <button
      type="button"
      className={`period-select player-picker-button ${selections.length ? "chosen" : ""}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={t.highlightPlayer}
      onKeyDown={keys}
      onClick={() => setOpen((value) => !value)}
    >{label}</button>

    {open && <div className="player-picker-menu" role="dialog" aria-label={t.highlightPlayer} onKeyDown={keys}>
      <div className="player-picker-search">
        <Search aria-hidden="true" />
        <input
          ref={field}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={tab === "players" ? t.searchPlayer : t.searchClub}
          aria-label={tab === "players" ? t.searchPlayer : t.searchClub}
        />
        <button type="button" className="player-picker-reset" disabled={!selections.length} aria-label={language === "fi" ? "Poista kaikki valinnat" : "Clear all selections"} title={language === "fi" ? "Poista kaikki valinnat" : "Clear all selections"} onClick={() => onSelect(null)}><X size={14} /></button>
      </div>
      <div className="player-picker-filters">
        {/* Two tabs and a switch on one row: all three are about what the list under them
            holds, and stacked they read as unrelated settings above it. */}
        <div className="player-picker-mode-row"><div className="player-picker-tabs" role="tablist">
          {([["players", t.tabPlayers], ["clubs", t.tabClubs]] as Array<["players" | "clubs", string]>).map(([key, name]) =>
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{name}</button>)}
        </div></div>
        <StateToggle label={t.startersOnly} checked={startersOnly} onChange={onStartersOnly} className="bench-toggle" />
      </div>
      <div className="player-picker-list" role="listbox" aria-multiselectable="true" ref={list}>
        {matches.map((entry, index) => {
          const isClub = !("id" in entry);
          const picked = selections.some(({ highlight }) => isClub ? highlight.kind === "club" && highlight.club === entry.club : highlight.kind === "player" && highlight.id === entry.id);
          return <button
            type="button"
            key={isClub ? entry.club : entry.id}
            role="option"
            aria-selected={picked}
            className={`player-picker-option ${index === active ? "is-active" : ""} ${picked ? "is-picked" : ""}`}
            onMouseEnter={() => setActive(index)}
            onClick={() => pick(index)}
          >
            {/* The club is under a player's name because FPL's short names are not unique
                and a league can easily hold two Fernandes; under a club's own name it is
                the count that says what the row is worth. */}
            <b>{picked ? "✓ " : ""}{isClub ? entry.club : entry.name}</b>
            <small>{isClub ? `${entry.owners}/${total} ${t.inSquads}` : entry.club}</small>
            <span>{isClub ? entry.picks : share(entry.effectivePercent)}</span>
            <i>{isClub ? t.playersWord : `${entry.owners}/${total}`}</i>
          </button>;
        })}
        {!matches.length && <p className="player-picker-empty">{t.noPlayersMatch}</p>}
      </div>
    </div>}
  </div>;
}

const transferNet = (manager: ManagerRow) => manager.chip === "WC" || manager.chip === "FH"
  ? manager.wildcardPreviousTeamPoints === undefined ? Number.NaN : manager.gameweekPoints + manager.provisionalBonus - manager.wildcardPreviousTeamPoints
  : manager.transfers.reduce((sum, transfer) => sum + transfer.inPoints - transfer.outPoints, 0) - manager.hit;

const currentBenchPoints = (manager: ManagerRow, autosubs = false) => manager.chip === "BB" ? 0 : provisionalAutosubSquad(manager.squad, autosubs).filter((player) => !player.starter).reduce((sum, player) => sum + player.points + player.bonus, 0);

function TransferCell({ manager, language, award, gameweek, onPlayer }: { manager: ManagerRow; language: Language; award?: Award; gameweek: number; onPlayer: (id: number) => void }) {
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
      const name = (text: string, id?: number) => id === undefined ? <span className="tf-name">{text}</span> : <button className="tf-name player-name-link" onClick={(event) => { event.stopPropagation(); onPlayer(id); }}>{text}</button>;
      const pair = <>{name(transfer.out, transfer.outId)} <b className="transfer-player-points">{transfer.outPoints}</b> <i>→</i> {name(transfer.in, transfer.inId)} <b className="transfer-player-points">{transfer.inPoints}</b></>;
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

function TeamValueCell({ manager, label, award, available = true, extra = "" }: { manager: ManagerRow; label: string; award?: Award; available?: boolean; extra?: string }) {
  if (!available) return <div className={`team-value-cell unavailable ${extra}`} data-label={label}><strong>—</strong></div>;
  const change = Math.round((manager.teamValue - manager.previousTeamValue) * 10) / 10;
  return <div className={`team-value-cell ${extra}`} data-label={label}><strong className={award ? `award-target award-${award.tone} award-level-${award.level}` : ""}>£{manager.teamValue.toFixed(1)}m</strong>{change !== 0 && <span className={change > 0 ? "positive" : "negative"}>{signed(change)}m</span>}</div>;
}

function SeasonTransfersCell({ manager, label, extra = "" }: { manager: ManagerRow; label: string; extra?: string }) {
  return <div className={`season-transfers-cell ${extra}`} data-label={label}><strong>{manager.seasonTransfers}</strong>{manager.seasonHitPoints > 0 && <span>(−{manager.seasonHitPoints})</span>}</div>;
}

function BenchPointsCell({ manager, label, award, available = true, autosubs = false, extra = "" }: { manager: ManagerRow; label: string; award?: Award; available?: boolean; autosubs?: boolean; extra?: string }) {
  if (!available) return <div className={`bench-points-cell unavailable ${extra}`} data-label={label}><strong>—</strong></div>;
  const current = currentBenchPoints(manager, autosubs);
  const total = manager.benchPointsBeforeGw + current;
  return <div className={`bench-points-cell ${extra}`} data-label={label}><strong className={award ? `award-target award-${award.tone} award-level-${award.level}` : ""}>{total}</strong><span>+{current}</span></div>;
}

function captainDisplay(manager: ManagerRow, autosubs: boolean) {
  const effective = provisionalAutosubSquad(manager.squad, autosubs).find((player) => player.captain);
  const multiplier = manager.chip === "TC" ? 3 : 2;
  return effective ? { id: effective.id, name: effective.name, points: (effective.points + effective.bonus) * multiplier } : { id: undefined, name: manager.captain, points: manager.captainPoints };
}

/**
 * What the eleven on screen have scored.
 *
 * FPL applies autosubs only once a fixture is settled, so `pick.multiplier` is still 0 for
 * a bench player who has already come on and `gameweekPoints` is short by whatever he has
 * scored. With the autosubs switch on the table shows the substitution but was still
 * adding up the old eleven — Jankon betoni read 54 against LiveFPL's 56 on 23 Aug, which
 * is Groß's two points sitting in a shirt the total did not count.
 *
 * Gross, like `gameweekPoints`: the hit is taken off once, where it is displayed.
 */
function provisionalGameweekPoints(manager: ManagerRow, autosubs: boolean) {
  const squad = provisionalAutosubSquad(manager.squad, autosubs);
  const scoring = manager.chip === "BB" ? squad : squad.filter((player) => player.starter);
  return scoring.reduce((sum, player) =>
    sum + (player.points + player.bonus) * (player.captain ? (manager.chip === "TC" ? 3 : 2) : 1), 0);
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

function SortHeader({ label, note, sortKey, active, direction, onSort }: { label: string; note?: string; sortKey: SortKey | null; active: SortKey; direction: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  // The note is a second line under the label, for a column whose name does not say what
  // it measures. It has to be short: the form column is 66px wide.
  const body = <>{label}{note && <i className="sort-header-note">{note}</i>}</>;
  if (!sortKey) return <span className="sort-header sort-header-static">{body}</span>;
  const isActive = active === sortKey;
  return <button className={`sort-header ${isActive ? "active" : ""}`} onClick={() => onSort(sortKey)}>{body}{isActive && <ChevronDown className={direction === "asc" ? "rotate" : ""} />}</button>;
}

/**
 * The corner mark FPL's own site puts on a flagged shirt, with the number it leaves out.
 *
 * FPL paints a red or a yellow triangle and puts the percentage in a hover tooltip only,
 * which is the wrong way round: the colour says there is something to read and the number
 * is the thing you decide on. Both are on the badge here, and the sentence is still on
 * hover, where it also names the club's own word on it when FPL links one.
 */
/**
 * The corner mark on a shirt, and the note it opens.
 *
 * A `title` attribute never appears on a touchscreen, so on a phone every one of these
 * marks was a coloured square with no way to find out what it meant. Tapping one now opens
 * the sentence beside the shirt; on a pointer it still hovers, and the badge is a button
 * either way so a keyboard reaches it too.
 */
function PlayerFlagMark({ player, language }: { player: SquadPlayer; language: Language }) {
  const t = translations(language);
  /**
   * Where the note goes, rather than whether it is open.
   *
   * It used to be positioned inside the shirt's own box, and that box clips its contents —
   * it has to, or a shirt would spill out of the card. So the sentence was cut off on two
   * sides and read as a black rectangle with a syllable in it. Anchoring it from the badge's
   * own rectangle and fixing it to the viewport puts it outside everything that clips.
   */
  const [note, setNote] = useState<{ left: number; top: number } | null>(null);
  const marks = useContext(RumourContext);
  const rumour = marks.rumours.get(player.id);
  const absence = marks.absences.get(player.id);
  const flag = flagOf(player);
  const mark = (kind: string, face: ReactNode, label: string) => <>
    <button
      type="button"
      className={`player-flag flag-${kind}`}
      title={label}
      aria-label={label}
      aria-expanded={Boolean(note)}
      onClick={(event) => {
        event.stopPropagation();
        const box = event.currentTarget.getBoundingClientRect();
        // Centred under the badge, then clamped: these cards run to the edge of a phone.
        setNote((open) => open ? null : {
          left: Math.max(8, Math.min(box.left + box.width / 2 - 95, innerWidth - 198)),
          top: box.bottom + 6,
        });
      }}
    >{face}</button>
    {/* Into the shell rather than into `body`: every colour token on this site is defined on
        `.app-shell`, so a note parented to the document inherits none of them and paints
        itself transparent. */}
    {note && createPortal(
      <span className="player-flag-note" role="status" style={{ left: note.left, top: note.top }}>{label}</span>,
      document.querySelector(".app-shell") ?? document.body,
    )}
  </>;

  if (flag.level !== "none") {
    // FPL's own word first, and FotMob's return date after it when there is one: FPL says
    // "Knee injury" and stops, where FotMob says when he is expected back.
    // Both publishers write in English; on a Finnish page they are translated, and the
    // original goes on the `title` so what was actually published can still be read.
    const own = player.news ? translateNews(player.news, language) : null;
    const back = absence?.expectedReturn ? translateReturn(absence.expectedReturn, language) : null;
    const label = [own?.text || (flag.chance !== null ? `${flag.chance} %` : t.flagOut), back?.text]
      .filter(Boolean).join(" · ");
    return mark(flag.level, flag.level === "out" ? "✕" : flag.chance, label);
  }
  // FotMob knows he is out and FPL has not said so yet. It happens both ways round and this
  // is the direction worth marking, since the shirt would otherwise be clean.
  if (absence) {
    const label = t.absenceTitle
      .replace("{reason}", t.absenceReason[absence.reason] ?? absence.reason)
      .replace("{return}", translateReturn(absence.expectedReturn, language).text || "—");
    return mark(absence.reason === "suspension" ? "out" : "major", "!", label);
  }
  /**
   * Not FPL's, and marked apart from FPL's for that reason: a move is not an injury, and a
   * reported one is not the same claim as a published percentage.
   *
   * Every reported move is marked, and the grading decides how loudly. It used to decide
   * *whether*, on the argument that a `Low` is a newspaper having a guess and a shirt is no
   * place for one — and that left the two halves of the site disagreeing in the one way a
   * reader notices. Villa's Martinez carried two reports on the news page, under the same ⇄
   * this draws, while his shirt on the pitch said nothing at all.
   *
   * A shirt still has room for one mark and no room for a paragraph. It has room for two
   * weights, though, and that is the difference between "look at this before you pick" and
   * "somebody has written something".
   */
  if (rumour) {
    /**
     * The destination and who reported it — and, only where the grading earns it, that he
     * may not be playing.
     *
     * A `Low` is one newspaper having a guess. Saying "ei välttämättä pelaamassa" over that
     * is putting a claim about the team sheet on somebody's speculation, which is the thing
     * this page exists not to do. The quiet mark reports the report and stops.
     */
    const strong = isStrong(rumour);
    const label = (strong ? t.rumourFlagTitle : t.rumourFlagQuiet)
      .replace("{to}", rumour.toClub).replace("{source}", rumour.source);
    return mark(strong ? "rumour" : "rumour flag-quiet", "⇄", label);
  }
  /**
   * His club's eleven has been predicted and he is not in it.
   *
   * The only version of this that means anything. It says nothing at all until FotMob
   * publishes a prediction for that club's next match — an hour or two before kick-off —
   * and a club with no prediction yet leaves its players unmarked rather than marked wrong.
   */
  if (marks.lineups.benched.has(player.id)) {
    // Not the letters `XI`, which read as *he is in the eleven* — the exact opposite of what
    // this mark means. A warning triangle says "there is something to know here" and says
    // nothing else, which is right for the softest of the four marks.
    return mark("xi", <TriangleAlert />, t.notInPredictedXI);
  }
  return null;
}

/**
 * The rumours, for the shirts.
 *
 * A context rather than a prop through the table, the manager block and the squad: this is
 * one small map that only the innermost card reads, and threading it through four
 * components that have no use for it would be four signatures worse for nothing.
 */
interface ShirtMarks {
  rumours: Map<number, Rumour>;
  absences: Map<number, Absence>;
  /** Only ever filled from a fixture FotMob has actually predicted; see services/lineups.ts. */
  lineups: LineupWatch;
}

const RumourContext = createContext<ShirtMarks>({
  rumours: new Map(), absences: new Map(), lineups: { starting: new Set(), benched: new Set(), unavailable: new Map() },
});

type View = "table" | "prices" | "news" | "stats" | "sources";

/**
 * Three destinations, still no router: Pages serves this from a subpath and the hash
 * survives that without a server rewrite.
 */
function viewFromHash(): View {
  const hash = location.hash.replace(/^#\/?/, "");
  if (hash === "hinnat") return "prices";
  if (hash === "uutiset") return "news";
  if (hash === "tilastot") return "stats";
  if (hash === "lahteet") return "sources";
  return "table";
}

function Shirt({ player }: { player: SquadPlayer }) {
  const kitSet = player.position === "GK" ? "optimized-gk" : "optimized";
  const source = `${import.meta.env.BASE_URL}kits/${kitSet}/${player.club.toLowerCase()}.webp?v=20260823-gk3`;
  return <div className="shirt"><img className="shirt-image" src={source} alt="" /></div>;
}

/**
 * When the match is, in one word.
 *
 * The clock is only worth printing on the day it matters; before that the answer to "when
 * does he play" is a day, not a time. Inside a week the weekday says it, and past a week
 * only a date does — a gameweek can run over two weekends, and then "la" would name two
 * different Saturdays.
 */
function kickoffLabel(iso: string, language: Language) {
  const locale = language === "fi" ? "fi-FI" : "en-GB";
  const date = new Date(iso);
  const midnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((midnight(date) - midnight(new Date())) / 86_400_000);
  if (days <= 0) return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  if (days < 7) return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric" }).format(date);
}

/**
 * Where a form figure stands against the game.
 *
 * FPL publishes `average_entry_score` for every gameweek, so form can be measured against
 * the average of the very same weeks rather than a threshold somebody picked. The tiers are
 * ratios of that average, which keeps them meaningful in a 30-point week and a 70-point
 * one alike.
 */
function standingAgainstAverage(manager: ManagerRow, formAverage: number, averages?: Record<number, number>) {
  // Both sides cover the same weeks: the manager's mean over his last five gameweeks
  // against everyone's mean over those same five. Not against one week's average.
  const benchmarks = manager.formGameweeks.map((gameweek) => averages?.[gameweek]).filter((value): value is number => typeof value === "number");
  if (!benchmarks.length) return { tier: "flat", delta: null as number | null, benchmark: null as number | null };
  const benchmark = benchmarks.reduce((sum, value) => sum + value, 0) / benchmarks.length;
  const delta = Math.round(formAverage - benchmark);
  const ratio = formAverage / benchmark;
  const tier = ratio >= 1.25 ? "high" : ratio >= 1.08 ? "up" : ratio <= 0.75 ? "low" : ratio <= 0.92 ? "down" : "flat";
  return { tier, delta, benchmark: Math.round(benchmark) };
}

/** 8px, 7px or 6px, by the longest piece of the name that cannot be broken. */
function nameStep(name: string) {
  const longest = Math.max(...name.split(/[\s]/).map((part) => part.length));
  if (longest >= 11) return "name-step-2";
  if (longest >= 9) return "name-step-1";
  return "";
}

function PlayerCard({ onOpen, player, language, tripleCaptain, scoreMultiplier, groupLabel, mobileGroupLabel, groupKind, highlighted, highlightColor, seasonPoints }: { seasonPoints?: number | null; onOpen: () => void; player: SquadPlayer; language: Language; tripleCaptain: boolean; scoreMultiplier: number; groupLabel?: string; mobileGroupLabel?: string; groupKind?: "position" | "bench"; highlighted?: boolean; highlightColor?: string }) {
  const t = translations(language);
  const waiting = player.state === "upcoming";
  const kickoff = waiting && player.kickoff ? kickoffLabel(player.kickoff, language) : "";
  return <div role="button" tabIndex={0} aria-haspopup="dialog" aria-label={`${player.name}: ${language === "fi" ? "pelaajatiedot" : "player details"}`} onClick={onOpen} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(); } }} style={highlightColor ? highlightStyle(highlightColor) : undefined} className={`player player-${player.state} position-${player.position.toLowerCase()} ${player.starter ? "player-starter" : "player-bench"} ${highlighted ? "player-picked" : ""} ${groupLabel ? `group-start group-${groupKind}` : ""}`}>
    {groupLabel && <span className="player-group-label"><b className="desktop-squad-label">{groupLabel}</b><b className="mobile-squad-label">{mobileGroupLabel ?? groupLabel}</b></span>}
    <div className="player-visual">{player.captain && <span className={`armband captain ${tripleCaptain ? "triple" : ""}`}>C</span>}{player.viceCaptain && <span className={`armband ${tripleCaptain ? "triple" : ""}`}>V</span>}<Shirt player={player} /><PlayerFlagMark player={player} language={language} /></div>
    {/* The step is chosen from the longest unbreakable token, not the whole name: a space
        or a hyphen can wrap on its own, a surname cannot. Measured against the 43px a card
        gets at eight to a row. */}
    <div className={`player-name ${nameStep(player.name)}`}><span>{player.name}</span></div>
    <div className="player-bottom">
      {/* A player who has not kicked a ball has not scored nought — he has not scored.
          The dash says which, where a 0 cannot: it is the same 0 a player who played
          badly gets. The kick-off takes the venue letter's place under it. */}
      <strong className="player-points">{seasonPoints !== undefined ? <><span className="desktop-player-score">{seasonPoints ?? "—"}</span><span className="mobile-player-score">{seasonPoints ?? "—"}</span></> : waiting
        ? <span className="player-waiting" aria-label={t.toPlay}>–</span>
        : <><span className="desktop-player-score">{(player.points + player.bonus) * scoreMultiplier}</span><span className="mobile-player-score">{(player.points + player.bonus) * scoreMultiplier}</span></>}</strong>
      {/* FPL's own 1–5 difficulty, from this player's side of the tie. */}
      {/* No state dot: the state is the colour of the band above, which is the same
          coding the legend spells out. A second mark for it read as a stray bullet. */}
      <span className={`player-fixture venue-${player.venue.toLowerCase()} fdr-${player.difficulty ?? 0}`}>
        <span className="player-opponent">{player.opponent}</span>
        <b className="player-venue">{player.opponent === "—" ? "" : kickoff || player.venue}</b>
      </span>
      <span className="player-ownership">{player.ownership.toFixed(1)} %</span>
    </div>
  </div>;
}

function Squad({ manager, language, autosubs, selections, onPlayer, planning }: { planning?: DashboardData; onPlayer: (id: number) => void; manager: ManagerRow; language: Language; autosubs: boolean; selections: HighlightSelection[] }) {
  const t = translations(language);
  const originalOrder = planning ? manager.squad : provisionalAutosubSquad(manager.squad, autosubs);
  // A substitute keeps his bench squadPosition, so sorting by that alone dropped him after
  // the forwards and opened a second midfield heading behind them. Group first, order
  // within the group second.
  const lineOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const active = originalOrder
    .filter((player) => player.starter)
    .sort((left, right) => lineOrder[left.position] - lineOrder[right.position] || left.squadPosition - right.squadPosition);
  const bench = originalOrder
    .filter((player) => !player.starter)
    .sort((left, right) => Number(right.position === "GK") - Number(left.position === "GK") || left.squadPosition - right.squadPosition);
  const scoreMultiplier = (player: SquadPlayer) => player.captain ? (manager.chip === "TC" ? 3 : 2) : 1;
  const positionLabels = language === "fi"
    ? { GK: "MAALIVAHTI", DEF: "PUOLUSTUS", MID: "KESKIKENTTÄ", FWD: "HYÖKKÄYS" }
    : { GK: "GOALKEEPER", DEF: "DEFENCE", MID: "MIDFIELD", FWD: "FORWARDS" };
  const mobilePositionLabels = language === "fi"
    ? { GK: "MV", DEF: "PAKIT", MID: "KK", FWD: "HYÖK." }
    : { GK: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };
  const renderPlayer = (player: SquadPlayer, groupLabel?: string, mobileGroupLabel?: string, groupKind?: "position" | "bench") => {
    const preview = planning ? planningPlayer(player, planning) : undefined;
    return <PlayerCard seasonPoints={preview?.seasonPoints} onOpen={() => onPlayer(player.id)} key={player.id} player={preview?.player ?? player} language={language} tripleCaptain={manager.chip === "TC"} scoreMultiplier={scoreMultiplier(player)} groupLabel={groupLabel} mobileGroupLabel={mobileGroupLabel} groupKind={groupKind} highlighted={selections.some((item) => highlightMatches(item.highlight, player))} highlightColor={selections.find((item) => highlightMatches(item.highlight, player))?.color} />;
  };
  return <div className={`squad-panel ${planning ? "squad-planning" : ""}`}>
    <div className="squad-heading" aria-hidden={planning ? undefined : true}>{planning && <span>{language === "fi" ? "Kauden pisteet · Seuraava ottelu" : "Season points · Next fixture"}</span>}</div>
    <div className="squad-players">
      {/* One container per line. On a desktop they are display:contents and the eleven read
          as one strip; on a phone each is a flex row that centres itself, which a grid
          cannot do for a part-filled row. */}
      <div className="squad-grid starters">
        {(["GK", "DEF", "MID", "FWD"] as const)
          .map((line) => [line, active.filter((player) => player.position === line)] as const)
          .filter(([, players]) => players.length > 0)
          .map(([line, players]) => <div className={`squad-line line-${line.toLowerCase()}`} key={line}>
            {players.map((player, index) => renderPlayer(player, index === 0 ? positionLabels[line] : undefined, index === 0 ? mobilePositionLabels[line] : undefined, "position"))}
          </div>)}
      </div>
      <div className="squad-heading bench-heading"><span>{t.bench}</span></div>
      <div className={`squad-grid bench ${manager.chip === "BB" && !planning ? "bench-boost" : ""}`}><span className="bench-frame-label">{manager.chip === "BB" && !planning ? "Bench Boost" : t.bench}</span>{bench.map((player) => renderPlayer(player))}</div>
    </div>
  </div>;
}

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const demoMode = urlParams.has("demo");
  const planningDemo = urlParams.get("demo") === "planning";
  const screenshotMode = urlParams.has("screenshot");
  // ?card=round|total|awards|deadline renders a single share card at its delivered size and nothing else.
  const cardParam = urlParams.get("card");
  const cardKind: CardKind | null = cardParam === "round" || cardParam === "total" || cardParam === "awards" || cardParam === "deadline" ? cardParam : null;
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem("farmisarja-language") === "en" ? "en" : "fi");
  const [autosubs, setAutosubs] = useState(true);
  const [mobileDetails, setMobileDetails] = useState(true);
  const [period, setPeriod] = useState("total");
  const [selections, setSelections] = useState<HighlightSelection[]>([]);
  const [liveSelection, setLiveSelection] = useState(demoMode && !planningDemo);
  const [livePlayersOpen, setLivePlayersOpen] = useState(false);
  // The switch reads "Vain avaus", so it is off by default and turning it on narrows the
  // count to the eleven on the pitch. It is a preference rather than a view, so it
  // outlives the session the way the language does.
  const [startersOnly, setStartersOnly] = useState(() => localStorage.getItem("farmisarja-starters-only") === "true");
  const [formOpen, setFormOpen] = useState<number | null>(null);
  // Two pages, no router: Pages serves this from a subpath, and the hash survives that
  // without any server rewrite.
  const [view, setView] = useState<View>(() => viewFromHash());
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; managerId?: number } | null>(null);
  const [playerComparisonOpen, setPlayerComparisonOpen] = useState(false);
  const [comparisonPlayerIds, setComparisonPlayerIds] = useState<number[]>([]);
  const [teamComparisonOpen, setTeamComparisonOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(demoMode ? null : 101);
  const [sort, setSort] = useState<SortKey>("position");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [now, setNow] = useState(() => Date.now());
  const [latestData, setData] = useState<DashboardData>(() => planningDemo ? createPlanningDemo(Date.now(), urlParams.get("owners") === "stress") : demoData);
  const [archiveWeek, setArchiveWeek] = useState<number | null>(null);
  const [archiveData, setArchiveData] = useState<DashboardData | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState(false);
  const showPreviousRound = archiveWeek !== null && view === "table";
  const data = view === "table" && showPreviousRound && archiveData ? archiveData : latestData;
  const planningAvailable = isPlanningPeriod(latestData, now);
  // Select the preview once when its handover gate opens; later browsing stays manual.
  useEffect(() => {
    if (planningAvailable) { setArchiveWeek(null); setArchiveData(null); setArchiveError(false); setArchiveLoading(false); }
  }, [planningAvailable]);
  const archiveLast = latestData.pointsFinalized ? latestData.gameweek : latestData.gameweek - 1;
  const archiveFirst = planningDemo ? Math.max(1, latestData.gameweek - 4) : 1;
  useEffect(() => {
    if (archiveWeek === null) { setArchiveData(null); setArchiveError(false); setArchiveLoading(false); return; }
    let active = true;
    setArchiveLoading(true); setArchiveError(false);
    const request = demoMode ? Promise.resolve(createDemoArchive(latestData, archiveWeek)) : loadLiveDashboard(archiveWeek);
    void request.then(snapshot => {
      if (!snapshot || snapshot.dataPending) throw new Error("Historical round unavailable");
      if (active) { setArchiveData(snapshot); setExpanded(null); }
    }).catch(() => { if (active) setArchiveError(true); }).finally(() => { if (active) setArchiveLoading(false); });
    return () => { active = false; };
  }, [archiveWeek, latestData.gameweek, demoMode]);
  const planningPeriod = planningAvailable && !showPreviousRound;
  useEffect(() => {
    if ((planningPeriod && ["captainPoints", "gameweekPoints", "upcoming"].includes(sort)) || (!planningPeriod && sort === "freeTransfersAfter")) { setSort("position"); setDirection("asc"); }
  }, [planningPeriod, sort]);
  const [liveReady, setLiveReady] = useState(demoMode);
  const [liveError, setLiveError] = useState<string | null>(null);
  // FPL answers 5xx for a while around the deadline; only surface an error once it keeps failing.
  const failureCount = useRef(0);
  const t = translations(language);
  const pageVisible = usePageVisible();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const readHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  useEffect(() => {
    localStorage.setItem("farmisarja-language", language);
  }, [language]);

  /**
   * Rumours, once. They are refreshed on the Worker every half hour and a page open all
   * evening has nothing to gain from asking again — a move that breaks while you watch will
   * be there on the next load, and the Uutiset page reads its own copy anyway.
   */
  const [marks, setMarks] = useState<ShirtMarks>({
    rumours: new Map(), absences: new Map(), lineups: { starting: new Set(), benched: new Set(), unavailable: new Map() },
  });
  const clubOf = useMemo(
    () => new Map((data.playerNews ?? []).map((player) => [player.id, player.club])),
    [data.playerNews],
  );
  useEffect(() => {
    let active = true;
    Promise.all([loadFotmob(), loadLineups()])
      .then(([fotmob, fixtures]) => {
        if (!active) return;
        const lineups = watchFrom(fixtures ?? [], clubOf);
        /**
         * Two absence lists, and the match one wins where they overlap.
         *
         * The club payload's list hangs off `lastLineupStats`, so it describes the side
         * that played last; the match payload's describes the side about to play. The first
         * covers the whole league all week and the second only the fixtures near kick-off,
         * which is exactly when it is worth more — so the broad one is the floor and the
         * near one is laid over it.
         */
        // The same two rules the news page applies: a shirt is not marked for a report the
        // player has already answered on the pitch, nor for an absence he has played through.
        const absences = absencesByElement(fotmob?.absences ?? [], fotmob ?? undefined);
        for (const [element, player] of lineups.unavailable) {
          absences.set(element, { element, name: player.name, club: player.club, reason: player.reason, expectedReturn: player.expectedReturn });
        }
        setMarks({ rumours: strongestByPlayer(reportsSince(fotmob?.rumours ?? [], fotmob?.lastPlayedAt ?? {})), absences, lineups });
      })
      // Marks that cannot be read are not worth breaking the table over.
      .catch(() => {});
    return () => { active = false; };
  }, [clubOf]);

  useEffect(() => {
    localStorage.setItem("farmisarja-starters-only", String(startersOnly));
  }, [startersOnly]);

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

  // Ownership is read through the same autosub view as the table, so the armband and the
  // starting eleven it counts are the ones on screen.
  // Everything below reads this rather than data.managers, so the sort, the awards, the
  // medals and the figures on screen cannot disagree about what a manager has scored.
  const liveManagers = useMemo(() => {
    if (showPreviousRound) return data.managers;
    const scored = data.managers.map((manager) => {
      const provisional = provisionalGameweekPoints(manager, autosubs);
      if (provisional <= manager.gameweekPoints) return manager;
      const gained = provisional - manager.gameweekPoints;
      return { ...manager, gameweekPoints: provisional, totalPoints: manager.totalPoints + gained };
    });
    return data.rosterOnly || data.dataPending ? scored : liveLeagueStandings(scored);
  }, [data.managers, data.rosterOnly, data.dataPending, autosubs, showPreviousRound]);

  const ownership = useMemo(() => buildOwnership(liveManagers, autosubs, !startersOnly), [liveManagers, autosubs, startersOnly]);
  /*
   * The live overall rank. FPL's own figure is stored, not live: it does not move while
   * matches run, and even once every fixture is confirmed it still excludes every autosub
   * in the game — measured on 25 Aug, four of these seven rows showed more points than the
   * rank beside them belonged to. The Worker's curve is a count of who stands above a
   * total, so the same total the row shows can simply be looked up on it.
   */
  const [rankCurve, setRankCurve] = useState<RankCurve | null>(null);
  /*
   * Whether anybody still needs an estimate, which is a question with an exact answer: FPL's
   * rank belongs to a total, and when that total is the one the row prints, its rank is the
   * real thing and there is nothing left to estimate. That happens by itself once FPL
   * reprocesses the gameweek — so the estimate fills a gap and then stands down, and the
   * page stops asking the Worker for a curve nobody is going to read.
   */
  const rankNeedsEstimate = useMemo(
    () => liveManagers.some((manager) => manager.rankedPoints !== manager.totalPoints + manager.provisionalBonus - manager.hit),
    [liveManagers],
  );
  useEffect(() => {
    if (!liveReady || demoMode || !rankNeedsEstimate) { setRankCurve(null); return; }
    let cancelled = false;
    const read = () => loadRankCurve(data.gameweek)
      .then((curve) => { if (!cancelled) setRankCurve(curve); })
      .catch(() => { /* the rank is an extra; the table is not waiting on it */ });
    read();
    // The Worker rewrites the curve every two and a half minutes at most, so this reads it
    // on the same rhythm as the feed rather than more often than it can change.
    const timer = window.setInterval(read, 90_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [liveReady, demoMode, rankNeedsEstimate, data.gameweek]);

  const liveSelections = useMemo(() => livePlayerSelections(data.managers), [data.managers]);
  const shownSelections = liveSelection ? liveSelections : selections;
  const highlighted: Highlight = shownSelections.length === 1 ? shownSelections[0].highlight : null;
  const clubOwnership = useMemo(() => buildClubOwnership(liveManagers, autosubs, !startersOnly), [liveManagers, autosubs, startersOnly]);
  // A highlighted player can be transferred out from under the selection between refreshes,
  // and the last player of a club can go with him.
  const selected = highlighted?.kind === "player" ? ownership.find((entry) => entry.id === highlighted.id) ?? null : null;
  const selectedClub = highlighted?.kind === "club" ? clubOwnership.find((entry) => entry.club === highlighted.club) ?? null : null;
  const picking = selected ?? selectedClub ?? (shownSelections.length > 0 || liveSelection ? true : null);
  /** What the highlight is, said in words. The two readouts and the caption share it. */
  const highlightSentence = () => liveSelection ? <>Live · {liveSelections.length}</> : shownSelections.length > 1 ? <>{shownSelections.length} {language === "fi" ? "valittua korostusta" : "selected highlights"}</> : selectedClub
    ? <><b>{selectedClub.owners}/{data.managers.length}</b> {t.inSquads} · <b>{selectedClub.picks}</b> {t.playersWord}
      {selectedClub.captains > 0 && <> · <b>{selectedClub.captains}</b> {t.asCaptain}</>}</>
    : selected
      ? <><b>{selected.owners}/{data.managers.length}</b> {t.inSquads}
        {selected.captains > 0 && <> · <b>{selected.captains}</b> {t.asCaptain}</>}
        {!startersOnly && selected.benched > 0 && <> · <b>{selected.benched}</b> {t.onBench}</>}</>
      : null;

  const periodScores = useMemo(() => new Map(liveManagers.map((manager) => [manager.id, pointsForPeriod(manager, period, data.gameweek)])), [liveManagers, period, data.gameweek]);
  const periodRanks = useMemo(() => {
    const scores = [...periodScores.values()].filter((value): value is number => value !== null);
    return new Map(liveManagers.map((manager) => { const score = periodScores.get(manager.id); return [manager.id, score == null ? null : 1 + scores.filter((other) => other > score).length]; }));
  }, [liveManagers, periodScores]);
  const managers = useMemo(() => [...liveManagers].sort((a, b) => {
    if (period !== "total" && (sort === "position" || sort === "totalPoints")) {
      const av = periodScores.get(a.id), bv = periodScores.get(b.id);
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return (av - bv) * (sort === "position" ? direction === "asc" ? -1 : 1 : direction === "asc" ? 1 : -1);
    }
    // A gameweek in progress has no settled form behind it yet, so the series can be empty.
    const aValue = sort === "form" ? a.form.reduce((sum, value) => sum + value, 0) / Math.max(1, a.form.length) : a[sort];
    const bValue = sort === "form" ? b.form.reduce((sum, value) => sum + value, 0) / Math.max(1, b.form.length) : b[sort];
    return ((aValue ?? -Infinity) - (bValue ?? -Infinity)) * (direction === "asc" ? 1 : -1);
  }), [liveManagers, direction, sort, period, periodScores]);
  const motionFrame = {
    revision: data.updatedAt,
    scope: [data.gameweek, view, sort, direction, period, autosubs, mobileDetails, language, expanded].join(":"),
    enabled: !showPreviousRound && !livePlayersOpen && liveReady && !demoMode && !screenshotMode && !data.dataPending && !data.rosterOnly && view === "table" && !selectedPlayer && !playerComparisonOpen && !teamComparisonOpen && formOpen === null,
    visible: pageVisible,
    live: Boolean(data.fixtures?.some((fixture) => fixture.status === "live" || fixture.status === "provisional")),
  };
  const animatedRows = useLiveRowMotion(motionFrame, managers.map((manager) => manager.id));


  const awardStats = useMemo(() => {
    const captainScores = liveManagers.map((manager) => captainDisplay(manager, autosubs).points);
    const gwScores = liveManagers.map((manager) => manager.gameweekPoints + manager.provisionalBonus - manager.hit);
    const transferScores = liveManagers.map(transferNet).filter(Number.isFinite);
    const benchScores = liveManagers.map((manager) => currentBenchPoints(manager, autosubs));
    const formAverages = liveManagers.map((manager) => manager.form.reduce((sum, value) => sum + value, 0) / Math.max(1, manager.form.length));
    const values = liveManagers.map((manager) => manager.teamValue).sort((a, b) => a - b);
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
  }, [autosubs, liveManagers]);

  const gwMedalRanks = useMemo(() => {
    const scores = liveManagers.map((manager) => manager.gameweekPoints + manager.provisionalBonus - manager.hit);
    return new Map(liveManagers.flatMap((manager) => {
      const score = manager.gameweekPoints + manager.provisionalBonus - manager.hit;
      const rank = 1 + scores.filter((otherScore) => otherScore > score).length;
      return rank <= 3 ? [[manager.id, rank] as const] : [];
    }));
  }, [liveManagers]);

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

  // Finnish sets a space before the percent sign; English does not.
  const percent = (value: number) => language === "fi" ? `${Math.round(value)} %` : `${Math.round(value)}%`;
  const monthLabel = (month: string) => { const name = monthFormatter.format(new Date(`${month}-01T12:00:00Z`)); return name.charAt(0).toUpperCase() + name.slice(1); };
  const periodLabel = period === "total" ? t.total : monthLabel(period);
  const headers: Array<[string, SortKey | null, string?]> = planningPeriod ? [[t.position, "position"], [t.manager, null], [language === "fi" ? "Ilmaiset siirrot" : "Free transfers", "freeTransfersAfter"], [t.seasonTransfers, "seasonTransfers"], [t.chips, null], [t.teamValue, "teamValue"], [t.benchPoints, "benchPointsBeforeGw"], [t.form, "form", t.formNote], [periodLabel, "totalPoints"]] : [[t.position, "position"], [t.manager, null], [t.captain, "captainPoints"], [t.transfers, null], [t.seasonTransfers, "seasonTransfers"], [t.chips, null], [t.teamValue, "teamValue"], [t.benchPoints, "benchPointsBeforeGw"], [t.form, "form", t.formNote], [t.gwPoints, "gameweekPoints"], [t.progress, "upcoming"], [periodLabel, "totalPoints"]];
  /**
   * What the phone offers to sort by. Not the column list: "Yhteensä" orders the table
   * exactly as "Sija" already does, since league position is the season total, and "Vire"
   * has no cell on a phone card to land in. The captain column sorts on the captain's
   * points, so it says so here, where there is no column heading to make that obvious.
   */
  const mobileSortOptions: Array<[string, SortKey]> = [
    [t.position, "position"],
    [t.captainPointsLabel, "captainPoints"],
    [t.gwPoints, "gameweekPoints"],
    [t.progress, "upcoming"],
    [t.teamValue, "teamValue"],
    [t.benchPoints, "benchPointsBeforeGw"],
    [t.transfers, "seasonTransfers"],
  ];
  // "Sija" is the table's own resting order, so it reads as no choice rather than as a sort.
  const sortLabel = sort === "position" ? "" : mobileSortOptions.find(([, key]) => key === sort)?.[0] ?? "";
  /** The column's own short name, for the compact head — the picker's wording is longer. */
  const columnLabel: Record<SortKey, string> = {
    freeTransfersAfter: language === "fi" ? "Ilmaiset siirrot" : "Free transfers", position: t.position, captainPoints: t.captain, gameweekPoints: t.gwPoints, upcoming: t.progress,
    teamValue: t.teamValue, benchPointsBeforeGw: t.benchPoints, seasonTransfers: t.transfers,
    totalPoints: periodLabel, overallRank: "OR", form: t.form,
  };
  const gameweekFixtures = data.fixtures ?? [];
  const liveFixtures = gameweekFixtures.filter((fixture) => fixture.status === "live");
  const playedFixtures = gameweekFixtures.filter((fixture) => fixture.status === "provisional" || fixture.status === "final");
  const nextFixture = gameweekFixtures.find((fixture) => fixture.status === "upcoming");
  // Fixture data tells whether the gameweek is running even before any picks are published.
  const gameweekIsLive = gameweekFixtures.length ? liveFixtures.length > 0 : data.managers.some((manager) => manager.live > 0);
  /*
   * Once a gameweek is confirmed and has had its half day of saying so, the card is about
   * the next one. Nothing else moves: the table, the awards and the share cards stay on the
   * gameweek that has the points, and the card gives up its played count and fixture menu
   * along with the old number, because both of those are about the gameweek it just left.
   * One card, one gameweek — a GW 2 heading over a 10/10 played from GW 1 is worse than
   * either half on its own.
   */
  const lastKickoff = gameweekFixtures.reduce((latest, fixture) => fixture.kickoff > latest ? fixture.kickoff : latest, "");
  const handedOver = !showPreviousRound && Boolean(data.pointsFinalized && data.nextEvent && lastKickoff && now >= gameweekHandsOverAt(lastKickoff));
  const shown = handedOver && data.nextEvent ? data.nextEvent : { gameweek: data.gameweek, deadline: data.deadline };
  const deadlineMs = Math.max(0, new Date(shown.deadline).getTime() - now);
  const deadlineLabel = countdownLabel(deadlineMs, language);
  const compactDeadlineLabel = deadlineLabel;
  const nextKickoffLabel = nextFixture ? countdownLabel(Math.max(0, new Date(nextFixture.kickoff).getTime() - now), language) : "";
  // Awards are decided once every match has been played, which is before the points turn final.
  const gameweekComplete = (gameweekFixtures.length > 0 && gameweekFixtures.every((fixture) => fixture.status === "provisional" || fixture.status === "final"));
  const updatedLabel = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { dateStyle: "short", timeStyle: "medium" }).format(new Date(data.updatedAt));

  const tableToolbar = (<div className="toolbar">
        <div className="toolbar-selects">
          <select className="period-select period-calendar" value={period} onChange={(event) => { setPeriod(event.target.value); setSort("position"); setDirection("asc"); }} aria-label={language === "fi" ? "Valitse ajanjakso" : "Select period"}>
            <option value="total">Total</option>
            {data.activeMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}
          </select>
          {!planningPeriod && !data.rosterOnly && ownership.length > 0 && <>
            <HighlightPicker
              players={ownership}
              clubs={clubOwnership}
              total={data.managers.length}
              selections={selections}
              onSelect={(next) => { setLiveSelection(false); setSelections((current) => toggleHighlight(current, next, next?.kind === "club" ? next.club : data.players?.find((p) => p.id === next?.id)?.name ?? ownership.find((p) => p.id === (next?.kind === "player" ? next.id : -1))?.name ?? "")); }}
              startersOnly={startersOnly}
              onStartersOnly={setStartersOnly}
              language={language}
            />
          </>}
          <button type="button" className="period-select comparison-open" aria-haspopup="dialog" disabled={data.managers.length < 2} aria-label={language === "fi" ? "Joukkuevertailu" : "Team comparison"} onClick={() => setTeamComparisonOpen(true)}><Scale size={17} aria-hidden="true" /><span>{language === "fi" ? "Joukkuevertailu" : "Team comparison"}</span></button>
        </div>
        <div className="toolbar-highlight-controls">
        {!planningPeriod && liveSelections.length > 0 && <div className="toolbar-live-control">
          <button type="button" className="toolbar-live-open" aria-haspopup="dialog" onClick={() => setLivePlayersOpen(true)}><i aria-hidden="true" />Live <b>{liveSelections.length}</b></button>
          <button type="button" role="switch" className={`state-switch ${liveSelection ? "active" : ""}`} aria-checked={liveSelection} aria-label={language === "fi" ? "Näytä livepelaajien pisteet taulukossa" : "Show live player scores in table"} onClick={() => setLiveSelection(!liveSelection)}><i /></button>
        </div>}
        <SelectionPills selected={planningPeriod || liveSelection ? [] : selections} language={language} onRemove={(key) => setSelections((current) => current.filter((item) => highlightKey(item.highlight) !== key))} onClear={() => { setSelections([]); setLiveSelection(false); }} />
        </div>
        <div className="toolbar-toggles">
          <div className="round-browser" aria-label={language === "fi" ? "Selaa kierroksia" : "Browse gameweeks"}>
            <button disabled={archiveLoading || (archiveWeek !== null ? archiveWeek <= archiveFirst : (planningPeriod ? archiveLast : Math.min(archiveLast, latestData.gameweek - 1)) < archiveFirst)} aria-label={language === "fi" ? "Edellinen kierros" : "Previous gameweek"} onClick={() => { setPeriod("total"); setArchiveWeek(archiveWeek === null ? planningPeriod ? archiveLast : Math.min(archiveLast, latestData.gameweek - 1) : archiveWeek - 1); }}><ChevronLeft size={17} /></button>
            <span aria-live="polite">{archiveLoading ? (language === "fi" ? "Ladataan…" : "Loading…") : archiveWeek === null ? planningPeriod ? `GW ${latestData.nextEvent?.gameweek}` : `GW ${latestData.gameweek}` : `GW ${data.gameweek}`}</span>
            <button disabled={archiveLoading || archiveWeek === null} aria-label={language === "fi" ? "Seuraava kierros" : "Next gameweek"} onClick={() => setArchiveWeek(archiveWeek !== null && archiveWeek < (planningAvailable ? archiveLast : latestData.gameweek - 1) ? archiveWeek + 1 : null)}><ChevronRight size={17} /></button>

          </div>
          {!planningPeriod && <StateToggle label={t.details} checked={mobileDetails} onChange={setMobileDetails} className="details-toggle" />}
          {!planningPeriod && <StateToggle label={t.autosubs} checked={autosubs} onChange={setAutosubs} className="autosub-toggle" />}
        </div>
      </div>);

  const leagueTable = data.dataPending ? <section className="data-pending" role="status">
        <Clock3 />
        <strong>{language === "fi" ? "Peliviikon joukkueita päivitetään" : "Gameweek teams are being updated"}</strong>
        <span>{language === "fi" ? "Taulukko avautuu automaattisesti heti, kun FPL-data on saatavilla." : "The table will open automatically as soon as the FPL data is available."}</span>
      </section> : <section className={`league-table ${planningPeriod ? "planning-league-table" : ""}`}>
        <div className="table-head">{headers.map(([label, key, note], index) => <SortHeader key={`${label}-${index}`} label={label} note={note} sortKey={key} active={sort} direction={direction} onSort={handleSort} />)}</div>
        <div className="rows" ref={animatedRows}>
          <div className="mobile-simple-head">
            <b>{t.position}</b><b>{t.manager}</b>
            {/* Sorted, the card carries one figure, so the head names that column rather
                than the two it replaced. */}
            {sort === "position" ? <><b>GW</b><b>{periodLabel}</b></> : <b className="head-sorted">{columnLabel[sort]}</b>}
          </div>
          {managers.map((manager) => {
            const open = expanded === manager.id;
            const displayedGwPoints = manager.gameweekPoints + manager.provisionalBonus - manager.hit;
            const captain = captainDisplay(manager, autosubs);
            // The estimate is looked up on the very total the row prints, so the two can
            // never disagree about what this manager has scored — and it is only reached at
            // all while FPL's own rank belongs to a different total than the row shows.
            const rowTotal = manager.totalPoints + manager.provisionalBonus - manager.hit;
            const estimated = manager.rankedPoints === rowTotal ? null : estimateRank(rowTotal, rankCurve);
            const shownRank = estimated ?? manager.overallRank;
            const rankTitle = estimated ? t.rankEstimate : t.rankStored;
            // Without a previous rank there is no movement to draw, which is every row
            // in GW1.
            const rankClass = !manager.previousOverallRank ? "rank-neutral"
              : shownRank < manager.previousOverallRank ? "rank-up"
              : shownRank > manager.previousOverallRank ? "rank-down" : "rank-neutral";
            const progress = weightedProgress(manager, autosubs);
            const transferScore = transferNet(manager);
            const benchScore = currentBenchPoints(manager, autosubs);
            const formAverage = manager.form.reduce((sum, value) => sum + value, 0) / Math.max(1, manager.form.length);
            const formStanding = standingAgainstAverage(manager, formAverage, data.gameweekAverages);
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
            const picked = ownershipOf(manager, null, autosubs, !startersOnly);
            // Marks the one cell the compact phone card keeps when a sort is chosen.
            const metric = (key: SortKey) => sort === key ? "sorted-metric" : "";
            /**
             * The line under the manager, when the sort makes something else worth saying
             * there. The captain line already explains a captain or gameweek sort, so those
             * keep it; these four have supporting detail the single metric column cannot
             * hold. Anything else leaves the captain line alone.
             */
            const sortMeta = data.rosterOnly ? null : (() => {
              // No label where it would only repeat the column heading above the figure.
              const totalNow = periodScores.get(manager.id) == null ? "—" : number.format(periodScores.get(manager.id)!);
              // Sorting replaces the gameweek and season figures with one column, so where
              // the sort has nothing of its own to add, this line hands those two back.
              if (sort === "captainPoints") return <><i>GW</i><b>{displayedGwPoints}</b><i>{t.total}</i><b>{totalNow}</b></>;
              if (sort === "gameweekPoints") return <><i>{t.total}</i><b>{totalNow}</b></>;
              if (sort === "teamValue") {
                const change = Math.round((manager.teamValue - manager.previousTeamValue) * 10) / 10;
                return change === 0 ? null : <b className={change > 0 ? "positive" : "negative"}>{signed(change)}m</b>;
              }
              // The column totals the season; this is what the running gameweek added.
              if (sort === "benchPointsBeforeGw") {
                const current = currentBenchPoints(manager, autosubs);
                return <><i>GW</i><b className={current > 0 ? "positive" : ""}>+{current}</b></>;
              }
              if (sort === "seasonTransfers") {
                return <><i>GW</i><b>{manager.transfers.length}</b>{manager.hit > 0 && <b className="negative">−{manager.hit}</b>}</>;
              }
              // Nothing for "Pelattu": that cell already carries both the count and the LIVE
              // line, and repeating the second of them under the name said it twice.
              return null;
            })();
            return <div data-manager-id={manager.id} className={`manager-block ${open ? "open" : ""} ${data.rosterOnly ? "roster-only" : ""} ${picked.owns ? "owns-picked" : ""} ${picked.captains ? "captains-picked" : ""} ${picked.benched ? "benches-picked" : ""}`} key={manager.id}>
              <div className="manager-row" onClick={() => setExpanded(open ? null : manager.id)}>
                <div className="position-cell"><button aria-label="Expand squad">{open ? <ChevronDown /> : <ChevronRight />}</button><strong>{period === "total" ? manager.position : periodRanks.get(manager.id) ?? "—"}</strong>{period === "total" && !data.rosterOnly && <Movement current={manager.position} previous={manager.previousPosition} />}{!data.rosterOnly && shownRank > 0 && hasSeasonPoints && <small className={`position-or ${rankClass}`} title={`OR ${estimated ? "~" : ""}${number.format(shownRank)} · ${rankTitle}`}><span className="position-or-prefix">OR </span><span className="position-or-value">{estimated ? "~" : ""}{compactRank(shownRank)}</span></small>}</div>
                <div className="manager-cell"><a className={picked.owns ? "picked-name" : ""} href={`https://fantasy.premierleague.com/entry/${manager.id}/event/${data.gameweek}`} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer">{manager.teamName}</a><span className="manager-meta-line" title={manager.managerName}><span className="manager-name">{manager.managerName}</span></span>{!data.rosterOnly && !planningPeriod && <span className="mobile-captain"><b className={manager.chip === "TC" ? "triple" : ""}>C</b><strong className={picked.captains ? "picked-name" : ""}>{captain.name}</strong><em>{captain.points} pts</em></span>}{sortMeta && <span className="mobile-sort-meta">{sortMeta}</span>}{/* The tilde is the whole disclaimer. A rank read off a sample is not FPL's number and
                    must not be printed as though it were. */}
                  {!data.rosterOnly && shownRank > 0 && hasSeasonPoints && <small className={rankClass} title={rankTitle}>OR {estimated ? "~" : ""}{number.format(shownRank)}</small>}</div>
                {!planningPeriod && <><div className={`captain-cell ${captainAward ? "award-cell" : ""} ${metric("captainPoints")}`} data-label={sort === "captainPoints" ? captain.name : t.captain}><strong className={picked.captains ? "picked-name" : ""}>{captain.id === undefined ? captain.name : <button className="player-name-link" onClick={(event) => { event.stopPropagation(); setSelectedPlayer({ id: captain.id!, managerId: manager.id }); }}>{captain.name}</button>}</strong><span className={captainAward ? `award-target award-${captainAward.tone} award-level-${captainAward.level}` : ""}>{captain.points} pts</span></div>
                <TransferCell manager={manager} language={language} award={transferAward} gameweek={data.gameweek} onPlayer={(id) => setSelectedPlayer({ id, managerId: manager.id })} /></>}
                {planningPeriod && <div className="free-transfers-cell" data-label={language === "fi" ? "Ilmaiset siirrot" : "Free transfers"}><strong>{manager.freeTransfersAfter ?? "—"}</strong></div>}
                <SeasonTransfersCell manager={manager} label={t.seasonTransfers} extra={metric("seasonTransfers")} />
                <ChipsCell manager={manager} label={t.chips} />
                <TeamValueCell manager={manager} label={t.teamValue} award={valueAward} available={!data.rosterOnly} extra={metric("teamValue")} />
                <BenchPointsCell manager={manager} label={t.benchPoints} award={benchAward} available={!data.rosterOnly} autosubs={autosubs} extra={metric("benchPointsBeforeGw")} />
                <div className={`form-cell ${formAward ? "award-cell" : ""} ${formOpen === manager.id ? "form-open" : ""}`} data-label={t.form}>
                  {manager.form.length > 0 && <button
                    className="form-trigger"
                    aria-expanded={formOpen === manager.id}
                    aria-label={`${t.form}: ${t.lastFive}`}
                    onClick={(event) => { event.stopPropagation(); setFormOpen(formOpen === manager.id ? null : manager.id); }}
                  >
                    {/* The figure alone, and its colour says what the label used to: how it
                        stands against the average score of the very same gameweeks. */}
                    <strong className={`form-average tier-${formStanding.tier}`}>{Math.round(formAverage)}</strong>
                    {formStanding.delta !== null && <em
                      className={`form-delta tier-${formStanding.tier}`}
                      title={`${t.form} ${Math.round(formAverage)} · ${t.gameAverage} ${formStanding.benchmark} (GW${manager.formGameweeks.join(", ")})`}
                    >
                      {formStanding.delta === 0 ? "0" : `${formStanding.delta > 0 ? "+" : "−"}${Math.abs(formStanding.delta)}`}
                    </em>}
                  </button>}
                </div>
                {!planningPeriod && <><div className={`points-cell ${gwAward ? "award-cell" : ""} ${metric("gameweekPoints")}`} data-label={t.gwPoints}><span className={`gw-score ${manager.chip ? `has-chip ${chipClass(manager.chip)}` : ""} ${gwMedalRank ? `has-medal medal-rank-${gwMedalRank}` : ""}`}>{gwMedalRank && <Medal aria-label={language === "fi" ? `Kierroksen ${gwMedalRank}. paras` : `Gameweek rank ${gwMedalRank}`} />}<LiveNumber value={displayedGwPoints} />{manager.chip && <b>{manager.chip}</b>}</span><span className={`points-formula ${manager.hit > 0 ? "" : "empty"}`}>{manager.hit > 0 ? <>({manager.gameweekPoints + manager.provisionalBonus} <b>− {manager.hit}</b> = {displayedGwPoints})</> : " "}</span></div>
                <div className={`progress-cell ${metric("upcoming")}`} data-label={t.progress}><ManagerSelectionMarks selected={shownSelections} manager={manager} language={language} autosubs={autosubs} includeBench={!startersOnly} live={liveSelection} />{!data.rosterOnly && (progress.finished === progress.total && progress.live === 0 ? <strong className={data.pointsFinalized ? "is-final" : "is-provisional"}>{data.pointsFinalized ? t.fixtureFinal : t.fixtureProvisional}</strong> : <><span className={`progress-summary ${!liveSelection && shownSelections.length === 0 ? "progress-stacked" : ""}`}>({progress.finished}/{progress.total}){progress.live > 0 && <small> + <b>{progress.live}</b> LIVE</small>}</span></>)}</div></>}
                <div className="total-cell" data-label={period === "total" ? t.total : monthLabel(period)}><LiveNumber value={periodScores.get(manager.id) ?? null} format={number.format} /></div>
              </div>
              <SquadDisclosure open={open}>{data.rosterOnly
                ? <div className="squad-panel squad-unavailable">{language === "fi" ? "Pelaajat tulevat näkyviin, kun peliviikon deadline on sulkeutunut." : "Players will appear after the gameweek deadline has passed."}</div>
                : <Squad planning={planningPeriod ? data : undefined} onPlayer={(id) => setSelectedPlayer({ id, managerId: manager.id })} manager={manager} language={language} autosubs={autosubs} selections={shownSelections} />}</SquadDisclosure>
            </div>;
          })}
        </div>
      </section>;

  // The capture waits for .sc-card, so an unready card renders nothing rather than a half card.
  // liveManagers, not data.managers: FPL leaves `pick.multiplier` at 0 for a bench player
  // until it settles the fixture, so the stored gameweek total is short by whatever a
  // substitute has already scored. The table has read the corrected list since 24 Aug; the
  // cards never did, and went out all of GW1 without autosubs counted.
  if (cardKind) return liveReady && !liveError && !data.dataPending && !data.rosterOnly && liveManagers.length > 0 ? <ShareCard data={{ ...data, managers: liveManagers }} kind={cardKind} /> : <div className="sc-stage" />;

  // Names the sorted column for the compact phone card, which shows that figure and no
  // other. Absent at rest, so "no sort chosen" is a selector the CSS can test for.
  return <RumourContext.Provider value={marks}><LiveMotionContext.Provider value={motionFrame}><div className="app-shell" data-page={view} data-mobile-details={planningPeriod || mobileDetails ? "on" : "off"} data-sorted={planningPeriod || sort === "position" ? undefined : sort} data-screenshot={screenshotMode ? "true" : "false"}>
    <BackgroundPattern />
    <header className="topbar">
      <BrandLogo />
      {/* Two destinations do not earn a hamburger: hiding them costs a tap and an overlay
          for something that fits on the screen. The pair sits in the header on desktop and
          takes its own full-width row under it on a phone. */}
      <nav className="top-nav" aria-label={t.navTable}>
        <a href="#/" className={view === "table" ? "active" : ""} aria-current={view === "table" ? "page" : undefined}>{t.navTable}</a>
        <a href="#/hinnat" className={view === "prices" ? "active" : ""} aria-current={view === "prices" ? "page" : undefined}>{t.navPrices}</a>
        <a href="#/uutiset" className={view === "news" ? "active" : ""} aria-current={view === "news" ? "page" : undefined}>{t.navNews}</a>
        <a href="#/tilastot" className={view === "stats" ? "active" : ""} aria-current={view === "stats" ? "page" : undefined}>{t.navStats}</a>
      </nav>
      <div className="top-actions">
        {liveReady && <div className={`gameweek-status ${gameweekFixtures.length > 0 && !handedOver ? "has-fixture-menu" : ""}`}>
          <b>GW&nbsp;{shown.gameweek}</b>
          {deadlineMs > 0
            ? <span className="deadline"><Clock3 /><i className="deadline-full">{deadlineLabel}</i><i className="deadline-compact">{compactDeadlineLabel}</i></span>
            : gameweekIsLive
              ? <span className="gameweek-live"><i>{t.live}</i>{liveFixtures.length > 0 && <b>{liveFixtures.length}</b>}</span>
              : nextFixture
                ? <span className="deadline next-kickoff"><Clock3 /><small>{t.nextMatch}</small><i>{nextKickoffLabel}</i></span>
                : <span className={`gameweek-state ${data.pointsFinalized ? "is-final" : "is-provisional"}`}>{data.pointsFinalized ? t.fixtureFinal : t.fixtureProvisional}</span>}
          {gameweekFixtures.length > 0 && !handedOver && <MatchCentre fixtures={gameweekFixtures} played={playedFixtures.length} data={data} language={language} autosubs={autosubs} playerDetailsOpen={Boolean(selectedPlayer) || playerComparisonOpen} onPlayer={(id) => setSelectedPlayer({ id })} />}
        </div>}
        <button className="language-switch" type="button" onClick={() => setLanguage((value) => value === "fi" ? "en" : "fi")} aria-label={language === "fi" ? "Vaihda kieli englanniksi" : "Switch language to Finnish"}>
          <Globe className="language-globe" aria-hidden="true" />
          <span className={`language-option ${language === "fi" ? "active" : ""}`}>FI</span>
          <span className={`language-option ${language === "en" ? "active" : ""}`}>EN</span>
        </button>
      </div>
    </header>

    {liveReady && !liveError && !planningPeriod && !showPreviousRound && <Ticker data={data} language={language} autosubs={autosubs} demo={demoMode} onPlayer={(id) => setSelectedPlayer({ id })} />}
    {liveReady && !liveError && showPreviousRound && <div className="planning-deadline-band archive-band"><CalendarDays size={13} /><b>GW {data.gameweek} · {language === "fi" ? "Lopputilanne" : "Final standings"}</b>{planningDemo && <small>DEMO</small>}</div>}
    {liveReady && !liveError && planningPeriod && <div className="planning-deadline-band"><Clock3 size={13} /><b>GW {data.nextEvent?.gameweek} · {language === "fi" ? "Ennakko" : "Preview"}</b><span>{new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(data.nextEvent!.deadline))}</span>{planningDemo && <small>DEMO</small>}</div>}

    {demoMode && !planningDemo && <aside className="demo-notice"><strong>DEMO · {planningDemo ? "GW 25" : "LIVE"}</strong><span>{planningDemo ? language === "fi" ? "Kierrosten välinen näkymä · kuvitteelliset tiedot ja uutiset." : "Between-rounds view · fictional data and headlines." : language === "fi" ? "3 kuvitteellista ottelua käynnissä. Voit kokeilla Live-valintaa tai valita pelaajat itse." : "3 simulated matches in progress. Try Live or select players individually."}</span><a href={window.location.pathname}>{language === "fi" ? "Takaisin oikeisiin tietoihin" : "Back to real data"}</a></aside>}
    <main>{liveError ? <section className="data-pending data-error" role="alert">
      <strong>FPL DATA ERROR</strong>
      <span>{liveError}</span>
      <small>{language === "fi" ? "Uutta yritystä tehdään automaattisesti. Vanhentunutta tai demodataa ei näytetä." : "Retrying automatically. Stale or demo data is not shown."}</small>
    </section> : !liveReady ? <div className="initial-loading" aria-label={language === "fi" ? "Ladataan FPL-dataa" : "Loading FPL data"} />
      : view === "prices" ? <PriceChanges data={data} language={language} autosubs={autosubs} />
      : view === "news" ? <TeamNews data={data} language={language} />
      : view === "stats" ? <Stats onPlayer={(id) => setSelectedPlayer({ id })} onCompare={() => setPlayerComparisonOpen(true)} data={data} language={language} autosubs={autosubs} />
      : view === "sources" ? <Sources language={language} />
      : planningPeriod ? <PlanningDashboard data={{ ...data, managers: liveManagers }} language={language} demoArticles={planningDemo ? planningDemoArticles : undefined} onForm={setFormOpen} onCompare={() => setTeamComparisonOpen(true)} onPlayer={(id) => setSelectedPlayer({ id })} table={leagueTable} toolbar={tableToolbar} autosubs={autosubs} period={period} onPeriod={(value) => { setPeriod(value); setSort("position"); setDirection("asc"); }} sort={sort} onSort={(key) => handleSort(key as SortKey)} />
      : <>
      {tableToolbar}
      {archiveLoading && <div className="archive-status" role="status">{language === "fi" ? `Haetaan kierroksen ${archiveWeek} lopputilannetta…` : `Loading GW ${archiveWeek} final standings…`}</div>}
      {archiveError && <div className="archive-status" role="alert">{language === "fi" ? "Kierrosta ei saatu haettua. Näytössä on edellinen onnistuneesti ladattu tilanne." : "Could not load that gameweek. The last successfully loaded snapshot remains visible."}<button onClick={() => { setArchiveWeek(null); }}>{language === "fi" ? "Takaisin ennakkoon" : "Back to preview"}</button></div>}

      {/* The table's caption, phone only. A phone has no column headers to sort from and no
          room for the period select in the toolbar, so what the table is currently showing
          is said here in words, and the two pickers that can change it sit beside it. Both
          go quiet while a player is highlighted, because then the caption is about him. */}
      <div className="table-caption">
        <strong>
          {picking
            ? highlightSentence()
            : [period === "total" ? "Total" : monthLabel(period), sortLabel].filter(Boolean).join(" · ")}
        </strong>
        <div className="caption-picks">
          <label className={`caption-pick ${!picking && period !== "total" ? "chosen" : ""}`}>
            <CalendarDays aria-hidden="true" />
            <i>{t.month}</i>
            <select value={period} disabled={!!picking} onChange={(event) => { setPeriod(event.target.value); setSort("position"); setDirection("asc"); }} aria-label={t.month}>
              <option value="total">Total</option>
              {data.activeMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}
            </select>
          </label>
          <label className={`caption-pick ${!picking && sort !== "position" ? "chosen" : ""}`}>
            <ArrowUpDown aria-hidden="true" />
            <i>{t.sortBy}</i>
            <select
              value={sort}
              disabled={!!picking}
              /* The same default direction a header click picks, so the two agree. */
              onChange={(event) => {
                const key = event.target.value as SortKey;
                setSort(key);
                setDirection(key === "overallRank" || key === "position" ? "asc" : "desc");
              }}
              aria-label={t.sortBy}
            >
              {mobileSortOptions.map(([label, key]) => <option value={key} key={key}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {leagueTable}
    </>}</main>
    {livePlayersOpen && <LivePlayersModal data={data} selected={liveSelections} language={language} autosubs={autosubs} suspended={Boolean(selectedPlayer) || playerComparisonOpen} onClose={() => setLivePlayersOpen(false)} onPlayer={(id) => setSelectedPlayer({ id })} />}
    {formOpen !== null && liveManagers.some((manager) => manager.id === formOpen) && <ManagerFormModal manager={liveManagers.find((manager) => manager.id === formOpen)!} data={{ ...data, managers: liveManagers }} language={language} autosubs={autosubs} suspended={Boolean(selectedPlayer) || playerComparisonOpen} onClose={() => setFormOpen(null)} onPlayer={(id) => setSelectedPlayer({ id, managerId: formOpen })} />}
    {teamComparisonOpen && <TeamComparison initialTab={planningPeriod ? "results" : "squads"} demo={demoMode} data={{ ...data, managers: liveManagers }} language={language} suspended={Boolean(selectedPlayer) || playerComparisonOpen} onClose={() => setTeamComparisonOpen(false)} onPlayer={(id) => setSelectedPlayer({ id })} autosubs={autosubs} />}
    {selectedPlayer && !playerComparisonOpen && <PlayerModal key={`${selectedPlayer.managerId}:${selectedPlayer.id}`} onCompare={(id) => { setComparisonPlayerIds((ids) => ids.includes(id) ? ids : [...ids, id]); setPlayerComparisonOpen(true); }} selection={selectedPlayer} data={data} language={language} autosubs={autosubs} onClose={() => setSelectedPlayer(null)} />}
    {playerComparisonOpen && <PlayerComparison data={data} language={language} ids={comparisonPlayerIds} onIds={setComparisonPlayerIds} onClose={() => setPlayerComparisonOpen(false)} />}
    <footer>
      <span>Official FPL data</span>
      {liveReady && <span>{t.updated}: {updatedLabel}</span>}
      <span className="footer-separator" aria-hidden="true">•</span>
      <a className="footer-sources" href="#/lahteet">{t.navSources}</a>
      <span className="footer-separator" aria-hidden="true">•</span>
      <a className="footer-repository" href="https://github.com/jronimus/farmisarja-live" target="_blank" rel="noreferrer">
        <GitHubLogo />
        <span>farmisarja-live</span>
      </a>
    </footer>
  </div></LiveMotionContext.Provider></RumourContext.Provider>;
}
