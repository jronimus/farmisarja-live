import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { translations } from "./i18n";
import { loadFeed, type EventKind, type FeedEvent } from "./services/liveFeed";
import { ownersByPlayer, type PlayerOwner } from "./services/ownership";
import type { DashboardData, Language } from "./types";

const ICONS: Record<EventKind, string> = {
  goal: "⚽", assist: "🅰", own_goal: "🥅", yellow: "🟨", red: "🟥",
  penalty_save: "🧤", penalty_miss: "❌", save_point: "🧤", defcon: "🛡", bonus: "⭐",
};

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

function Item({ event, owners, language }: { event: FeedEvent; owners: PlayerOwner[]; language: Language }) {
  const clock = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(event.at));
  return <span className={`ticker-item kind-${event.kind}`}>
    <i className="ticker-clock">{clock}</i>
    <i className="ticker-icon" aria-hidden="true">{ICONS[event.kind]}</i>
    <b>{kindLabel(event.kind, language)}</b>
    <span className="ticker-player">{event.player}</span>
    {event.pointsDelta !== 0 && <u className={event.pointsDelta > 0 ? "up" : "down"}>{event.pointsDelta > 0 ? "+" : "−"}{Math.abs(event.pointsDelta)}</u>}
    <Owners owners={owners} />
  </span>;
}

export default function Ticker({ data, language, autosubs }: { data: DashboardData; language: Language; autosubs: boolean }) {
  const t = translations(language);
  const [events, setEvents] = useState<FeedEvent[] | null>(data.feed ?? null);
  const [open, setOpen] = useState(false);
  const [hideLowImpact, setHideLowImpact] = useState(true);
  const [onlyOurs, setOnlyOurs] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  const owners = useMemo(() => ownersByPlayer(data.managers, autosubs), [data.managers, autosubs]);
  const ownersFor = (element: number) => owners.get(element) ?? [];

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
    const timer = window.setInterval(read, 60_000);
    window.addEventListener("focus", read);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", read); };
  }, [data.gameweek, data.feed]);

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
          // The track is rendered twice so the loop has no seam. Hovering stops it, and
          // prefers-reduced-motion stops it for good in CSS.
          ? <div className="ticker-track" ref={track} style={{ animationDuration: `${Math.max(30, visible.length * 6)}s` }}>
            {[0, 1].map((copy) => <div className="ticker-run" key={copy} aria-hidden={copy === 1}>
              {visible.slice(0, 24).map((event) => <Item key={`${copy}-${event.id}`} event={event} owners={ownersFor(event.element)} language={language} />)}
            </div>)}
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
          return <div className={`ticker-row ${held.length ? "is-held" : ""}`} key={event.id}>
            <i className="ticker-icon" aria-hidden="true">{ICONS[event.kind]}</i>
            <div className="ticker-headline">
              <b>{kindLabel(event.kind, language)} — {event.player}</b>
              <small>
                {new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.at))}
                {event.fixture && ` · ${event.fixture.home}–${event.fixture.away} · ${event.fixture.homeScore}–${event.fixture.awayScore} · ${event.fixture.minutes}'`}
              </small>
              <Owners owners={held} />
            </div>
            {event.pointsDelta !== 0 && <u className={event.pointsDelta > 0 ? "up" : "down"}>{event.pointsDelta > 0 ? "+" : "−"}{Math.abs(event.pointsDelta)}</u>}
          </div>;
        })}
        {!visible.length && <div className="ticker-empty-list">{t.feedWaiting}</div>}
      </div>
    </div>}
  </div>;
}
