import { Session } from "@/lib/types";

export function mergeSessionsLww(localSessions: Session[], remoteSessions: Session[]): Session[] {
  const byId = new Map<string, Session>();

  for (const session of remoteSessions) {
    byId.set(session.sessionId, session);
  }

  for (const session of localSessions) {
    const existing = byId.get(session.sessionId);
    if (!existing) {
      byId.set(session.sessionId, session);
      continue;
    }

    const localTime = new Date(session.updatedAt).getTime();
    const remoteTime = new Date(existing.updatedAt).getTime();
    if (Number.isNaN(remoteTime)) {
      byId.set(session.sessionId, session);
      continue;
    }
    if (Number.isNaN(localTime) || localTime >= remoteTime) {
      byId.set(session.sessionId, session);
    }
  }

  return [...byId.values()].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
}
