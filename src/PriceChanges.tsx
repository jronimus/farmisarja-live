import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, Lock, Search } from "lucide-react";
import { translations } from "./i18n";
import { hoursToChange, nextPriceDeadline, outlookFor } from "./services/priceChanges";
import { ownersByPlayer, type PlayerOwner } from "./services/ownership";
import type { DashboardData, Language, PriceRow } from "./types";

type SortKey = "progress" | "perHour" | "ownership" | "cost" | "name";
type Direction = "all" | "risers" | "fallers" | "locked";

const PAGE_SIZES = [10, 25, 50, 100];

/** FPL publishes the change times, so the clock counts to a real one rather than an assumed 01:30. */
function Countdown({ deadline, language }: { deadline: string | null; language: Language }) {
  const t = translations(language);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!deadline) return null;
  const remaining = Math.max(0, new Date(deadline).getTime() - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const clock = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(deadline));
  return <div className="price-countdown">
    <Clock3 />
    <span>{t.nextPriceChange}</span>
    <strong>{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong>
    <small>{t.atClock} {clock}</small>
  </div>;
}

function Owners({ owners }: { owners: PlayerOwner[] }) {
  if (!owners.length) return <span className="price-owners empty">—</span>;
  return <span className="price-owners">
    {/* No armband, no bench: both are about a gameweek, and this page is about a price. */}
    {owners.map((owner) => <b key={owner.managerId} title={`${owner.teamName} · ${owner.managerName}`}>{owner.teamName}</b>)}
  </span>;
}

export default function PriceChanges({ data, language, autosubs }: { data: DashboardData; language: Language; autosubs: boolean }) {
  const t = translations(language);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [club, setClub] = useState("");
  const [manager, setManager] = useState("");
  // Everything, like FPL's own page. Splitting risers from fallers is a filter, not a
  // default: the question "what is moving" comes before "which way".
  const [direction, setDirection] = useState<Direction>("all");
  const [sort, setSort] = useState<SortKey>("progress");
  const [descending, setDescending] = useState(true);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const owners = useMemo(() => ownersByPlayer(data.managers, autosubs), [data.managers, autosubs]);
  const market = data.prices;

  const clubs = useMemo(
    () => [...new Set((market?.players ?? []).map((row) => row.club))].sort(),
    [market],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (market?.players ?? []).filter((row) => {
      if (term && !row.name.toLowerCase().includes(term)) return false;
      if (position && row.position !== position) return false;
      if (club && row.club !== club) return false;
      if (manager && !(owners.get(row.id) ?? []).some((owner) => String(owner.managerId) === manager)) return false;
      if (direction === "risers" && row.progress <= 0) return false;
      if (direction === "fallers" && row.progress >= 0) return false;
      if (direction === "locked" && !row.lockedUntil) return false;
      return true;
    });
    const value = (row: PriceRow) => {
      if (sort === "name") return 0;
      // With both directions on screen at once, the biggest movers are the ones furthest
      // from nothing, whichever way they are going.
      if (sort === "progress") return direction === "fallers" ? -row.progress : direction === "risers" ? row.progress : Math.abs(row.progress);
      if (sort === "perHour") return direction === "fallers" ? -row.perHour : direction === "risers" ? row.perHour : Math.abs(row.perHour);
      if (sort === "ownership") return row.ownership;
      return row.cost;
    };
    return [...filtered].sort((a, b) => sort === "name"
      ? a.name.localeCompare(b.name) * (descending ? -1 : 1)
      : (value(a) - value(b)) * (descending ? -1 : 1));
  }, [market, owners, search, position, club, manager, direction, sort, descending]);

  useEffect(() => { setPage(0); }, [search, position, club, manager, direction, pageSize]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const percent = (value: number) => language === "fi" ? `${value.toFixed(1)} %` : `${value.toFixed(1)}%`;

  const header = (label: string, key: SortKey) => <button
    className={`price-sort ${sort === key ? "active" : ""}`}
    onClick={() => { if (sort === key) setDescending((value) => !value); else { setSort(key); setDescending(true); } }}
  >{label}{sort === key && (descending ? <ArrowDown /> : <ArrowUp />)}</button>;

  const outlookLabel = (offset: number) => [t.outlookToday, t.outlookTomorrow, t.outlookTwoDays][offset] ?? "";

  if (!market || !market.players.length) {
    return <section className="data-pending" role="status">
      <Clock3 />
      <strong>{t.pricesUnavailable}</strong>
    </section>;
  }

  return <section className="price-page">
    <Countdown deadline={nextPriceDeadline(market, Date.now())} language={language} />

    <div className="price-filters">
      <label className="price-search">
        <Search />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlayer} aria-label={t.searchPlayer} />
      </label>
      <select className="period-select" value={manager} onChange={(event) => setManager(event.target.value)} aria-label={t.allTeams}>
        <option value="">{t.allTeams}</option>
        {data.managers.map((entry) => <option key={entry.id} value={entry.id}>{entry.teamName}</option>)}
      </select>
      <select className="period-select" value={position} onChange={(event) => setPosition(event.target.value)} aria-label={t.allPositions}>
        <option value="">{t.allPositions}</option>
        {["GK", "DEF", "MID", "FWD"].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
      </select>
      <select className="period-select" value={club} onChange={(event) => setClub(event.target.value)} aria-label={t.allClubs}>
        <option value="">{t.allClubs}</option>
        {clubs.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
      </select>
      <div className="price-direction" role="group" aria-label={t.risers}>
        {([["all", t.allPlayersFilter], ["risers", t.risers], ["fallers", t.fallers], ["locked", t.lockedOnly]] as Array<[Direction, string]>).map(([key, label]) =>
          <button key={key} className={direction === key ? "active" : ""} onClick={() => setDirection(key)}>{label}</button>)}
      </div>
    </div>

    <div className="price-table">
      <div className="price-head">
        <span>{header(t.player, "name")}</span>
        <span>{t.leagueOwners}</span>
        <span>{header(t.priceProgress, "progress")}</span>
        <span>{t.priceOutlook}</span>
        <span>{header(t.perHour, "perHour")}</span>
        <span>{header(t.ownership, "ownership")}</span>
        <span>{header(t.price, "cost")}</span>
      </div>
      {visible.map((row) => {
        const outlook = outlookFor(row);
        const hours = hoursToChange(row.progress, row.perHour);
        const rising = row.progress >= 0;
        const held = owners.get(row.id) ?? [];
        return <div className={`price-row ${held.length ? "is-held" : ""}`} key={row.id}>
          <span className="price-player" data-label={t.player}>
            <i className="shirt"><img className="shirt-image" src={`${import.meta.env.BASE_URL}kits/${row.position === "GK" ? "optimized-gk" : "optimized"}/${row.club.toLowerCase()}.webp?v=20260823-gk3`} alt="" /></i>
            <b>{row.name}</b>
            <small>{row.club} · {row.position}</small>
          </span>
          <span className="price-owners-cell" data-label={t.leagueOwners}><Owners owners={held} /></span>
          <span className="price-progress" data-label={t.priceProgress}>
            <b className={rising ? "up" : "down"}>{row.progress > 0 ? "+" : ""}{percent(row.progress)}</b>
            <i><u className={rising ? "up" : "down"} style={{ width: `${Math.min(100, Math.abs(row.progress))}%` }} /></i>
          </span>
          <span className="price-outlook" data-label={t.priceOutlook}>
            {row.lockedUntil
              ? <em className="locked"><Lock /> {t.priceLocked} {new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { day: "numeric", month: "numeric" }).format(new Date(row.lockedUntil))}</em>
              : row.calibrating
                ? <em>{t.priceCalibrating}</em>
                : outlook
                  ? <em className={outlook.direction === "rise" ? "up" : "down"}>
                    {outlook.direction === "rise" ? t.willRise : t.willFall} {outlookLabel(outlook.offset)}
                  </em>
                  : <em className="quiet">{t.noChangeAhead}</em>}
          </span>
          <span className="price-rate" data-label={t.perHour}>
            <b className={row.perHour >= 0 ? "up" : "down"}>{row.perHour > 0 ? "+" : ""}{row.perHour.toFixed(2)}</b>
            {hours !== null && hours < 240 && <small>{t.inAbout} {Math.round(hours)} h</small>}
          </span>
          <span className="price-ownership" data-label={t.ownership}>
            <b>{percent(row.ownership)}</b>
            <small className={row.netTransfers >= 0 ? "up" : "down"}>{row.netTransfers >= 0 ? "▲" : "▼"} {Math.abs(row.netTransfers).toLocaleString(language === "fi" ? "fi-FI" : "en-GB")}</small>
          </span>
          <span className="price-cost" data-label={t.price}>
            <b>£{row.cost.toFixed(1)}m</b>
            {row.costChangeStart !== 0 && <small className={row.costChangeStart > 0 ? "up" : "down"}>{row.costChangeStart > 0 ? "+" : "−"}£{Math.abs(row.costChangeStart).toFixed(1)}m</small>}
          </span>
        </div>;
      })}
      {!visible.length && <div className="price-empty">{t.noPlayersMatch}</div>}
    </div>

    <div className="price-foot">
      <span>{rows.length} {t.playersShown}</span>
      <label>{t.rowsPerPage}
        <select className="period-select" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="price-pager">
        <button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>{t.previous}</button>
        <span>{page + 1} / {pageCount}</span>
        <button disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>{t.next}</button>
      </div>
    </div>
  </section>;
}
