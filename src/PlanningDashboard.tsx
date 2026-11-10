import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Newspaper, Sparkles, Trophy, Flame, CalendarDays, ShieldAlert } from "lucide-react";
import type { DashboardData, Language } from "./types";
import { loadArticles, type Article } from "./services/articles";
import PriceSummaryModal from "./PriceSummaryModal";
import PlanningDenseRows from "./PlanningDenseRows";
import { ownersByPlayer } from "./services/ownership";
import { PlayerFace } from "./MatchCentre";
import { loadRecentPlayerMatches } from "./services/formHistory";
import { planningHighlights } from "./services/planning";
import "./planning.css";

export default function PlanningDashboard({ data, language, demoArticles, onForm, onPlayer, table, toolbar, autosubs = true }: {
  data: DashboardData; language: Language; demoArticles?: Article[]; onForm: (id: number) => void; onCompare: () => void; onPlayer: (id: number) => void; autosubs?: boolean; table: ReactNode; toolbar: ReactNode; period: string; onPeriod: (value: string) => void; sort: string; onSort: (value: string) => void;
}) {
  const fi = language === "fi";
  const [articles, setArticles] = useState<Article[] | null>(demoArticles ?? null);
  const [failed, setFailed] = useState(false);
  const [mobileView, setMobileView] = useState<"table" | "preview">("table");
  const [slide, setSlide] = useState(0);
  const [priceSummaryOpen, setPriceSummaryOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recent, setRecent] = useState(data.recentPlayerMatches);
  const clock = useRef<HTMLDivElement>(null);
  const rotatingCard = useRef<HTMLElement>(null);
  const previousHighlight = useRef<string | undefined>(undefined);
  const elapsed = useRef(0);
  const highlights = useMemo(() => planningHighlights({ ...data, recentPlayerMatches:recent ?? data.recentPlayerMatches }, language), [data, language, recent]);
  const active = highlights[slide % Math.max(1, highlights.length)];
  useLayoutEffect(() => {
    const changed = previousHighlight.current !== undefined && previousHighlight.current !== active?.id;
    previousHighlight.current = active?.id;
    const card = rotatingCard.current;
    if (!changed || !card || matchMedia("(prefers-reduced-motion: reduce), (max-width:800px)").matches) return;
    // Animate only the new content. The clock, controls and card geometry stay anchored.
    const content = [card.querySelector(".planning-spotlight-top > span"), ...Array.from(card.children).filter(element => !element.matches(".planning-spotlight-top,.planning-carousel-controls"))].filter((element): element is Element => element !== null);
    const animations = content.map((element,index) => element.animate([
      { opacity:0, transform:"translateX(10px)" },
      { opacity:1, transform:"translateX(0)" },
    ], { duration:380, delay:Math.min(index*25,75), easing:"cubic-bezier(.2,.7,.2,1)", fill:"backwards" }));
    return () => animations.forEach(animation=>animation.cancel());
  },[active?.id]);
  useEffect(() => {
    if (data.recentPlayerMatches) { setRecent(data.recentPlayerMatches); return; }
    let active = true;
    const date=new Date(data.deadline), season=String(date.getUTCFullYear()-(date.getUTCMonth()<6?1:0));
    void loadRecentPlayerMatches(data.gameweek,season,data.fixtureKickoffs).then(scores=>{if(active) setRecent(scores);}).catch(()=>{ /* Hide the scored suggestions if their match history is unavailable. */ });
    return ()=>{active=false;};
  },[data.gameweek,data.deadline,data.recentPlayerMatches]);
  useEffect(() => {
    if (demoArticles) return;
    let active = true;
    const refresh = () => loadArticles().then((body) => { if (active) { setFailed(false); setArticles(body?.articles ?? []); } }).catch(() => { if (active) { setFailed(true); setArticles((previous) => previous ?? []); } });
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30 * 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [demoArticles]);
  useEffect(() => { elapsed.current = 0; clock.current?.style.setProperty("--carousel-progress", "0"); }, [slide]);
  useEffect(() => {
    if (paused || priceSummaryOpen || highlights.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let previous = performance.now();
    let frame = 0;
    const resetClock = () => { previous = performance.now(); };
    const tick = (now: number) => {
      const delta = now - previous;
      previous = now;
      if (!document.hidden && !matchMedia("(max-width:800px)").matches) {
        elapsed.current = Math.min(15_000, elapsed.current + delta);
        clock.current?.style.setProperty("--carousel-progress", String(elapsed.current / 15_000));
        if (elapsed.current >= 15_000) { elapsed.current = 0; setSlide((value) => (value + 1) % highlights.length); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", resetClock);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", resetClock); };
  }, [paused, priceSummaryOpen, highlights.length, slide]);
  const latest = [...(articles ?? [])].sort((a, b) => Date.parse(b.published) - Date.parse(a.published)).slice(0, 4);
  const renderHighlight = (highlight: typeof highlights[number], rotating: boolean) => {
    const spotlightClub = highlight.club?.code;
    const SpotlightIcon = highlight.id === "round" ? Trophy : highlight.id === "form" || highlight.id === "unowned" ? Flame : highlight.id === "availability" ? ShieldAlert : CalendarDays;
    const denseRow = (row: typeof highlight.rows[number]) => {
      const player = data.players?.find(player=>player.id===row.playerId);
      return <div className="planning-dense-row" key={row.playerId}>
        <button className="planning-dense-player" onClick={()=>row.playerId && onPlayer(row.playerId)}>{player && <PlayerFace name={player.name} club={player.club} position={player.position} photoCode={player.photoCode} />}<span><b>{row.name}</b><small>{row.detail}</small></span></button>
        <div className="planning-dense-score"><strong className={row.direction ?? ""}>{row.uncertain ? "~" : ""}{row.value}</strong></div>
        {!!row.owners?.length && <div className="planning-dense-owners">{row.owners.map(name=><span key={name}>{name}</span>)}</div>}
      </div>;
    };
    return <section ref={rotating ? rotatingCard : undefined} className={`planning-spotlight ${rotating ? "rotating" : "static"} tone-${highlight.tone} highlight-${highlight.id} ${highlight.compact ? "dense" : ""} ${highlight.hero ? "hero" : ""}`} aria-label={fi ? "Farmisarjan nostot" : "Farmisarja highlights"}>
      <div className="planning-spotlight-top"><span><Sparkles size={13} />{highlight.label}</span>{rotating && <div className="planning-carousel-clock" ref={clock}><button className="planning-clock-ball" aria-label={paused?fi?"Jatka nostoja":"Resume highlights":fi?"Pysäytä nostot":"Pause highlights"} aria-pressed={paused} title={paused?fi?"Jatka":"Resume":fi?"Pysäytä":"Pause"} onClick={()=>setPaused(!paused)}><img src={`${import.meta.env.BASE_URL}branding/fs-logo-v9-7.svg`} alt=""/>{paused && <Pause className="planning-ball-paused" size={11}/>}</button></div>}</div>
      <div className="planning-spotlight-title"><h2>{highlight.title}</h2>{spotlightClub ? <img className="planning-club-shirt" src={`${import.meta.env.BASE_URL}kits/optimized/${spotlightClub.toLowerCase()}.webp?v=20260823-gk3`} alt={spotlightClub} /> : <SpotlightIcon className="planning-spotlight-symbol" size={42} strokeWidth={1.4} />}</div>
      {highlight.note && <p className="planning-highlight-note">{highlight.note}</p>}
      {highlight.fixtures && <div className="planning-fixture-strip" aria-label={fi ? "Tuleva otteluohjelma" : "Upcoming fixtures"}>{highlight.fixtures.map((fixture,index)=><div key={`${fixture.gameweek}:${index}`} className={`difficulty-${fixture.difficulty}`} title={`${fixture.opponentName} · ${fi?"Vaikeustaso":"Difficulty"} ${fixture.difficulty}/5`}><small>GW {fixture.gameweek}</small><span><b>{fixture.opponent}</b><i>{fi ? fixture.venue === "H" ? "Koti" : "Vieras" : fixture.venue === "H" ? "Home" : "Away"}</i></span><em>{fixture.difficulty}</em></div>)}</div>}
      {highlight.action === "prices" ? <>
        <div className="planning-price-columns">{(["rise","fall"] as const).map(direction=><section key={direction} className={`planning-price-${direction}`}><h3>{direction==="rise"?fi?"Nousijat":"Risers":fi?"Laskijat":"Fallers"}</h3>{highlight.rows.some(row=>row.direction===direction) && <PlanningDenseRows fit={rotating} rows={highlight.rows.filter(row=>row.direction===direction).map(denseRow)} />}{!highlight.rows.some(row=>row.direction===direction) && <small>{fi?"Ei ennusteita":"None forecast"}</small>}</section>)}</div>
        <button className="planning-view-prices" onClick={()=>setPriceSummaryOpen(true)}>{fi?"Koko hintaennuste":"Full price forecast"}<ChevronRight size={13}/></button>
      </> : highlight.compact ? <>
        {highlight.metric && <div className="planning-dense-columns"><span>{fi?"Pelaaja":"Player"}</span><span>{highlight.metric==="ownership"?"FPL %":fi?"Pisteet":"Points"}</span></div>}
        <PlanningDenseRows key={highlight.id} fit={rotating} count={rotating && highlight.metric === "ownership" ? 5 : undefined} rows={highlight.rows.map(denseRow)} />
      </> : highlight.hero ? <div className="planning-podium">{highlight.rows.map((row,index)=><button key={row.managerId} onClick={()=>row.managerId && onForm(row.managerId)}><span className={`planning-podium-rank rank-${index+1}`}>{index+1}</span><span className="planning-podium-name"><b>{row.name}</b><small>{row.detail}</small></span><strong>{row.value}</strong></button>)}</div> : <PlanningDenseRows key={highlight.id} className="planning-highlight-rows" fit={rotating} rows={highlight.rows.map(row=>{
        const player=row.playerId?data.players?.find(player=>player.id===row.playerId):null;
        return <button key={row.name} title={row.detail} onClick={()=>row.playerId?onPlayer(row.playerId):row.managerId?onForm(row.managerId):undefined}>
          {player?<PlayerFace name={player.name} club={player.club} position={player.position} photoCode={player.photoCode}/>:!highlight.hero && <span className="planning-team-mark"><SpotlightIcon size={20}/></span>}
          <span className="planning-highlight-copy"><b>{row.name}</b><small>{row.detail}</small></span><strong>{row.value}{highlight.hero && <small>{highlight.note}</small>}</strong>
        </button>;
      })} />}
      {rotating && <div className="planning-carousel-controls"><button onClick={()=>setSlide((slide+highlights.length-1)%highlights.length)} aria-label={fi?"Edellinen nosto":"Previous highlight"}><ChevronLeft size={16}/></button><div>{highlights.map((item,index)=><button key={item.id} aria-label={item.title} aria-pressed={highlight.id===item.id} onClick={()=>setSlide(index)}/>)}</div><button onClick={()=>setSlide((slide+1)%highlights.length)} aria-label={fi?"Seuraava nosto":"Next highlight"}><ChevronRight size={16}/></button></div>}

    </section>;
  };
  return <section className="planning-dashboard" data-mobile-view={mobileView}>
    {toolbar}
    <div className="planning-mobile-tabs" role="group" aria-label={fi ? "Taulukkosivun näkymä" : "Table page view"}>
      <button aria-pressed={mobileView === "table"} onClick={() => setMobileView("table")}>{fi ? "Taulukko" : "Table"}</button>
      <button aria-pressed={mobileView === "preview"} onClick={() => setMobileView("preview")}>{fi ? "Kierrosennakko" : "Gameweek preview"}</button>
    </div>
    <div className="planning-layout"><div className="planning-table-panel">

      {table}
    </div><aside className="planning-sidebar">
      <section className="planning-news"><header><h2><Newspaper size={16} />{fi ? "Uusimmat uutiset" : "Latest news"}</h2><a href="#/uutiset">{fi ? "Kaikki" : "All"}<ChevronRight size={12} /></a></header>{articles === null ? <p>{fi ? "Ladataan uutisia…" : "Loading news…"}</p> : latest.length ? latest.map((article) => <a className="planning-article" key={article.id} href={article.url} target={demoArticles ? undefined : "_blank"} rel="noopener noreferrer"><b>{article.title}</b><small>{article.source} · {new Intl.DateTimeFormat(fi ? "fi-FI" : "en-GB", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(article.published))}</small></a>) : <p>{failed ? fi ? "Uutisia ei voitu ladata." : "News could not be loaded." : fi ? "Ei uusia artikkeleita juuri nyt." : "No articles right now."}</p>}</section>
      {active && renderHighlight(active, true)}
      <div className="planning-static-highlights">{highlights.map((highlight) => <div key={highlight.id}>{renderHighlight(highlight, false)}</div>)}</div>
    </aside></div>
    {priceSummaryOpen && data.prices && <PriceSummaryModal market={data.prices} owners={ownersByPlayer(data.managers, autosubs)} language={language} now={Date.now()} onClose={() => setPriceSummaryOpen(false)} />}
  </section>;
}
