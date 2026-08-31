import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, ChevronDown, ChevronUp, Hand, RectangleVertical, Shield, Star, Volleyball, Zap } from "lucide-react";
import { translations } from "./i18n";
import { loadFeed, type EventKind, type FeedEvent } from "./services/liveFeed";
import { ownersByPlayer, type PlayerOwner } from "./services/ownership";
import type { DashboardData, Language } from "./types";

/**
 * Drawn icons, not emoji. Emoji are a different typeface on every platform, they ignore
 * the colour they are given, and at 12px on a dark strip half of them came out as grey
 * smudges. These are the same line icons the rest of the app uses and they take a colour.
 */
const ICONS: Record<EventKind, typeof Volleyball> = {
  goal: Volleyball, assist: Zap, own_goal: Ban, yellow: RectangleVertical, red: RectangleVertical,
  penalty_save: Hand, penalty_miss: Ban, save_point: Hand, defcon: Shield, bonus: Star,
};

function EventIcon({ kind }: { kind: EventKind }) {
  const Glyph = ICONS[kind];
  return <i className={`ticker-icon icon-${kind}`} aria-hidden="true"><Glyph /></i>;
}

/** Bonus moves by a point at a time and moves back again; it is the noise in this feed. */
const LOW_IMPACT: EventKind[] = ["bonus"];

function kindLabel(kind: EventKind, language: Language) {
  const fi: Record<EventKind, string> = {
    goal: "MAALI", assist: "SYÖTTÖ", own_goal: "OMA MAALI", yellow: "Keltainen", red: "PUNAINEN",
    penalty_save: "Pilkkutorjunta", penalty_miss: "Pilkku ohi", save_point: "Torjunnat", defcon: "DEFCON", bonus: "Bonus",
  };
  const en: Record<EventKind, string> = {
    goal: "GOAL", assist: "ASSIST", own_goal: "OWN GOAL", yellow: "Yellow", red: "RED",
    penalty_save: "Penalty save", penalty_miss: "Penalty missed", save_point: "Saves", defcon: "DEFCON", bonus: "Bonus",
  };
  return (language === "fi" ? fi : en)[kind];
}

/**
 * A bonus line says which place the player moved between, because the figure alone is
 * ambiguous: three points after two reads as five gained, and a fall from three to two
 * reads as a gain when the player has just been overtaken.
 */
function BonusShift({ event }: { event: FeedEvent }) {
  if (event.kind !== "bonus" || event.previous === undefined) return null;
  return <i className={`ticker-shift ${event.pointsDelta < 0 ? "down" : "up"}`}>
    <s>{event.previous}</s><em>→</em><b>{event.value}</b>
  </i>;
}

function Owners({ owners }: { owners: PlayerOwner[] }) {
  if (!owners.length) return null;
  return <span className="ticker-owners">
    {owners.map((owner) => <b
      key={owner.managerId}
      className={owner.captain ? "is-captain" : ""}
      title={`${owner.teamName} · ${owner.managerName}`}
    >{owner.teamName}</b>)}
  </span>;
}

function Item({ event, owners, language, fresh }: { event: FeedEvent; owners: PlayerOwner[]; language: Language; fresh?: boolean }) {
  const scored = event.kind === "goal" || event.kind === "assist";
  return <span className={`ticker-item kind-${event.kind} ${fresh ? "is-fresh" : ""}`}>
    {/* A goal or an assist is about the tie, so the tie leads and its score comes with it,
        the player's half of both set in bold. Anything else is about the player, and then
        naming his club is enough — and it is named properly rather than in three letters. */}
    {!scored && <i className="ticker-club">{event.clubName ?? event.club}</i>}
    {scored && event.fixture && <i className="ticker-fixture">
      <b className={event.fixture.home === event.club ? "is-own" : ""}>{event.fixture.home}</b>
      {/* The figure that just moved is set with the club it belongs to. */}
      <em>
        <s className={event.fixture.home === event.club ? "is-own" : ""}>{event.fixture.homeScore}</s>
        –
        <s className={event.fixture.away === event.club ? "is-own" : ""}>{event.fixture.awayScore}</s>
      </em>
      <b className={event.fixture.away === event.club ? "is-own" : ""}>{event.fixture.away}</b>
    </i>}
    <EventIcon kind={event.kind} />
    <b>{kindLabel(event.kind, language)}</b>
    <span className="ticker-player">{event.player}</span>
    <BonusShift event={event} />
    {event.pointsDelta !== 0 && <u className={event.pointsDelta > 0 ? "up" : "down"}>{event.pointsDelta > 0 ? "+" : "−"}{Math.abs(event.pointsDelta)}</u>}
    <Owners owners={owners} />
  </span>;
}

export default function Ticker({ data, language, autosubs, demo }: { data: DashboardData; language: Language; autosubs: boolean; demo?: boolean }) {
  const t = translations(language);
  const [events, setEvents] = useState<FeedEvent[] | null>(data.feed ?? null);
  const [open, setOpen] = useState(false);
  const [hideLowImpact, setHideLowImpact] = useState(true);
  const [onlyOurs, setOnlyOurs] = useState(false);
  // Which lines arrived on the last poll, so an arrival can announce itself. Null until the
  // first read: everything already in the log when the page opens is history, not news.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);

  const owners = useMemo(() => ownersByPlayer(data.managers, autosubs), [data.managers, autosubs]);
  const ownersFor = (element: number) => owners.get(element) ?? [];

  // Demo only: a live gameweek is the only other way to watch a line arrive, and there is
  // not one most of the week. One every fifteen seconds is enough to see the behaviour.
  useEffect(() => {
    if (!demo) return;
    const kinds: EventKind[] = ["goal", "assist", "yellow", "defcon", "save_point", "red"];
    const timer = window.setInterval(() => setEvents((current) => {
      const source = (current ?? [])[Math.floor(Math.random() * Math.max(1, (current ?? []).length))];
      if (!source) return current;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      return [{
        ...source,
        id: `demo-live-${Date.now()}`,
        at: new Date().toISOString(),
        kind,
        pointsDelta: kind === "yellow" ? -1 : kind === "red" ? -3 : kind === "goal" ? 6 : 3,
      }, ...(current ?? [])];
    }), 15_000);
    return () => window.clearInterval(timer);
  }, [demo]);

  useEffect(() => {
    if (data.feed) return; // demo data brings its own
    let active = true;
    const read = async () => {
      try {
        const next = await loadFeed(data.gameweek);
        if (active && next) setEvents(next);
      } catch {
        // A feed that cannot be read is not worth breaking the page over.
      }
    };
    read();
    // Twenty seconds, against a feed the Worker rewrites every two minutes. Reading three
    // times per write sounds wasteful and is not: the response carries fifteen seconds of
    // edge cache, so however many people are watching, the Worker itself is asked about four
    // times a minute. What it buys is the tail — a line written at 20:15:00 used to be able
    // to sit unread until 20:16:00, and now the wait is a third of that.
    const timer = window.setInterval(read, 20_000);
    window.addEventListener("focus", read);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", read); };
  }, [data.gameweek, data.feed]);

  useEffect(() => {
    if (!events) return;
    const ids = events.map((event) => event.id);
    if (seen.current === null) { seen.current = new Set(ids); return; }
    const arrived = ids.filter((id) => !seen.current!.has(id));
    for (const id of ids) seen.current.add(id);
    if (!arrived.length) return;
    setFresh(arrived);
    const timer = window.setTimeout(() => setFresh([]), 25_000);
    return () => window.clearTimeout(timer);
  }, [events]);

  const visible = useMemo(() => (events ?? []).filter((event) => {
    if (hideLowImpact && LOW_IMPACT.includes(event.kind) && Math.abs(event.pointsDelta) < 2) return false;
    if (onlyOurs && !ownersFor(event.element).length) return false;
    return true;
  }), [events, hideLowImpact, onlyOurs, owners]);

  const live = data.managers.some((manager) => manager.live > 0);

  // The bar stays, whatever the answer was. A feed that cannot be read, a log that is
  // empty and a gameweek with no football left all look the same from here, and a strip
  // that says it is waiting is more use than one that silently is not there.
  return <div className={`ticker ${open ? "is-open" : ""}`}>
    <div className="ticker-bar">
      <span className={`ticker-badge ${live ? "is-live" : ""}`}>{live ? t.live : t.feed}</span>
      <div className="ticker-window">
        {visible.length
          // Standing still, newest at the left. A line that is always moving is a line you
          // cannot read, and the one thing worth noticing here — that something just
          // happened — is exactly what constant motion hides.
          ? <div className="ticker-track">
            {visible.slice(0, 24).map((event) => <Item
              key={event.id}
              event={event}
              owners={ownersFor(event.element)}
              language={language}
              fresh={fresh.includes(event.id)}
            />)}
          </div>
          : <span className="ticker-empty">{t.feedWaiting}</span>}
      </div>
      <button className="ticker-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={t.feedAll}>
        {open ? <ChevronUp /> : <ChevronDown />}
      </button>
    </div>

    {open && <div className="ticker-panel">
      <div className="ticker-controls">
        <label><input type="checkbox" checked={hideLowImpact} onChange={(event) => setHideLowImpact(event.target.checked)} /> {t.feedHideLowImpact}</label>
        <label><input type="checkbox" checked={onlyOurs} onChange={(event) => setOnlyOurs(event.target.checked)} /> {t.feedOnlyOurs}</label>
        <span className="ticker-count">{visible.length}</span>
      </div>
      <div className="ticker-list">
        {visible.map((event) => {
          const held = ownersFor(event.element);
          return <div className="ticker-row" key={event.id}>
            <EventIcon kind={event.kind} />
            <div className="ticker-headline">
              {/* The figure belongs to the event, so it sits with it rather than out at the
                  far edge of the row where the eye has to travel back to pair them up. The
                  match minute is gone: it was the minute the feed noticed, not the minute
                  the goal went in, and FPL publishes no time to put there instead. */}
              <b>
                {kindLabel(event.kind, language)} — {event.player}
                <BonusShift event={event} />
                {event.pointsDelta !== 0 && <u className={event.pointsDelta > 0 ? "up" : "down"}>{event.pointsDelta > 0 ? "+" : "−"}{Math.abs(event.pointsDelta)}</u>}
              </b>
              <small>
                {new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.at))}
                {event.fixture && ` · ${event.fixture.home} ${event.fixture.homeScore}–${event.fixture.awayScore} ${event.fixture.away}`}
              </small>
              <Owners owners={held} />
            </div>
          </div>;
        })}
        {!visible.length && <div className="ticker-empty-list">{t.feedWaiting}</div>}
      </div>
    </div>}
  </div>;
}
