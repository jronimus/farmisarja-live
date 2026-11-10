import { Armchair } from "lucide-react";
import type { DashboardData, Language, ManagerRow } from "./types";
import { futureTeamFixtures } from "./services/futureComparison";
import { PlayerFace } from "./MatchCentre";

export default function FutureTeamComparison({ data, managers, language, onPlayer }: { data: DashboardData; managers: ManagerRow[]; language: Language; onPlayer: (id: number) => void }) {
  const fi = language === "fi";
  return <div className="future-team-comparison">{managers.map((manager) => {
    const { rows, average } = futureTeamFixtures(data, manager);
    return <section key={manager.id} className="future-team-panel"><header><div><h3>{manager.teamName}</h3><small>{manager.freeTransfersAfter ?? "—"} FT · {fi ? "Nykyinen kokoonpano" : "Current squad"}</small></div><span>{fi ? "Avaus · FDR" : "Starters · FDR"}<b>{average?.toFixed(2) ?? "—"}</b></span></header>
      <div className="future-team-rows">{rows.map(({ player, fixtures }) => <div className={`future-player ${player.starter ? "" : "bench"}`} key={player.id}>
        <button onClick={() => onPlayer(player.id)}><PlayerFace name={player.name} club={player.club} photoCode={player.photoCode} position={player.position} /><span><b>{player.name}</b><small>{player.club}</small></span>{!player.starter && <Armchair size={12} />}</button>
        <div className="future-player-fixtures">{fixtures.length ? fixtures.map((fixture, index) => <span key={`${fixture.gameweek}:${index}`} className={`fdr-${fixture.difficulty}`} title={`${fixture.opponentName} · ${fi ? "Vaikeustaso" : "Difficulty"} ${fixture.difficulty}/5`}><small>GW {fixture.gameweek}</small><b>{fixture.opponent} <i>{fixture.venue}</i></b></span>) : <small>{fi ? "Ei ottelutietoja" : "No fixture data"}</small>}</div>
      </div>)}</div></section>;
  })}</div>;
}
