import { useEffect, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { DashboardData, Language } from "./types";
import { formPlayerContributions, loadFormHistory, type HistoricalRound } from "./services/formHistory";

export default function FormHistorySection({ data, managerId, weeks, managerIds, language, onPlayer }: {
  data: DashboardData; managerId: number; weeks: number[]; managerIds: number[]; language: Language; onPlayer: (id: number) => void;
}) {
  const fi = language === "fi";
  const [history, setHistory] = useState<HistoricalRound[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const through = data.gameweek - (data.pointsFinalized ? 0 : 1);
  const weekKey = weeks.filter((week) => week <= through).join(",");
  const managerKey = [...managerIds].sort((a, b) => a - b).join(",");
  const deadline = new Date(data.deadline);
  const season = String(deadline.getUTCFullYear() - (deadline.getUTCMonth() < 6 ? 1 : 0));
  useEffect(() => {
    let active = true;
    setHistory(null); setError(false);
    if (!weekKey || !managerKey) return;
    loadFormHistory(weekKey.split(",").map(Number), managerKey.split(",").map(Number), season).then((rounds) => { if (active) setHistory(rounds); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [weekKey, managerKey, season, retry]);
  let contributions: ReturnType<typeof formPlayerContributions> = [];
  let incomplete = false;
  try { if (history) contributions = formPlayerContributions(history, managerId); } catch { incomplete = true; }
  const differential = contributions.filter((row) => row.points >= 12 && row.differentialPoints >= 12 && row.gain >= 8).sort((a, b) => b.gain - a.gain)[0];
  const name = (id: number) => data.players?.find((player) => player.id === id)?.name ?? data.managers.flatMap((manager) => manager.squad).find((player) => player.id === id)?.name ?? `${fi ? "Pelaaja" : "Player"} #${id}`;
  return <section className="manager-form-history"><h3>{fi ? "Mistä vireen pisteet tulivat?" : "Which players drove this form?"}</h3>
    {error || incomplete ? <p role="status">{fi ? "Kierroskokoonpanojen lataus ei onnistunut." : "Could not load historical squads."} <button className="player-history-retry" onClick={() => setRetry((n) => n + 1)}>{fi ? "Yritä uudelleen" : "Retry"}</button></p> : !weekKey ? <p>{fi ? "Ei vielä vahvistettuja kierroksia." : "No confirmed gameweeks yet."}</p> : !history ? <p role="status">{fi ? "Ladataan kierrosten kokoonpanoja ja pelaajapisteitä…" : "Loading gameweek squads and player points…"}</p> : <>
      <table className="player-data-table"><thead><tr><th>{fi ? "Pelaaja" : "Player"}</th><th>{fi ? "Kierroksia" : "Gameweeks"}</th><th>{fi ? "Pisteet" : "Points"}</th><th>{fi ? "Kapteenilisä" : "Captain extra"}</th><th>{fi ? "Etu muihin" : "Gain vs others"}</th></tr></thead><tbody>{contributions.filter((row) => row.points !== 0).slice(0, 5).map((row) => <tr key={row.id}><th scope="row"><button className="player-name-link" onClick={() => onPlayer(row.id)}>{name(row.id)} <ArrowUpRight size={11} /></button></th><td>{row.rounds}</td><td>{row.points}</td><td>{row.captainExtra > 0 ? `+${row.captainExtra}` : row.captainExtra}</td><td>{row.gain > 0 ? "+" : ""}{row.gain.toFixed(1)}</td></tr>)}</tbody></table>
      {differential && <div className="manager-form-differential"><Sparkles size={18} /><div><small>{fi ? "Virejakson differentiaali" : "Differential over this form period"}</small><button className="player-name-link" onClick={() => onPlayer(differential.id)}>{name(differential.id)} <ArrowUpRight size={13} /></button><p>{differential.points} {fi ? "pistettä joukkueelle" : "points for this team"} · +{differential.gain.toFixed(1)} {fi ? "muihin verrattuna" : "vs others"} · {fi ? "keskimäärin" : "average"} {differential.averageOwners.toFixed(1)}/{managerIds.length} {fi ? "omisti silloin" : "owners at the time"}</p></div></div>}
      <p className="player-modal-note">{fi ? "Jokaisen kierroksen omat kokoonpanot: mukana myös jo myydyt pelaajat, kapteenikertoimet, chipit ja vahvistetut automaattivaihdot. Kapteenilisä sisältyy pisteisiin. Etu vertaa saman pelaajan tuottoa muiden joukkueiden keskiarvoon samoilla kierroksilla. Differentiaali nostetaan vain selvästi pisteitä tuoneista, harvoin omistetuista valinnoista." : "Uses each gameweek's actual squad, including players since sold, captain multipliers, chips and confirmed autosubs. Captain extra is already included in points. Gain compares the same player's contribution with other teams' average over the same gameweeks. A differential is highlighted only for a clear return from a rarely owned pick."}</p>
    </>}
  </section>;
}
