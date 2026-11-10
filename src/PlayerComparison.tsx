import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Scale, Search, X } from "lucide-react";
import { COMPARISON_METRICS, comparisonPlayers, comparisonTones, type ComparisonPlayer } from "./services/playerComparison";
import type { DashboardData, Language } from "./types";
import "./playerModal.css";
import "./playerComparison.css";

function Portrait({ player }: { player: ComparisonPlayer }) {
  const [failed, setFailed] = useState(false);
  const portrait = player.photoCode && !failed;
  return <span className={`player-comparison-avatar ${portrait ? "portrait" : ""}`}><img alt="" referrerPolicy="no-referrer" onError={portrait ? () => setFailed(true) : undefined} src={portrait ? `https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.photoCode}.png` : `${import.meta.env.BASE_URL}kits/${player.position === "GK" ? "optimized-gk" : "optimized"}/${player.club.toLowerCase()}.webp?v=20260823-gk3`} /></span>;
}

export default function PlayerComparison({ data, language, ids, onIds, onClose }: {
  data: DashboardData; language: Language; ids: number[]; onIds: (ids: number[]) => void; onClose: () => void;
}) {
  const fi = language === "fi";
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [adding, setAdding] = useState(ids.length < 2);
  const dialog = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]') ?? [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, []);
  useEffect(() => { if (adding) searchInput.current?.focus(); }, [adding]);
  const catalogue = useMemo(() => comparisonPlayers(data), [data.players, data.prices, data.managers]);
  const players = ids.map((id) => catalogue.find((p) => p.id === id)).filter((p): p is ComparisonPlayer => Boolean(p));
  const stats = new Map((data.playerStats ?? []).map((s) => [s.id, s]));
  const term = search.trim().toLocaleLowerCase();
  const results = catalogue.filter((p) => !ids.includes(p.id) && (!position || p.position === position) && `${p.name} ${p.club}`.toLocaleLowerCase().includes(term));
  const groups = [["points", "Pisteet ja peliaika", "Points & playing time"], ["attack", "Hyökkäys", "Attack"], ["defence", "Puolustus", "Defence"], ["discipline", "Kortit ja virheet", "Cards & errors"]] as const;
  const add = (id: number) => { onIds([...ids, id]); setSearch(""); searchInput.current?.focus(); };
  const remove = (id: number) => { onIds(ids.filter((value) => value !== id)); addButton.current?.focus(); };
  return createPortal(<div className="player-modal-overlay player-comparison-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="player-modal player-comparison-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="player-comparison-title" tabIndex={-1}>
      <header className="player-modal-head"><div><small>{fi ? "FPL · Kausitilastot" : "FPL · Season statistics"}</small><h2 id="player-comparison-title"><Scale size={23} />{fi ? "Pelaajavertailu" : "Player comparison"}</h2></div><button onClick={onClose} aria-label={fi ? "Sulje pelaajavertailu" : "Close player comparison"}><X size={21} /></button></header>
      <div className="player-comparison-toolbar"><button ref={addButton} className="player-add-toggle" aria-expanded={adding} onClick={() => setAdding(!adding)}><Plus size={16} />{fi ? "Lisää pelaajia" : "Add players"}</button><span>{players.length} {fi ? "pelaajaa" : "players"}</span><div className="player-comparison-legend"><span className="best">{fi ? "Paras" : "Best"}</span><span className="worst">{fi ? "Heikoin" : "Lowest"}</span><span>{fi ? "Tasatulos = neutraali" : "Ties = neutral"}</span></div></div>
      {adding && <div className="player-comparison-picker"><div className="player-comparison-search"><label><Search size={16} /><input ref={searchInput} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={fi ? "Hae pelaajaa tai seuraa" : "Search player or club"} aria-label={fi ? "Lisää pelaaja vertailuun" : "Add player to comparison"} /></label><select value={position} onChange={(e) => setPosition(e.target.value)} aria-label={fi ? "Pelipaikka" : "Position"}><option value="">{fi ? "Kaikki pelipaikat" : "All positions"}</option>{["GK", "DEF", "MID", "FWD"].map((p) => <option key={p}>{p}</option>)}</select><button className="player-add-toggle" onClick={() => { setAdding(false); addButton.current?.focus(); }}>{fi ? "Valmis" : "Done"}</button></div>
        <div className="player-comparison-results">{results.slice(0, 24).map((p) => <button key={p.id} onClick={() => add(p.id)}><span><b>{p.name}</b><small>{p.club} · {p.position} · £{p.cost.toFixed(1)}m</small></span><Plus size={15} /></button>)}{!results.length && <p>{fi ? "Ei hakutuloksia." : "No results."}</p>}</div><small className="player-comparison-result-count">{Math.min(24, results.length)} / {results.length} · {fi ? "Rajaa hakua löytääksesi lisää pelaajia." : "Narrow the search to find more players."}</small></div>}
      <div className="player-comparison-content">
        {players.length < 2 && <p className="player-comparison-note" role="status">{fi ? "Valitse vähintään kaksi pelaajaa. Voit lisätä useampia pelaajia rinnakkain." : "Choose at least two players. You can add more to compare side by side."}</p>}
        {players.length > 0 && <div className="player-comparison-scroll" tabIndex={0} aria-label={fi ? "Kausitilastot rinnakkain, vieritä sivulle" : "Season statistics side by side, scroll horizontally"}><table className="player-comparison-table"><thead><tr><th scope="col">{fi ? "Kauden tilasto" : "Season statistic"}</th>{players.map((p) => <th scope="col" key={p.id}><div className="player-comparison-heading"><Portrait key={p.id} player={p} /><button className="player-comparison-remove" onClick={() => remove(p.id)} aria-label={`${fi ? "Poista" : "Remove"} ${p.name}`}><X size={14} /></button><b>{p.name}</b><small>{p.club} · {p.position} · £{p.cost.toFixed(1)}m</small></div></th>)}</tr></thead>
          {groups.map(([group, fin, en]) => <GroupRows key={group} group={group} title={fi ? fin : en} players={players} stats={stats} language={language} />)}
        </table></div>}
      </div>
      <div className="player-comparison-footer">{fi ? "Koko kausi · Ilman kapteenikertoimia · Vihreä = paras, punainen = heikoin. Nuoli kertoo, onko suurempi vai pienempi parempi. Luvut / 90 min voivat korostua vähillä minuuteilla." : "Full season · No captain multipliers · Green = best, red = lowest. Arrows show whether higher or lower is better. Per-90 figures can be inflated by limited minutes."}</div>
    </div>
  </div>, document.querySelector(".app-shell") ?? document.body);
}

function GroupRows({ group, title, players, stats, language }: {
  group: string; title: string; players: ComparisonPlayer[]; stats: Map<number, NonNullable<DashboardData["playerStats"]>[number]>; language: Language;
}) {
  const fi = language === "fi";
  return <tbody><tr className="player-comparison-group"><th scope="rowgroup">{title}</th><td colSpan={players.length} aria-hidden="true" /></tr>{COMPARISON_METRICS.filter((m) => m.group === group).map((metric) => {
    const values = players.map((p) => metric.value(stats.get(p.id), p));
    const tones = comparisonTones(values, metric.direction, metric.decimals);
    const formatter = new Intl.NumberFormat(fi ? "fi-FI" : "en-GB", { maximumFractionDigits: metric.decimals ?? 0, minimumFractionDigits: metric.decimals ?? 0 });
    return <tr key={metric.key}><th scope="row">{fi ? metric.fi : metric.en}<span title={metric.direction === "higher" ? fi ? "Suurempi on parempi" : "Higher is better" : fi ? "Pienempi on parempi" : "Lower is better"}>{metric.direction === "higher" ? "↑" : "↓"}</span></th>{values.map((value, i) => {
      const text = value !== null && Number.isFinite(value) ? formatter.format(Number(value.toFixed(metric.decimals ?? 0))) : "—";
      const toneLabel = tones[i] === "best" ? fi ? ", paras" : ", best" : tones[i] === "worst" ? fi ? ", heikoin" : ", lowest" : "";
      return <td className={tones[i]} key={players[i].id} aria-label={`${players[i].name}: ${text}${toneLabel}`}>{text}{tones[i] === "best" && <i aria-hidden="true">●</i>}</td>;
    })}</tr>;
  })}</tbody>;
}
