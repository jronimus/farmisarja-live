import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Clock3, Info, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { translations } from "./i18n";
import { insightsEndpoint, loadInsights, type PlayerInsight } from "./services/insights";
import { carryCurrentState, loadFplWindow, type FplWindow } from "./services/fplHistory";
import { COLUMNS_BY_KEY, DEFAULT_COLUMNS, STAT_COLUMNS, help, label, type StatColumn, type StatRow } from "./services/statColumns";
import { ownersByPlayer } from "./services/ownership";
import type { DashboardData, Language, PlayerStat } from "./types";

/**
 * What the players have actually done, as against what they were paid for doing it.
 *
 * The other pages answer who is winning, where prices are going and who is fit. This one
 * answers the question none of them can — **is he actually playing well** — and it does it
 * by handing the reader the controls rather than choosing for him.
 *
 * The first version split the table into attack, defence and goalkeeping. That read as three
 * positions when it was three sets of columns, and it was the wrong axis anyway: a
 * midfielder is judged on both halves of the pitch, and a reader wants his own set. So there
 * is one table, fifty-odd columns to choose from, and the choice is kept. A column costs a
 * checkbox now rather than a crowded table, which is why there can be so many of them.
 */

const COLUMNS_KEY = "farmisarja-stat-columns";
const FAVOURITES_KEY = "farmisarja-favourites";
const PAGE_STEP = 30;

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    // A corrupt or unavailable store is not worth a broken page.
    return fallback;
  }
}

/** A popover with its own backdrop, used by both pickers. */
function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <>
    <button className="picker-backdrop" onClick={onClose} tabIndex={-1} aria-hidden="true" />
    <div className="picker-panel" role="dialog" aria-label={title}>
      <div className="picker-head">
        <b>{title}</b>
        <button onClick={onClose} aria-label={title}><X /></button>
      </div>
      {children}
    </div>
  </>;
}

export default function Stats({ data, language, autosubs }: { data: DashboardData; language: Language; autosubs: boolean }) {
  const t = translations(language);
  const [insights, setInsights] = useState<Map<number, PlayerInsight> | null>(null);
  const [gameweeks, setGameweeks] = useState<number[]>([]);
  /**
   * FPL's own figures for the picked gameweeks, when any are picked.
   *
   * Null while the season is showing, because the season *is* what FPL publishes and it is
   * already on the page — assembling it out of snapshots would be 38 KV reads to arrive back
   * at the number the bootstrap handed over for nothing.
   */
  const [fplWindow, setFplWindow] = useState<FplWindow | null>(null);
  const [failed, setFailed] = useState(false);

  const [picked, setPicked] = useState<number[]>([]);
  const [columns, setColumns] = useState<string[]>(() => stored(COLUMNS_KEY, DEFAULT_COLUMNS));
  const [favourites, setFavourites] = useState<number[]>(() => stored(FAVOURITES_KEY, [] as number[]));
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [manager, setManager] = useState("");
  const [sort, setSort] = useState("totalPoints");
  const [descending, setDescending] = useState(true);
  const [shown, setShown] = useState(PAGE_STEP);
  const [openPicker, setOpenPicker] = useState<"columns" | "gameweeks" | null>(null);
  const [explained, setExplained] = useState<StatColumn | null>(null);
  /**
   * The same explanation on hover, for a reader who has a pointer.
   *
   * The ⓘ button stays: `title` never opens on a touchscreen, and a reader on a phone needs
   * a column's meaning more than anybody. But pressing a button to be told what "xGC" means
   * is a toll on a mouse, so a pointer gets it for free.
   *
   * It is `position: fixed` and anchored from the head's own rectangle rather than absolutely
   * positioned inside it, because the head lives in a horizontal scroller that would clip it.
   */
  const [hint, setHint] = useState<{ column: StatColumn; left: number; top: number } | null>(null);
  const hoverable = typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;
  const showHint = (column: StatColumn, element: HTMLElement) => {
    if (!hoverable) return;
    const box = element.getBoundingClientRect();
    // Clamped so a column at the right-hand edge does not push the page sideways.
    setHint({ column, left: Math.min(box.left, innerWidth - 300), top: box.bottom + 6 });
  };

  useEffect(() => { localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns)); }, [columns]);
  useEffect(() => { localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites)); }, [favourites]);

  useEffect(() => {
    let active = true;
    loadInsights(picked)
      .then((body) => { if (active && body) { setInsights(body.players); setGameweeks(body.gameweeks); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [picked]);

  useEffect(() => {
    let active = true;
    if (!picked.length) { setFplWindow(null); return () => { active = false; }; }
    loadFplWindow(picked)
      // A window that cannot be read leaves the season totals in place rather than emptying
      // the FPL half of the table: half a table is worse than a labelled one.
      .then((body) => { if (active) setFplWindow(body); })
      .catch(() => { if (active) setFplWindow(null); });
    return () => { active = false; };
  }, [picked]);

  const owners = useMemo(() => ownersByPlayer(data.managers, autosubs), [data.managers, autosubs]);
  const fplStats = useMemo(
    () => new Map((data.playerStats ?? []).map((stat: PlayerStat) => [stat.id, stat])),
    [data.playerStats],
  );
  const visibleColumns = useMemo(
    () => columns.map((key) => COLUMNS_BY_KEY.get(key)).filter((column): column is StatColumn => Boolean(column)),
    [columns],
  );

  /**
   * One player's FPL figures for the picked gameweeks.
   *
   * A window with a gameweek missing from it is not a smaller window, it is the wrong
   * answer: summing the two weeks that were written down and labelling them three would be
   * worse than an empty column. So one missing week empties the FPL half of every row.
   */
  const windowed = useMemo(() => (id: number) => {
    if (!fplWindow || fplWindow.unavailable.length) return undefined;
    const week = fplWindow.players.get(id);
    return week ? carryCurrentState(week, fplStats.get(id)) : undefined;
  }, [fplWindow, fplStats]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const favourite = new Set(favourites);
    const joined: StatRow[] = (data.prices?.players ?? []).map((player) => ({
      player,
      // A window with a gameweek missing from it is not a smaller window, it is the wrong
      // answer: summing the two weeks that were written down and labelling them three would
      // be worse than an empty column. So one missing week empties the FPL half of the row.
      fpl: fplWindow ? windowed(player.id) : fplStats.get(player.id),
      match: insights?.get(player.id),
    }));

    const filtered = joined.filter(({ player }) => {
      if (term && !player.name.toLowerCase().includes(term)) return false;
      if (position && player.position !== position) return false;
      /**
       * The team filter and the starred filter add up rather than narrow each other.
       *
       * "My squad plus the players I am watching" is a list a manager actually wants;
       * intersecting the two would leave him only the players he already owns *and* has
       * starred, which is a list nobody has any use for.
       */
      const byTeam = manager ? (owners.get(player.id) ?? []).some((owner) => String(owner.managerId) === manager) : false;
      const byStar = favourite.has(player.id);
      if (manager && onlyFavourites) return byTeam || byStar;
      if (manager) return byTeam;
      if (onlyFavourites) return byStar;
      return true;
    });

    const column = COLUMNS_BY_KEY.get(sort);
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.player.name.localeCompare(b.player.name) * (descending ? -1 : 1);
      // A missing figure sorts last whichever way the column points: an empty cell is not a
      // small number, and floating those to the top would bury the answer.
      // Not-a-number counts as missing too: a column with no per-gameweek answer is empty
      // in a gameweek window, and an empty cell is not a small number.
      const value = (row: StatRow) => { const figure = column?.value(row); return figure !== null && figure !== undefined && Number.isFinite(figure) ? figure : null; };
      const left = value(a);
      const right = value(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return (left - right) * (descending ? -1 : 1);
    });
  }, [data.prices, fplStats, windowed, fplWindow, insights, owners, search, position, manager, onlyFavourites, favourites, sort, descending]);

  useEffect(() => { setShown(PAGE_STEP); }, [search, position, manager, onlyFavourites, picked, sort, descending]);

  if (!insightsEndpoint || failed) return <section className="data-pending" role="status">
    <Clock3 /><strong>{t.statsUnavailable}</strong>
  </section>;
  if (!insights) return <section className="data-pending" role="status">
    <Clock3 /><strong>{t.statsLoading}</strong>
  </section>;

  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  const figure = (column: StatColumn, row: StatRow) => {
    const value = column.value(row);
    if (value === null || !Number.isFinite(value)) return { text: "—", tone: "" };
    const text = Math.abs(value).toFixed(column.decimals ?? 0).replace(".", language === "fi" ? "," : ".");
    if (!column.signed) return { text: (value < 0 ? "−" : "") + text, tone: "" };
    const rounded = Number(value.toFixed(column.decimals ?? 0));
    return {
      text: `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${text}`,
      tone: rounded > 0 ? "up" : rounded < 0 ? "down" : "",
    };
  };

  const sortBy = (key: string, downFirst = true) => {
    if (sort === key) setDescending((value) => !value);
    else { setSort(key); setDescending(downFirst); }
  };

  const visible = rows.slice(0, shown);
  const windowLabel = picked.length === 0 ? t.statsSeason
    : picked.length === 1 ? t.statsGameweek.replace("{n}", String(picked[0]))
    : t.statsGameweeksPicked.replace("{n}", String(picked.length));

  return <section className="price-page stats-page">
    <div className="price-filters">
      <label className="price-search">
        <Search />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlayer} aria-label={t.searchPlayer} />
      </label>
      <button className="picker-trigger" onClick={() => setOpenPicker("gameweeks")}>{windowLabel}</button>
      <button className="picker-trigger" onClick={() => setOpenPicker("columns")}>
        <SlidersHorizontal /> {t.statsColumnsButton.replace("{n}", String(visibleColumns.length))}
      </button>
      <select className="period-select" value={manager} onChange={(event) => setManager(event.target.value)} aria-label={t.allTeams}>
        <option value="">{t.allTeams}</option>
        {data.managers.map((entry) => <option key={entry.id} value={entry.id}>{entry.teamName}</option>)}
      </select>
      <select className="period-select" value={position} onChange={(event) => setPosition(event.target.value)} aria-label={t.allPositions}>
        <option value="">{t.allPositions}</option>
        {["GK", "DEF", "MID", "FWD"].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
      </select>
      <button
        className={`favourite-filter ${onlyFavourites ? "active" : ""}`}
        onClick={() => setOnlyFavourites((value) => !value)}
        aria-pressed={onlyFavourites}
      ><Star /> {t.statsFavourites} ({favourites.length})</button>
      <span className="news-count">{rows.length} {t.playersShown}</span>
    </div>

    {/* One explanation panel rather than a tooltip on every head: `title` never opens on a
        touchscreen, and a reader on a phone needs a column's meaning more than anybody. */}
    {explained && <div className="stats-explainer" role="status">
      <Info />
      <span><b>{label(explained, language)}</b> — {help(explained, language)}</span>
      <button onClick={() => setExplained(null)} aria-label={t.close}><X /></button>
    </div>}

    {hint && <div className="stats-hint" style={{ left: hint.left, top: hint.top }} role="tooltip">
      <b>{label(hint.column, language)}</b> {help(hint.column, language)}
    </div>}

    {/* The table scrolls inside itself rather than taking the page sideways with it: the
        column list is the reader's, so it can be longer than the screen. */}
    <div className="stats-scroll">
      {/* Two templates rather than one, because a phone cannot afford the wide one.
          The name column is sticky, so on a 375px screen a 254px name plus the star left
          67px of scrollable table — half of one figure, on a page that exists for figures.
          The stylesheet picks between these; the count has to come from here either way. */}
      <div
        className="stats-grid"
        style={{
          "--stats-cols": `34px minmax(148px,1.4fr) repeat(${visibleColumns.length}, minmax(88px, auto))`,
          "--stats-cols-narrow": `28px 118px repeat(${visibleColumns.length}, minmax(64px, auto))`,
        } as CSSProperties}
      >
        <div className="stats-headrow">
          <span className="head-star" aria-hidden="true" />
          <span className="head-player">
            <button className={`price-sort ${sort === "name" ? "active" : ""}`} onClick={() => sortBy("name", false)}>
              {t.player}{sort === "name" && (descending ? <ArrowDown /> : <ArrowUp />)}
            </button>
          </span>
          {visibleColumns.map((column) => <span
            key={column.key}
            className={`head-stat source-${column.source}`}
            onMouseEnter={(event) => showHint(column, event.currentTarget)}
            onMouseLeave={() => setHint(null)}
          >
            <button
              className={`price-sort ${sort === column.key ? "active" : ""}`}
              onClick={() => sortBy(column.key)}
              onFocus={(event) => showHint(column, event.currentTarget.parentElement as HTMLElement)}
              onBlur={() => setHint(null)}
            >{label(column, language)}{sort === column.key && (descending ? <ArrowDown /> : <ArrowUp />)}</button>
            <button className="head-help" onClick={() => setExplained(column)} aria-label={`${label(column, language)}: ${help(column, language)}`}><Info /></button>
          </span>)}
        </div>

        {visible.map((row) => {
          const held = (owners.get(row.player.id) ?? []).map((owner) => owner.teamName);
          const starred = favourites.includes(row.player.id);
          return <div className={`stats-line ${held.length ? "is-held" : ""}`} key={row.player.id}>
            <span className="stats-star">
              <button
                className={starred ? "active" : ""}
                onClick={() => setFavourites((list) => toggle(list, row.player.id))}
                aria-pressed={starred}
                aria-label={`${t.statsFavourite}: ${row.player.name}`}
                title={t.statsFavourite}
              ><Star /></button>
            </span>
            <span className="price-player">
              <i className="shirt"><img className="shirt-image" src={`${import.meta.env.BASE_URL}kits/${row.player.position === "GK" ? "optimized-gk" : "optimized"}/${row.player.club.toLowerCase()}.webp?v=20260823-gk3`} alt="" /></i>
              <b>{row.player.name}</b>
              <small>{row.player.club} · {row.player.position}{held.length ? ` · ${held.join(", ")}` : ""}</small>
            </span>
            {visibleColumns.map((column) => {
              const cell = figure(column, row);
              return <span key={column.key} className="stats-cell"><b className={cell.tone}>{cell.text}</b></span>;
            })}
          </div>;
        })}
        {!visible.length && <div className="stats-line stats-empty">{t.noPlayersMatch}</div>}
      </div>
    </div>

    {shown < rows.length && <div className="price-foot">
      <button className="history-more" onClick={() => setShown((value) => value + PAGE_STEP)}>{t.showMore}</button>
    </div>}

    {openPicker === "gameweeks" && <Panel title={t.statsPeriod} onClose={() => setOpenPicker(null)}>
      <p className="picker-note">{t.statsGameweekNote}</p>
      <div className="picker-options">
        <button className={picked.length === 0 ? "active" : ""} onClick={() => setPicked([])}>{t.statsSeason}</button>
        {[...gameweeks].reverse().map((week) => <button
          key={week}
          className={picked.includes(week) ? "active" : ""}
          aria-pressed={picked.includes(week)}
          onClick={() => setPicked((list) => toggle(list, week))}
        >{t.statsGameweek.replace("{n}", String(week))}</button>)}
      </div>
    </Panel>}

    {openPicker === "columns" && <Panel title={t.statsColumnsTitle} onClose={() => setOpenPicker(null)}>
      <p className="picker-note">{t.statsColumnsNote}</p>
      {(["market", "fpl", "match"] as const).map((source) => <div className="picker-group" key={source}>
        <b>{t.statsSources[source]}</b>
        <div className="picker-options">
          {STAT_COLUMNS.filter((column) => column.source === source).map((column) => <button
            key={column.key}
            className={columns.includes(column.key) ? "active" : ""}
            aria-pressed={columns.includes(column.key)}
            onClick={() => setColumns((list) => toggle(list, column.key))}
            title={help(column, language)}
          >{label(column, language)}{column.seasonOnly && <i className="picker-season-only">{t.statsSeasonOnly}</i>}</button>)}
        </div>
      </div>)}
      {/* Said once, under the group it applies to, rather than repeated on four buttons. */}
      <p className="picker-note">{t.statsSeasonOnlyNote}</p>
      <button className="picker-reset" onClick={() => setColumns(DEFAULT_COLUMNS)}>{t.statsColumnsReset}</button>
    </Panel>}

    {fplWindow && fplWindow.unavailable.length > 0
      && <p className="price-disclaimer">{t.statsFplWindowMissing.replace("{weeks}", fplWindow.unavailable.map((week) => `GW ${week}`).join(", "))}</p>}
    <p className="price-disclaimer">{t.statsNote} <a href="#/lahteet">{t.navSources}</a></p>
  </section>;
}
