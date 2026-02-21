import { Session } from "@/lib/types";

export function endTotal(scores: number[]): number {
  return scores.reduce((sum, score) => sum + score, 0);
}

export function sessionTotal(session: Session): number {
  return session.ends.reduce((sum, end) => sum + endTotal(end.shots.map((shot) => shot.score)), 0);
}

export function sessionArrows(session: Session): number {
  return session.ends.reduce((sum, end) => sum + end.shots.length, 0);
}

export function sessionAvgPerArrow(session: Session): number {
  const arrows = sessionArrows(session);
  if (!arrows) return 0;
  return sessionTotal(session) / arrows;
}

export function sessionAvgPerEnd(session: Session): number {
  if (!session.ends.length) return 0;
  return sessionTotal(session) / session.ends.length;
}

export function lifetimeStats(sessions: Session[]): {
  sessionCount: number;
  arrowCount: number;
  totalPoints: number;
  avgPerArrow: number;
  avgPerEnd: number;
} {
  const sessionCount = sessions.length;
  const arrowCount = sessions.reduce((sum, s) => sum + sessionArrows(s), 0);
  const totalPoints = sessions.reduce((sum, s) => sum + sessionTotal(s), 0);
  const totalEnds = sessions.reduce((sum, s) => sum + s.ends.length, 0);

  return {
    sessionCount,
    arrowCount,
    totalPoints,
    avgPerArrow: arrowCount ? totalPoints / arrowCount : 0,
    avgPerEnd: totalEnds ? totalPoints / totalEnds : 0
  };
}
