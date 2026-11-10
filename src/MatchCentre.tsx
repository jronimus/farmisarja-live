import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Armchair, BarChart3, Check, ChevronDown, ChevronRight, Clock3, Footprints, Goal, Hand, ShieldCheck, Square, Star, Target, Users, X } from "lucide-react";
import { translations } from "./i18n";
import { ownersByPlayer, type PlayerOwner } from "./services/ownership";
import { fixtureHeading } from "./services/playerDetails";
import type { DashboardData, FixtureStatEntry, FixtureStatKey, GameweekFixture, Language, SquadPlayer } from "./types";
import "./playerModal.css";
import "./matchCentre.css";

const icon = { goals: Goal, ownGoals: Goal, assists: Footprints, cards: Square, bonus: Star, bps: BarChart3, defCon: ShieldCheck, saves: Hand, penalties: Target };
const reached = (entry: FixtureStatEntry) => entry.position !== undefined && entry.position !== "GK" && entry.value >= (entry.position === "DEF" ? 10 : 12);
const kit = (club: string, goalkeeper = false) => `${import.meta.env.BASE_URL}kits/${goalkeeper ? "optimized-gk" : "optimized"}/${club.toLowerCase()}.webp?v=20260823-gk3`;
const kickoffText = (fixture: GameweekFixture, language: Language, full = false) => Number.isFinite(Date.parse(fixture.kickoff))
  ? new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { weekday: "short", ...(full ? { day: "numeric", month: "numeric" } as const : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(fixture.kickoff))
  : language === "fi" ? "Aika vahvistamatta" : "Time to be confirmed";

export default function MatchCentre({ fixtures, played, data, language, autosubs, onPlayer, playerDetailsOpen = false }: {
  fixtures: GameweekFixture[]; played: number; data: DashboardData; language: Language; autosubs: boolean; onPlayer: (id: number) => void; playerDetailsOpen?: boolean;
}) {
  const t = translations(language);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const selected = fixtures.find((fixture) => fixture.id === selectedId);
  const closeMenu = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(460, window.innerWidth - 24);
      const top = box.bottom + 10;
      setPosition({ width, top, left: Math.max(12, Math.min(box.right - width, window.innerWidth - width - 12)), maxHeight: Math.max(100, window.innerHeight - top - 12) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const stateLabels = { upcoming: t.fixtureUpcoming, live: t.fixtureLive, provisional: t.fixtureProvisional, final: t.fixtureFinal };
  return <>
    <button ref={trigger} type="button" className="fixture-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? "gw-fixture-menu" : undefined} aria-label={t.fixtures} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
      {!data.pointsFinalized && <span className="fixture-count"><b>{played}/{fixtures.length}</b><small>{t.fixturesPlayed}</small></span>}<ChevronDown className={open ? "is-open" : ""} />
    </button>
    {open && createPortal(<div ref={menu} className="match-menu" id="gw-fixture-menu" role="menu" aria-label={t.fixtures} style={position} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
      if (event.key === "Tab") closeMenu();
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const current = items.findIndex((item) => item === document.activeElement);
      const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[index]?.focus();
    }}>
      <div className="match-menu-head" role="presentation"><b>GW {data.gameweek} · {t.fixtures}</b>{!data.pointsFinalized && <small>{played}/{fixtures.length} {t.fixturesPlayed}</small>}</div>
      {fixtures.map((fixture) => <button role="menuitem" className={`match-menu-row ${fixture.status}`} key={fixture.id} onClick={() => { setOpen(false); setSelectedId(fixture.id); }}>
        <span className="match-menu-teams"><b>{fixture.home}</b><span className="match-menu-score">{fixture.status === "upcoming" ? "–" : `${fixture.homeScore ?? 0}–${fixture.awayScore ?? 0}`}</span><b>{fixture.away}</b></span>
        <span className="match-menu-state">{fixture.status === "live" && <i />}{fixture.status === "upcoming" ? kickoffText(fixture, language) : stateLabels[fixture.status]}</span><ChevronRight size={13} />
      </button>)}
    </div>, document.querySelector(".app-shell") ?? document.body)}
    {selected && <MatchDetails key={selected.id} fixture={selected} data={data} language={language} autosubs={autosubs} suspended={playerDetailsOpen} onClose={() => { setSelectedId(null); trigger.current?.focus(); }} onPlayer={onPlayer} />}
  </>;
}

export function PlayerFace({ name, club, photoCode, position }: { name: string; club: string; photoCode?: number; position?: SquadPlayer["position"] }) {
  const [failed, setFailed] = useState(false);
  const portrait = Boolean(photoCode && !failed);
  return <span className={`match-player-face ${portrait ? "portrait" : "shirt"}`}><img alt="" referrerPolicy="no-referrer" src={portrait ? `https://resources.premierleague.com/premierleague25/photos/players/110x140/${photoCode}.png` : kit(club, position === "GK")} onError={portrait ? () => setFailed(true) : undefined} /></span>;
}

export function MatchDetails({ fixture, data, language, autosubs, onClose, onPlayer, suspended = false }: {
  fixture: GameweekFixture; data: DashboardData; language: Language; autosubs: boolean; onClose: () => void; onPlayer: (id: number) => void; suspended?: boolean;
}) {
  const fi = language === "fi";
  const t = translations(language);
  const dialog = useRef<HTMLDivElement>(null);
  const resumeFocus = useRef<HTMLElement | null>(null);
  const resumeScroll = useRef(0);
  const close = useRef(onClose); close.current = onClose;
  const openPlayer = (id: number) => {
    if (document.activeElement instanceof HTMLElement && dialog.current?.contains(document.activeElement)) resumeFocus.current = document.activeElement;
    resumeScroll.current = dialog.current?.querySelector(".match-details-body")?.scrollTop ?? 0;
    onPlayer(id);
  };
  useLayoutEffect(() => {
    if (suspended) return;
    const body = dialog.current?.querySelector(".match-details-body");
    if (body) body.scrollTop = resumeScroll.current;
  }, [suspended]);
  useEffect(() => {
    if (suspended) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (resumeFocus.current?.isConnected ? resumeFocus.current : dialog.current)?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close.current(); return; }
      if (event.key !== "Tab") return;
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]') ?? [])];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      if (document.activeElement instanceof HTMLElement && dialog.current?.contains(document.activeElement)) resumeFocus.current = document.activeElement;
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyboard);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [suspended]);
  const owners = useMemo(() => ownersByPlayer(data.managers, autosubs), [data.managers, autosubs]);
  const players = useMemo(() => {
    const byId = new Map(data.managers.flatMap((manager) => manager.squad).map((player) => [player.id, player]));
    for (const player of data.players ?? []) byId.set(player.id, player);
    return [...byId.values()];
  }, [data.players, data.managers]);
  const presentation = fixtureHeading(fixture, language);
  const statLabels: Record<FixtureStatKey, string> = { goals: t.statGoals, ownGoals: t.statOwnGoals, assists: t.statAssists, cards: t.statCards, bonus: t.statBonus, bps: t.statBps, defCon: t.statDefCon, saves: t.statSaves, penalties: t.statPenalties };
  const byClub = [fixture.home, fixture.away].map((club) => players.filter((player) => player.club === club && (owners.get(player.id)?.length ?? 0) > 0));
  const relevant = byClub[0].length + byClub[1].length;
  const categories = fixture.stats ?? [];
  const statusLabel = fixture.status === "live" ? "LIVE" : fixture.status === "upcoming" ? t.fixtureUpcoming : fixture.status === "final" ? t.fixtureFinal : t.fixtureProvisional;
  const entryIdentity = (entry: FixtureStatEntry) => entry.id ? players.find((player) => player.id === entry.id) : players.find((player) => player.name === entry.name && player.club === entry.club);
  const renderEntry = (entry: FixtureStatEntry, key: FixtureStatKey, index: number) => {
    const player = entryIdentity(entry);
    const playerId = entry.id ?? player?.id;
    const scored = key === "defCon" && reached(entry);
    const content = <><PlayerFace name={entry.name} club={entry.club} position={player?.position ?? entry.position} photoCode={entry.photoCode ?? player?.photoCode} /><span className="match-stat-player"><b>{entry.name}</b>{playerId && (owners.get(playerId)?.length ?? 0) > 0 && <small>{owners.get(playerId)!.length}/{data.managers.length} {fi ? "Farmisarjassa" : "in Farmisarja"}</small>}</span>
      {entry.variant === "yellow" || entry.variant === "red" ? <span className={`match-card-swatch ${entry.variant}`} aria-label={entry.variant === "yellow" ? fi ? "Keltainen kortti" : "Yellow card" : fi ? "Punainen kortti" : "Red card"}>{entry.value > 1 ? entry.value : ""}</span> : <strong className={`match-stat-value ${key === "bonus" ? "bonus" : ""} ${scored ? "defcon" : ""}`}>{entry.value}{scored && <Check size={12} />}{entry.variant === "saved" ? " ✓" : entry.variant === "missed" ? " ✕" : ""}</strong>}</>;
    return playerId && player ? <button className="match-stat-entry" key={`${playerId}:${entry.variant ?? index}`} onClick={() => openPlayer(playerId)} aria-label={`${entry.name}: ${fi ? "pelaajatiedot" : "player details"}`}>{content}</button> : <div className="match-stat-entry" key={`${entry.name}:${entry.variant ?? index}`}>{content}</div>;
  };
  return createPortal(<div className="player-modal-overlay match-details-overlay" hidden={suspended} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="player-modal match-details" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="match-details-title" tabIndex={-1}>
      <header className={`match-hero ${fixture.status}`}><div className="match-hero-top"><span>GW {data.gameweek} · {fi ? "Ottelutiedot" : "Match centre"}</span><button onClick={onClose} aria-label={fi ? "Sulje ottelutiedot" : "Close match details"}><X size={20} /></button></div>
        <h2 id="match-details-title" className="match-sr-only">{presentation.title}</h2>
        <div className="match-scoreboard"><div className="match-club"><img alt="" src={kit(fixture.home)} /><b>{fixture.homeName ?? fixture.home}</b><small>{fi ? "Koti" : "Home"}</small></div>
          <div className="match-score"><span className={`match-status ${fixture.status}`}>{fixture.status === "live" && <i />}{statusLabel}{fixture.status === "live" && fixture.minutes > 0 ? ` · ${fixture.minutes}′` : ""}</span><strong>{fixture.status === "upcoming" ? "VS" : `${fixture.homeScore ?? 0} : ${fixture.awayScore ?? 0}`}</strong><small><Clock3 size={11} />{kickoffText(fixture, language, true)}</small></div>
          <div className="match-club"><img alt="" src={kit(fixture.away)} /><b>{fixture.awayName ?? fixture.away}</b><small>{fi ? "Vieras" : "Away"}</small></div></div>
        <div className="match-hero-foot"><span><Users size={13} />{relevant} {fi ? "Farmisarjan pelaajavalintaa" : "players owned in Farmisarja"}</span><span>{fixture.status === "final" ? fi ? "Pisteet vahvistettu" : "Points confirmed" : fixture.status === "upcoming" ? fi ? "Odottaa aloitusta" : "Awaiting kickoff" : fi ? "Mukana livebonukset" : "Live bonus included"}</span></div>
      </header>
      <div className="match-details-body">
        {categories.length > 0 ? <div className="match-stat-grid">{categories.map((category) => {
          const Icon = icon[category.key];
          return <section className={`match-stat-card stat-${category.key}`} key={category.key}><h3><Icon size={16} />{statLabels[category.key]}</h3>
            {(category.key === "bps" || category.key === "defCon") && <p className="match-stat-explanation">{category.key === "bps" ? t.bpsNote : t.defConNote}</p>}
            <div className="match-stat-sides">{[fixture.home, fixture.away].map((club) => {
              const entries = category.entries.filter((entry) => entry.club === club);
              return <div className="match-stat-side" key={club}><h4>{club}<span>{fi ? club === fixture.home ? "Koti" : "Vieras" : club === fixture.home ? "Home" : "Away"}</span></h4><div className="match-stat-list">{entries.length ? entries.map((entry, i) => renderEntry(entry, category.key, i)) : <span className="match-stat-none">—</span>}</div></div>;
            })}</div>
          </section>;
        })}</div> : <section className="match-awaiting"><Clock3 size={25} /><h3>{fixture.status === "upcoming" ? fi ? "Ottelu ei ole vielä alkanut" : "The match has not started" : fi ? "Odotetaan ottelutilastoja" : "Waiting for match statistics"}</h3><p>{fi ? "Tilastot ja pelaajien tapahtumat päivittyvät tähän automaattisesti ottelun aikana." : "Statistics and player events will update here automatically during the match."}</p></section>}
        {relevant > 0 && <section className="match-league"><h3><Users size={16} />{fi ? "Farmisarjan valinnat" : "Farmisarja picks"}</h3><div className="match-league-sides">{byClub.map((side, i) => <div key={i}><h4>{i === 0 ? fixture.home : fixture.away}</h4>{side.map((player) => <div className="match-league-player" key={player.id}>
          <button onClick={() => openPlayer(player.id)}><PlayerFace name={player.name} club={player.club} photoCode={player.photoCode} position={player.position} /><b>{player.name}</b><strong className="match-league-points" aria-label={`${fi ? "Pisteet" : "Points"}: ${player.points + player.bonus}`}>{player.points + player.bonus}<small>{fi ? "p" : "pts"}</small></strong><ChevronRight size={12} /></button>
          <span>{(owners.get(player.id) as PlayerOwner[]).map((owner) => {
            const role = owner.benched ? "bench" : owner.tripleCaptain ? "triple" : owner.captain ? "captain" : "starter";
            const label = role === "bench" ? fi ? "Penkillä" : "Bench" : role === "triple" ? fi ? "Triplakapteeni" : "Triple captain" : role === "captain" ? fi ? "Kapteeni" : "Captain" : "";
            return <small className={`match-owner is-${role}`} key={owner.managerId} title={`${owner.teamName}${label ? ` · ${label}` : ""}`}>{owner.teamName}{label && <span role={role === "bench" ? "img" : undefined} aria-label={label}>{role === "bench" ? <Armchair size={11} aria-hidden="true" /> : role === "triple" ? "TC" : "C"}</span>}</small>;
          })}</span>
        </div>)}{!side.length && <p className="match-stat-explanation">{fi ? "Ei omistajia Farmisarjassa." : "No owners in Farmisarja."}</p>}</div>)}</div></section>}
      </div>
    </div>
  </div>, document.querySelector(".app-shell") ?? document.body);
}
