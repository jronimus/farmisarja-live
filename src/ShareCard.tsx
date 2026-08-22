import { buildAwards } from "./services/awards";
import type { Award } from "./services/awards";
import type { DashboardData, ManagerRow } from "./types";
import "./cards.css";

export type CardKind = "round" | "total" | "awards";

const COLUMNS = 3;
const TILE = 230;
const GAP = 20;
const HEADER_BOTTOM = 163;
const FOOT_TOP = 1240;

const asset = (file: string) => `${import.meta.env.BASE_URL}cards/${file}`;

/** The plate carries the row bands, so it has to match the number of rows on the card. */
function plateFor(kind: CardKind, rows: number) {
  if (kind === "awards") return asset("trophy.webp");
  const size = rows > 7 ? "8" : "7";
  return asset(kind === "round" ? `round-${size}.webp` : `total-${size}.webp`);
}

const netPoints = (manager: ManagerRow) => manager.gameweekPoints + manager.provisionalBonus - manager.hit;

const MAX_ROWS = 8;

function ranked(managers: ManagerRow[], figure: (manager: ManagerRow) => number) {
  const sorted = [...managers].sort((a, b) => figure(b) - figure(a)).slice(0, MAX_ROWS);
  return sorted.map((manager) => ({
    manager,
    figure: figure(manager),
    place: 1 + sorted.filter((other) => figure(other) > figure(manager)).length,
  }));
}

function Shell({ title, gameweek, finalised, plate, children }: {
  title: string;
  gameweek: number;
  finalised: boolean;
  plate: string;
  children: React.ReactNode;
}) {
  return <div className="sc-card">
    <img className="sc-plate" src={plate} alt="" />
    <div className="sc-head">
      <div className="sc-title">{title}</div>
      <div className="sc-round">
        <b>GW&nbsp;{gameweek}</b>
        <span className="sc-state">{finalised ? "VAHVISTETTU" : "ALUSTAVA"}</span>
      </div>
    </div>
    {children}
    <div className="sc-foot">
      <div className="sc-brand">
        <img src={`${import.meta.env.BASE_URL}branding/fs-logo-v11.svg`} alt="" />
        <span>FARMISARJA</span>
      </div>
      <span className="sc-site">jronimus.github.io/farmisarja-live/</span>
    </div>
  </div>;
}

function Movement({ manager, place }: { manager: ManagerRow; place: number }) {
  const previous = manager.previousPosition;
  if (!previous || previous === place) return null;
  const up = place < previous;
  return <span className={`sc-move ${up ? "sc-up" : "sc-down"}`}>{up ? "▲" : "▼"}{Math.abs(previous - place)}</span>;
}

function TableCard({ data, kind }: { data: DashboardData; kind: "round" | "total" }) {
  const rows = ranked(data.managers, kind === "round" ? netPoints : (m) => m.totalPoints + m.provisionalBonus - m.hit);
  return <Shell
    title={kind === "round" ? "Kierroksen pisteet" : "Kokonaistilanne"}
    gameweek={data.gameweek}
    finalised={data.pointsFinalized}
    plate={plateFor(kind, rows.length)}
  >
    <div className="sc-rows">
      {rows.map(({ manager, figure, place }) => <div className={`sc-row ${place === 1 ? "sc-lead" : ""}`} key={manager.id}>
        <div className="sc-pos">
          <span className="sc-place">{place}</span>
          {kind === "total" && <Movement manager={manager} place={place} />}
        </div>
        <div className="sc-who">
          <div className="sc-team">{manager.teamName}</div>
          <div className="sc-meta">
            {manager.managerName}
            {kind === "round" && manager.captain !== "—" && <><i>·</i><em>C</em> {manager.captain}</>}
          </div>
        </div>
        <div className="sc-score"><b><span>{figure}</span></b></div>
      </div>)}
    </div>
  </Shell>;
}

/** Centred between the title and the foot, so three rows and four are both balanced. */
function slabTop(count: number) {
  const rows = Math.max(1, Math.ceil(count / COLUMNS));
  return Math.round(HEADER_BOTTOM + (FOOT_TOP - HEADER_BOTTOM - (rows * TILE + (rows - 1) * GAP)) / 2);
}

function Tile({ award }: { award: Award }) {
  return <div className={`sc-tile ${award.tone === "neg" ? "sc-neg" : ""}`}>
    <div className="sc-tile-name">{award.name}</div>
    <div className="sc-tile-rule">{award.rule}</div>
    <div className="sc-tile-value"><b>{award.value}</b><i>{award.unit}</i></div>
    <div className="sc-tile-detail">{award.detail}</div>
    <div className="sc-tile-who">
      <div className="sc-tile-team"><span>{award.team}</span></div>
      <div className="sc-tile-manager">{award.manager}</div>
    </div>
  </div>;
}

function AwardCard({ data }: { data: DashboardData }) {
  const awards = buildAwards(data);
  const slots = Math.ceil(awards.length / COLUMNS) * COLUMNS;
  return <Shell title="Kierroksen palkinnot" gameweek={data.gameweek} finalised={data.pointsFinalized} plate={plateFor("awards", 0)}>
    {awards.length === 0
      ? <div className="sc-empty">Tällä kierroksella ei tapahtunut mitään palkinnon arvoista.</div>
      : <div className="sc-tiles" style={{ ["--sc-slab-top" as string]: `${slabTop(awards.length)}px` }}>
        {awards.map((award) => <Tile award={award} key={award.id} />)}
        {Array.from({ length: slots - awards.length }, (_, index) => <div className="sc-tile sc-empty-tile" key={`empty-${index}`} style={{ border: "none", backgroundImage: "none" }} />)}
      </div>}
  </Shell>;
}

export default function ShareCard({ data, kind }: { data: DashboardData; kind: CardKind }) {
  return <div className="sc-stage">
    {kind === "awards" ? <AwardCard data={data} /> : <TableCard data={data} kind={kind} />}
  </div>;
}
