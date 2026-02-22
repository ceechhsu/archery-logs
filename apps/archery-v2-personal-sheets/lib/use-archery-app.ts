"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { bootstrapSheet, fetchSession, logout, pullSheet, pushSheet } from "@/lib/client-api";
import { dateIsoInSf } from "@/lib/date-utils";
import { enqueueWrite, listWrites, queuePayload, removeWrite } from "@/lib/indexed-queue";
import { mergeSessionsLww } from "@/lib/session-merge";
import { AppMeta, AuthSession, End, Session, Shot, SyncState } from "@/lib/types";

const LOCAL_SESSIONS_KEY = "archery_v2_local_sessions";
const LOCAL_META_KEY = "archery_v2_local_meta";

function todayIsoDate(): string {
  return dateIsoInSf();
}

function makeShot(index: number): Shot {
  return { shotId: uuidv4(), shotIndex: index, score: 0, value: "M" };
}

function normalizeShotValue(value: string | undefined, score: number): string {
  const normalized = (value || "").toUpperCase().trim();
  if (normalized === "X" || normalized === "M") return normalized;
  if (/^(10|[1-9])$/.test(normalized)) return normalized;
  if (normalized === "0") return "M";
  if (score === 10) return "10";
  if (score <= 0) return "M";
  return String(Math.min(10, Math.max(1, Math.round(score))));
}

function makeEnd(endIndex: number, shotsCount = 5): End {
  return {
    endId: uuidv4(),
    endIndex,
    distanceMeters: null,
    shots: Array.from({ length: shotsCount }, (_, i) => makeShot(i + 1))
  };
}

function makeSession(date: string): Session {
  const now = new Date().toISOString();
  return {
    sessionId: uuidv4(),
    sessionDate: date,
    createdAt: now,
    updatedAt: now,
    location: "",
    locationLat: null,
    locationLng: null,
    notes: "",
    isLocalOnly: true,
    photos: [],
    ends: [makeEnd(1)]
  };
}

function normalizeSessions(input: Session[]): Session[] {
  return input.map((session) => ({
    ...session,
    location: session.location || "",
    locationLat: typeof session.locationLat === "number" ? session.locationLat : null,
    locationLng: typeof session.locationLng === "number" ? session.locationLng : null,
    isLocalOnly: Boolean(session.isLocalOnly),
    photos: (session.photos || []).map((photo) => ({
      fileId: photo.fileId,
      name: photo.name,
      webViewLink: photo.webViewLink || null,
      uploadedAt: photo.uploadedAt || new Date().toISOString()
    })),
    ends: session.ends.map((end) => ({
      ...end,
      distanceMeters: typeof end.distanceMeters === "number" && end.distanceMeters > 0 ? end.distanceMeters : null,
      photoFileId: end.photoFileId || null,
      photoName: end.photoName || null,
      photoUploadedAt: end.photoUploadedAt || null,
      photoWebViewLink: end.photoWebViewLink || null,
      shots: end.shots.map((shot) => ({
        ...shot,
        value: normalizeShotValue(shot.value, shot.score)
      }))
    }))
  }));
}

function loadLocalSessions(): Session[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
  if (!raw) return [];
  try {
    return normalizeSessions(JSON.parse(raw) as Session[]);
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions: Session[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
}

function loadMeta(): AppMeta | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LOCAL_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppMeta;
  } catch {
    return null;
  }
}

function saveMeta(meta: AppMeta | null): void {
  if (typeof window === "undefined") return;
  if (!meta) {
    localStorage.removeItem(LOCAL_META_KEY);
    return;
  }
  localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta));
}

export function useArcheryApp() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("Not synced");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionsRef = useRef<Session[]>([]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const replaceSessions = useCallback((next: Session[]) => {
    const normalized = normalizeSessions(next);
    sessionsRef.current = normalized;
    setSessions(normalized);
    saveLocalSessions(normalized);
  }, []);

  const syncNow = useCallback(async (options?: { publishSessionId?: string }) => {
    if (!meta) return;
    setSyncState("Syncing");
    setErrorMessage(null);

    try {
      const localSnapshot = normalizeSessions(sessionsRef.current);
      const publishSessionId = options?.publishSessionId;
      const merged = localSnapshot.map((session) => {
        if (publishSessionId && session.sessionId === publishSessionId) {
          return { ...session, isLocalOnly: false };
        }
        return session;
      });

      const syncTarget = merged.filter((session) => !session.isLocalOnly);
      if (!syncTarget.length) {
        setSyncState("Sync failed");
        setErrorMessage("No local session data to sync yet. Create or edit a session first.");
        return;
      }

      const queueId = uuidv4();
      await enqueueWrite({ id: queueId, createdAt: new Date().toISOString(), payload: queuePayload(syncTarget) });
      const writes = await listWrites();
      for (const write of writes) {
        const syncedAt = await pushSheet(meta.spreadsheetId, write.payload);
        await removeWrite(write.id);
        setMeta((current) => {
          if (!current) return current;
          const updated = { ...current, lastSyncedAt: syncedAt };
          saveMeta(updated);
          return updated;
        });
      }
      replaceSessions(merged);
      setSyncState("Synced");
    } catch (error) {
      setSyncState("Sync failed");
      setErrorMessage(error instanceof Error ? error.message : "Sync failed");
    }
  }, [meta, replaceSessions]);

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const currentSession = await fetchSession();
        setAuthSession(currentSession);
        const localSessions = loadLocalSessions();
        replaceSessions(localSessions);
        if (localSessions.length) {
          setActiveSessionId(localSessions[0].sessionId);
        }

        if (!currentSession) {
          setIsLoading(false);
          return;
        }

        const localMeta = loadMeta();
        if (localMeta) {
          setMeta(localMeta);
        }

        const bootMeta = await bootstrapSheet();
        setMeta(bootMeta);
        saveMeta(bootMeta);

        const pulled = normalizeSessions(await pullSheet(bootMeta.spreadsheetId));
        const merged = mergeSessionsLww(localSessions, pulled);
        replaceSessions(merged);
        if (merged.length) {
          setActiveSessionId(merged[0].sessionId);
        } else {
          const firstSession = makeSession(todayIsoDate());
          replaceSessions([firstSession]);
          setActiveSessionId(firstSession.sessionId);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Initialization failed");
      } finally {
        setIsLoading(false);
      }
    }

    void init();
  }, [replaceSessions]);

  const updateSession = useCallback(
    (updater: (session: Session) => Session) => {
      let createdSessionId: string | null = null;
      setSessions((previous) => {
        let working = previous;
        let current = working.find((session) => session.sessionId === activeSessionId) || null;

        if (!current) {
          current = makeSession(todayIsoDate());
          createdSessionId = current.sessionId;
          working = [current, ...working];
        }

        const next = updater(current);
        const nextSessions = normalizeSessions(
          working.map((session) =>
            session.sessionId === current.sessionId
              ? { ...next, updatedAt: new Date().toISOString() }
              : session
          )
        );
        sessionsRef.current = nextSessions;
        saveLocalSessions(nextSessions);
        return nextSessions;
      });

      if (createdSessionId) {
        setActiveSessionId(createdSessionId);
      }
      setSyncState("Not synced");
    },
    [activeSessionId]
  );

  const addSession = useCallback(
    (date: string) => {
      const next = makeSession(date);
      const nextSessions = [next, ...sessions];
      replaceSessions(nextSessions);
      setActiveSessionId(next.sessionId);
      setSyncState("Not synced");
    },
    [replaceSessions, sessions]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      const nextSessions = sessions.filter((session) => session.sessionId !== sessionId);
      replaceSessions(nextSessions);
      if (activeSessionId === sessionId) {
        setActiveSessionId(nextSessions[0]?.sessionId || null);
      }
      setSyncState("Not synced");
    },
    [activeSessionId, replaceSessions, sessions]
  );

  const signOut = useCallback(async () => {
    await logout();
    setAuthSession(null);
    setMeta(null);
    saveMeta(null);
  }, []);

  return {
    authSession,
    meta,
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    syncState,
    errorMessage,
    isLoading,
    updateSession,
    addSession,
    deleteSession,
    syncNow,
    signOut
  };
}
