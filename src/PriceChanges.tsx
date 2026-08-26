import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, History, LineChart, Lock, Search, TriangleAlert } from "lucide-react";
import { translations } from "./i18n";
import { daysUntilChangeDay, hoursToChange, maybeThisWeek, nextPriceDeadline, outlookFor, outlookRank, projectedAt } from "./services/priceChanges";
import { ownersByPlayer, type PlayerOwner } from "./services/ownership";
import { sellingPrice, sellingPriceMoves } from "./services/fplRules";
import PriceHistory from "./PriceHistory";
import type { DashboardData, Language, PriceRow } from "./types";

type SortKey = "progress" | "tonight" | "outlook" | "perHour" | "ownership" | "cost" | "name";
type Direction = "all" | "risers" | "fallers" | "locked";
/** What the page is about: where prices are going, or where they have been. */
type Tab = "market" | "history";

const PAGE_SIZES = [10, 15, 25, 50, 100];
const PAGE_SIZE_KEY = "farmisarja-price-page-size";

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
  return <div className="price-countdown" title={t.nextPriceChange} aria-label={t.nextPriceChange}>
    <Clock3 />
    <strong>{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong>
    <small>{t.atClock} {clock}</small>
  </div>;
}

/**
 * The two readings of the price page.
 *
 * A strip above the filters rather than another button among them: the filters narrow what
 * is shown, and this changes what the page is about. The countdown, the search and the
 * three selects stay put across the switch, which is the reason the tabs are here and not
 * inside the filter row where they would look like a fifth filter.
 */
function Tabs({ tab, setTab, language }: { tab: Tab; setTab: (value: Tab) => void; language: Language }) {
  const t = translations(language);
  return <div className="price-tabs" role="tablist">
    <button role="tab" aria-selected={tab === "market"} className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>
      <LineChart /> {t.tabMarket}
    </button>
    <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
      <History /> {t.tabHistory}
    </button>
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
  const [tab, setTab] = useState<Tab>("market");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [club, setClub] = useState("");
  const [manager, setManager] = useState("");
  // Everything, like FPL's own page. Splitting risers from fallers is a filter, not a
  // default: the question "what is moving" comes before "which way".
  const [direction, setDirection] = useState<Direction>("all");
  const [sort, setSort] = useState<SortKey>("progress");
  const [descending, setDescending] = useState(true);
  const [pageSize, setPageSize] = useState(() => {
    const stored = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(stored) ? stored : 25;
  });
  const [page, setPage] = useState(0);

  useEffect(() => { localStorage.setItem(PAGE_SIZE_KEY, String(pageSize)); }, [pageSize]);

  // Locked is dropped from the filter row on the history tab, so a selection left on it
  // would be a filter nothing can satisfy and no control to undo it with.
  useEffect(() => { if (tab === "history" && direction === "locked") setDirection("all"); }, [tab, direction]);

  const owners = useMemo(() => ownersByPlayer(data.managers, autosubs), [data.managers, autosubs]);
  const market = data.prices;
  // One reading per render. The sort and the rows have to agree about what time it is, and
  // a clock read twice inside one render can straddle a change deadline.
  const now = Date.now();

  const clubs = useMemo(
    () => [...new Set((market?.players ?? []).map((row) => row.club))].sort(),
    [market],
  );

  /**
   * Who the page is showing, before either tab has said anything about prices. Both tabs
   * ask the same four questions of a player — name, team, position, club — and they are
   * asked in one place so that switching tabs keeps the selection rather than quietly
   * widening it back out.
   */
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (row: { id: number; name: string; position: string; club: string }) => {
      if (term && !row.name.toLowerCase().includes(term)) return false;
      if (position && row.position !== position) return false;
      if (club && row.club !== club) return false;
      if (manager && !(owners.get(row.id) ?? []).some((owner) => String(owner.managerId) === manager)) return false;
      return true;
    };
  }, [search, position, club, manager, owners]);

  /**
   * Tonight's change, and where each rate lands at it. One reading for the whole table, so
   * every row on screen is answering the same question about the same moment — and none at
   * all once FPL's list of deadlines has run out, because then there is no tonight to
   * project to.
   */
  const nextDeadline = nextPriceDeadline(market, now);
  const tonight = nextDeadline ? {
    clock: new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(nextDeadline)),
    at: (row: PriceRow) => projectedAt(row, nextDeadline, now),
  } : null;

  const rows = useMemo(() => {
    const filtered = (market?.players ?? []).filter((row) => {
      if (!matches(row)) return false;
      if (direction === "risers" && row.progress <= 0) return false;
      if (direction === "fallers" && row.progress >= 0) return false;
      if (direction === "locked" && !row.lockedUntil) return false;
      return true;
    });
    const value = (row: PriceRow) => {
      if (sort === "name") return 0;
      // The signed number, always. Ranking by distance from nothing interleaved risers and
      // fallers, and flipping the sign for one filter made the same column mean two
      // different things: a header sorts its column and nothing else. The prediction is
      // signed for the same reason — rising soonest at one end, falling soonest at the
      // other, rather than both of them together at the top.
      if (sort === "progress") return row.progress;
      // Signed, like the two columns either side of it: the ones landing furthest over the
      // line at one end, the ones landing furthest under it at the other.
      if (sort === "tonight") return nextDeadline ? projectedAt(row, nextDeadline, now) : row.progress;
      if (sort === "outlook") return market ? outlookRank(row, market, now) : 0;
      if (sort === "perHour") return row.perHour;
      if (sort === "ownership") return row.ownership;
      return row.cost;
    };
    return [...filtered].sort((a, b) => (sort === "name"
      ? a.name.localeCompare(b.name)
      : value(a) - value(b)) * (descending ? -1 : 1));
  }, [market, matches, direction, sort, descending, now, nextDeadline]);

  // Sorting belongs in here too. A re-order means page 4 holds different players than the
  // page 4 you were looking at, and the prediction sort moves every row at once.
  useEffect(() => { setPage(0); }, [search, position, club, manager, direction, pageSize, sort, descending]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const percent = (value: number) => language === "fi" ? `${value.toFixed(1)} %` : `${value.toFixed(1)}%`;

  const header = (label: string, key: SortKey) => <button
    className={`price-sort ${sort === key ? "active" : ""}`}
    onClick={() => { if (sort === key) setDescending((value) => !value); else { setSort(key); setDescending(true); } }}
  >{label}{sort === key && (descending ? <ArrowDown /> : <ArrowUp />)}</button>;

  // The day the change belongs to, not the offset of the projection that predicted it.
  const outlookLabel = (deadline: string, now: number) => {
    const days = daysUntilChangeDay(deadline, now);
    if (days <= 0) return t.outlookToday;
    if (days === 1) return t.outlookTomorrow;
    // Finnish has a word for the day after tomorrow and English does not, which is the
    // whole reason this is a string per language rather than a count and a unit.
    if (days === 2) return t.outlookTwoDays;
    return t.outlookInDays.replace("{n}", String(days));
  };

  // The log is the site's own and does not depend on FPL answering: a night FPL is down is
  // exactly a night somebody wants to look up what happened yesterday. So the pending
  // notice belongs to the market tab rather than to the page.
  const marketPending = !market || !market.players.length;
  if (marketPending && tab === "market") {
    return <section className="price-page">
      <div className="price-filters"><Tabs tab={tab} setTab={setTab} language={language} /></div>
      <section className="data-pending" role="status">
        <Clock3 />
        <strong>{t.pricesUnavailable}</strong>
      </section>
    </section>;
  }

  return <section className="price-page">
    <div className="price-filters">
      <Tabs tab={tab} setTab={setTab} language={language} />
      <Countdown deadline={nextPriceDeadline(market, Date.now())} language={language} />
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
        {(([["all", t.allPlayersFilter], ["risers", t.risers], ["fallers", t.fallers], ["locked", t.lockedOnly]] as Array<[Direction, string]>)
          // Locked describes a price that cannot move yet, which is a fact about the future
          // and has nothing to say about a change that has already happened.
          .filter(([key]) => tab === "market" || key !== "locked")).map(([key, label]) =>
          <button key={key} className={direction === key ? "active" : ""} onClick={() => setDirection(key)}>{label}</button>)}
      </div>
    </div>

    {/* Two readings of one table: the prediction, or what actually happened. The filter row
        above belongs to both, which is why it sits outside this. */}
    {tab === "history" ? <PriceHistory language={language} owners={owners} matches={matches} direction={direction} /> : market ? <>
    {/* `has-selling` widens the price column and narrows the owners column by the same
        amount: the selling line only exists with a squad selected, and with one selected
        the owners column is the least of the eight — you already know whose squad it is. */}
    <div className={`price-table ${manager ? "has-selling" : ""}`}>
      {/* Classed to match the cells below, so the phone can drop a column from both the
          head and the rows with one rule each and keep the two grids in step. */}
      <div className="price-head">
        <span className="head-player">{header(t.player, "name")}</span>
        <span className="head-owners">{t.leagueOwners}</span>
        <span className="head-progress">{header(t.priceProgress, "progress")}</span>
        <span className="head-tonight">{header(t.priceTonight, "tonight")}</span>
        <span className="head-outlook">{header(t.priceWhen, "outlook")}</span>
        <span className="head-rate">{header(t.perHour, "perHour")}</span>
        <span className="head-ownership">{header(t.ownership, "ownership")}</span>
        <span className="head-cost">{header(t.price, "cost")}</span>
      </div>
      {visible.map((row) => {
        const outlook = outlookFor(row, market.deadlines, now);
        // Not reaching a change, but near enough by the last one before the deadline to be
        // worth a hedge rather than a flat no.
        const maybe = outlook ? null : maybeThisWeek(row, market, now);
        const hours = hoursToChange(row.progress, row.perHour);
        const rising = row.progress >= 0;
        const held = owners.get(row.id) ?? [];
        /**
         * What this change would do to the selected squad's selling price.
         *
         * Only with a squad selected: a selling price belongs to one manager and one
         * purchase, and printing seven of them in a column would be printing a different
         * number for every owner of the same player. The direction is the one the page is
         * already predicting — a named night, or the hedge — because a change that is not
         * coming cannot move anything.
         */
        const mine = manager ? held.find((owner) => String(owner.managerId) === manager) : undefined;
        const coming = outlook?.direction ?? maybe ?? null;
        const selling = mine?.purchasePrice === undefined ? null : (() => {
          const paid = Math.round(mine.purchasePrice! * 10);
          const price = Math.round(row.cost * 10);
          return {
            now: sellingPrice(paid, price) / 10,
            next: coming ? sellingPrice(paid, price + (coming === "rise" ? 1 : -1)) / 10 : null,
            moves: Boolean(coming) && sellingPriceMoves(paid, price, coming as "rise" | "fall"),
            paid: mine.purchasePrice!,
          };
        })();
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
          {/* Where this rate has him standing when tonight's change is decided, which is the
              only moment the meter is ever read. The column beside it says which night that
              lands on; this is the figure that sentence was read off, and it is struck with
              the league's own highlighter once it passes the line, because at that point it
              has stopped being a projection and become a price change. */}
          <span className="price-tonight" data-label={t.priceTonight}>
            {tonight && !row.lockedUntil
              ? <b
                className={`at-change ${Math.abs(tonight.at(row)) >= 100 ? "hits" : ""}`}
                title={`${t.priceAtChange} ${t.atClock} ${tonight.clock}`}
              >{tonight.at(row) > 0 ? "+" : ""}{percent(tonight.at(row))}</b>
              : <b className="quiet">—</b>}
          </span>
          <span className="price-outlook" data-label={t.priceOutlook}>
            {row.lockedUntil
              ? <em className="locked"><Lock /> {t.priceLocked} {new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { day: "numeric", month: "numeric" }).format(new Date(row.lockedUntil))}</em>
              : row.calibrating
                ? <em>{t.priceCalibrating}</em>
                : outlook
                  ? <>
                    <em className={outlook.direction === "rise" ? "up" : "down"}>
                      {outlook.direction === "rise" ? t.willRise : t.willFall} {outlookLabel(outlook.deadline, now)}
                    </em>
                    {/* The qualifier under the figure it qualifies, which is what every
                        other cell on this page already does. */}
                    {outlook.couldBe && <small>
                      {(outlook.couldBe.sooner ? t.couldBeSooner : t.couldBeLater)
                        .replace("{day}", outlookLabel(outlook.couldBe.deadline, now))}
                    </small>}
                  </>
                  : maybe
                    ? <em className={`maybe ${maybe === "rise" ? "up" : "down"}`}>{maybe === "rise" ? t.mayRiseThisWeek : t.mayFallThisWeek}</em>
                    : <em className="quiet">{t.unlikelyThisWeek}</em>}
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
            {/* FPL never shows a squad which of its players are one change away from a
                different selling price, because it never shows the halving at all: it
                prints the number and not the parity behind it. This is that parity, marked
                with the same highlighter the page uses for everything else that has
                stopped being a projection. */}
            {selling && <small
              className={`selling ${selling.moves ? (coming === "fall" ? "warns" : "gains") : ""}`}
              title={selling.moves
                ? t.sellingMoves.replace("{team}", mine!.teamName).replace("{paid}", `£${selling.paid.toFixed(1)}m`).replace("{sell}", `£${selling.now.toFixed(1)}m`).replace("{next}", `£${(selling.next ?? selling.now).toFixed(1)}m`)
                : t.sellingHolds.replace("{team}", mine!.teamName).replace("{paid}", `£${selling.paid.toFixed(1)}m`).replace("{sell}", `£${selling.now.toFixed(1)}m`)}
            >
              {/* A fall that reaches the selling price is the only one of the three that is
                  news you can act on, and it is the figure itself that is the warning: the
                  price this squad gets back for him after tonight, said now rather than
                  worked out from the one it is replacing. A rise is not a warning — it is
                  the same arithmetic going your way — so it is marked and not shouted. */}
              {selling.moves && coming === "fall" && <TriangleAlert />}
              <i>{t.sellingLabel} </i>
              £{(selling.moves ? selling.next ?? selling.now : selling.now).toFixed(1)}m
              {selling.moves && coming === "rise" && " ▲"}
            </small>}
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

    {/* Under the table rather than over it: it qualifies what has been read, and a caveat
        placed before the thing it qualifies is read as a warning about the page. */}
    <p className="price-disclaimer">{t.priceDisclaimer}</p>
    </> : null}
  </section>;
}
