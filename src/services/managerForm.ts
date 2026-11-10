import type { ManagerRow } from "../types";

export function managerFormComparison(manager: ManagerRow, managers: ManagerRow[]) {
  const weeks = manager.formGameweeks.slice(-5);
  const rows = managers.flatMap((other) => {
    const points = weeks.map((week) => {
      const index = other.formGameweeks.indexOf(week);
      return index < 0 ? undefined : other.form[index];
    });
    if (!points.length || points.some((value) => value === undefined)) return [];
    const total = (points as number[]).reduce((sum, value) => sum + value, 0);
    return [{ manager: other, total, average: total / points.length, points: points as number[] }];
  }).sort((a, b) => b.total - a.total || a.manager.id - b.manager.id);
  return { weeks, rows, own: rows.find((row) => row.manager.id === manager.id), average: rows.length ? rows.reduce((sum, row) => sum + row.average, 0) / rows.length : null };
}
