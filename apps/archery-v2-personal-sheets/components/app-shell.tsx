"use client";

import { CSSProperties, useMemo, useState } from "react";
import { lifetimeStats, sessionArrows, sessionAvgPerArrow, sessionTotal } from "@/lib/metrics";
import { ShotWheelPicker } from "@/components/shot-wheel-picker";
import { End, Session } from "@/lib/types";
import { useArcheryApp } from "@/lib/use-archery-app";
import { reverseGeocode, uploadEndPhoto } from "@/lib/client-api";

type Tab = "editor" | "history" | "analytics" | "account";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function addEnd(session: Session): Session {
  const nextIndex = session.ends.length + 1;
  const sessionShotsCount = session.ends[0]?.shots.length || 5;
  const newEnd: End = {
    endId: crypto.randomUUID(),
    endIndex: nextIndex,
    distanceMeters: 18,
    shots: Array.from({ length: sessionShotsCount }, (_, i) => ({
      shotId: crypto.randomUUID(),
      shotIndex: i + 1,
      score: 0,
      value: "M"
    }))
  };
  return { ...session, ends: [...session.ends, newEnd] };
}

function applySessionShotsCount(session: Session, shotsCount: number): Session {
  return {
    ...session,
    ends: session.ends.map((end) => {
      const current = end.shots;
      if (current.length === shotsCount) {
        return end;
      }

      if (current.length > shotsCount) {
        const trimmed = current.slice(0, shotsCount).map((shot, index) => ({ ...shot, shotIndex: index + 1 }));
        return { ...end, shots: trimmed };
      }

      const padded = [...current];
      for (let i = current.length; i < shotsCount; i += 1) {
        padded.push({ shotId: crypto.randomUUID(), shotIndex: i + 1, score: 0, value: "M" });
      }
      return { ...end, shots: padded };
    })
  };
}

function removeEnd(session: Session, endId: string): Session {
  if (session.ends.length <= 1) return session;
  const filtered = session.ends.filter((end) => end.endId !== endId);
  return {
    ...session,
    ends: filtered.map((end, index) => ({ ...end, endIndex: index + 1 }))
  };
}

export function AppShell() {
  const {
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
  } = useArcheryApp();

  const [tab, setTab] = useState<Tab>("editor");
  const [uploadingEndId, setUploadingEndId] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<{ type: "info" | "warn" | "error"; text: string } | null>(null);

  const stats = useMemo(() => lifetimeStats(sessions), [sessions]);
  const sessionShotsCount = useMemo(() => {
    if (!activeSession) return 5;
    return activeSession.ends[0]?.shots.length || 5;
  }, [activeSession]);
  const maxShots = useMemo(() => {
    if (!activeSession) return 5;
    return Math.max(5, ...activeSession.ends.map((end) => end.shots.length));
  }, [activeSession]);
  const scoreTableStyle = useMemo(
    () => ({ "--shot-columns": String(maxShots) }) as CSSProperties,
    [maxShots]
  );
  const runningTotals = useMemo(() => {
    if (!activeSession) return new Map<string, number>();
    let running = 0;
    const totals = new Map<string, number>();
    for (const end of activeSession.ends) {
      running += end.shots.reduce((sum, shot) => sum + shot.score, 0);
      totals.set(end.endId, running);
    }
    return totals;
  }, [activeSession]);
  const selectedHistorySession = useMemo(() => {
    if (!sessions.length) return null;
    if (!activeSessionId) return sessions[0];
    return sessions.find((session) => session.sessionId === activeSessionId) || sessions[0];
  }, [activeSessionId, sessions]);

  async function handlePhotoUpload(endId: string, file: File) {
    if (!meta || !activeSession) return;
    setUploadingEndId(endId);
    try {
      const uploaded = await uploadEndPhoto(meta.spreadsheetId, endId, file);
      updateSession((session) => ({
        ...session,
        ends: session.ends.map((end) =>
          end.endId === endId
            ? {
                ...end,
                photoFileId: uploaded.fileId,
                photoName: uploaded.name,
                photoUploadedAt: new Date().toISOString(),
                photoWebViewLink: uploaded.webViewLink || null
              }
            : end
        )
      }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Photo upload failed");
    } finally {
      setUploadingEndId(null);
    }
  }

  async function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationNotice({ type: "error", text: "Geolocation is not supported by this browser." });
      return;
    }

    setIsLocating(true);
    setLocationNotice(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        let resolvedLocation = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        let usedAddress = false;
        let geocodeFailure: string | null = null;

        try {
          const geocoded = await reverseGeocode(lat, lng);
          if (geocoded.formattedAddress) {
            resolvedLocation = geocoded.formattedAddress;
            usedAddress = true;
          }
        } catch (error) {
          geocodeFailure = error instanceof Error ? error.message : "Unable to resolve nearest address";
          // Keep coordinate fallback if reverse geocode fails.
        }

        updateSession((session) => ({
          ...session,
          location: resolvedLocation,
          locationLat: lat,
          locationLng: lng
        }));

        setLocationNotice(
          usedAddress
            ? { type: "info", text: "Location auto-filled from nearest address." }
            : {
                type: "warn",
                text: `Could not resolve nearest address. Saved coordinates instead.${
                  geocodeFailure ? ` (${geocodeFailure})` : ""
                }`
              }
        );

        setIsLocating(false);
      },
      (error) => {
        setLocationNotice({ type: "error", text: `Location request failed: ${error.message}` });
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  if (isLoading) {
    return (
      <main className="page-wrap">
        <section className="loading-card">Preparing your range log...</section>
      </main>
    );
  }

  if (!authSession) {
    return (
      <main className="page-wrap">
        <section className="hero-card hero-split">
          <div className="hero-copy">
            <span className="eyebrow">Shoot With Ceech</span>
            <h1>Train any day. Own every session.</h1>
            <p>
              Sign in with Google, grant read/write access to your spreadsheet, and keep your archery history
              entirely in your own Drive.
            </p>
            <a className="button primary" href="/api/auth/google/start">
              Continue with Google
            </a>
          </div>
          <div
            className="hero-media"
            role="img"
            aria-label="Archer aiming at a 10-ring target during sunset"
          />
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Personal Sheets Edition</span>
          <h1>Shoot With Ceech</h1>
        </div>
        <div className="topbar-actions">
          <span className={`sync-pill ${syncState.replace(" ", "-").toLowerCase()}`}>{syncState}</span>
          <button className="button" onClick={() => void syncNow()}>
            Sync now
          </button>
          <button className="button" onClick={() => void signOut()}>
            Log out
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard label="Sessions" value={String(stats.sessionCount)} />
        <StatCard label="Arrows" value={String(stats.arrowCount)} />
        <StatCard label="Avg/Arrow" value={stats.avgPerArrow.toFixed(2)} />
        <StatCard label="Total Points" value={String(stats.totalPoints)} />
      </section>

      {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

      <nav className="tabbar" aria-label="Primary sections">
        {([
          ["editor", "Session Editor"],
          ["history", "History"],
          ["analytics", "Analytics"],
          ["account", "Account"]
        ] as Array<[Tab, string]>).map(([value, label]) => (
          <button
            key={value}
            className={`tab-button ${tab === value ? "active" : ""}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "editor" && activeSession ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Session Editor</h2>
            <div className="stack-row">
              <input
                type="date"
                value={activeSession.sessionDate}
                onChange={(event) =>
                  updateSession((session) => ({ ...session, sessionDate: event.target.value || session.sessionDate }))
                }
              />
              <button className="button" onClick={() => addSession(new Date().toISOString().slice(0, 10))}>
                New Session
              </button>
            </div>
          </div>

          <label className="field-label">
            Location
            <div className="location-row">
              <input
                type="text"
                value={activeSession.location}
                onChange={(event) =>
                  updateSession((session) => ({
                    ...session,
                    location: event.target.value,
                    locationLat: null,
                    locationLng: null
                  }))
                }
                onInput={() => setLocationNotice(null)}
                placeholder="Address or range name"
              />
              <button className="button" onClick={() => void handleUseCurrentLocation()} disabled={isLocating}>
                {isLocating ? "Locating..." : "Use Current Location"}
              </button>
              <a
                className={`button ${activeSession.location.trim() ? "" : "disabled-link"}`}
                href={
                  activeSession.location.trim()
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeSession.location.trim())}`
                    : "#"
                }
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  if (!activeSession.location.trim()) {
                    event.preventDefault();
                  }
                }}
              >
                Open in Google Maps
              </a>
            </div>
            {locationNotice ? (
              <p className={`location-notice ${locationNotice.type}`}>{locationNotice.text}</p>
            ) : null}
          </label>

          <label className="field-label">
            Notes
            <textarea
              value={activeSession.notes}
              onChange={(event) => updateSession((session) => ({ ...session, notes: event.target.value }))}
              placeholder="Weather, focus notes, sight adjustments..."
            />
          </label>

          <div className="ends-grid">
            <div className="score-table-wrap" style={scoreTableStyle}>
              <div className="ends-toolbar">
                <p>Ends: {activeSession.ends.length}</p>
                <div className="shots-per-session-control" aria-label="Shots per end for this session">
                  <span>Shots/End</span>
                  <button
                    className="icon-button"
                    disabled={sessionShotsCount <= 3}
                    title={sessionShotsCount <= 3 ? "Minimum 3 shots per end" : "Decrease shots per end"}
                    onClick={() =>
                      updateSession((session) => applySessionShotsCount(session, Math.max(3, sessionShotsCount - 1)))
                    }
                  >
                    -
                  </button>
                  <strong>{sessionShotsCount}</strong>
                  <button
                    className="icon-button"
                    disabled={sessionShotsCount >= 12}
                    title={sessionShotsCount >= 12 ? "Maximum 12 shots per end" : "Increase shots per end"}
                    onClick={() =>
                      updateSession((session) => applySessionShotsCount(session, Math.min(12, sessionShotsCount + 1)))
                    }
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="score-table-head">
                <span>End</span>
                <span>Distance (m)</span>
                <span>Shots</span>
                <span>Arrow Scores (10-ring, X/M)</span>
                <span>End Total</span>
                <span>X</span>
                <span>Running Total</span>
                <span>Actions</span>
              </div>
              {activeSession.ends.map((end) => {
                const total = end.shots.reduce((sum, shot) => sum + shot.score, 0);
                const xCount = end.shots.filter((shot) => shot.value === "X").length;
                const running = runningTotals.get(end.endId) ?? 0;

                return (
              <article key={end.endId} className="end-card">
                <h3>End {end.endIndex}</h3>
                <label className="distance-field inline">
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={end.distanceMeters}
                    onChange={(event) => {
                      const nextMeters = Math.min(300, Math.max(1, Math.round(Number(event.target.value) || 1)));
                      updateSession((session) => ({
                        ...session,
                        ends: session.ends.map((currentEnd) =>
                          currentEnd.endId === end.endId
                            ? { ...currentEnd, distanceMeters: nextMeters }
                            : currentEnd
                        )
                      }));
                    }}
                  />
                </label>
                <p className="shots-count-static">{end.shots.length}</p>
                <div className="shots-grid inline-scores">
                  {end.shots.map((shot) => (
                    <div key={shot.shotId} className="shot-input">
                      <span>{shot.shotIndex}</span>
                      <ShotWheelPicker
                        value={shot.value}
                        label={`End ${end.endIndex} Shot ${shot.shotIndex}`}
                        onChange={({ value, score }) => {
                          updateSession((session) => ({
                            ...session,
                            ends: session.ends.map((currentEnd) =>
                              currentEnd.endId === end.endId
                                ? {
                                    ...currentEnd,
                                    shots: currentEnd.shots.map((currentShot) =>
                                      currentShot.shotId === shot.shotId
                                        ? { ...currentShot, score, value }
                                        : currentShot
                                    )
                                  }
                                : currentEnd
                            )
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
                <p className="end-total"><strong>{total}</strong></p>
                <p className="end-total"><strong>{xCount}</strong></p>
                <p className="end-total"><strong>{running}</strong></p>
                <p className="mobile-end-summary">
                  <span>End Total: <strong>{total}</strong></span>
                  <span>X: <strong>{xCount}</strong></span>
                  <span>Running Total: <strong>{running}</strong></span>
                </p>
                <div className="end-actions">
                  <span className={`photo-indicator ${end.photoFileId ? "attached" : ""}`} aria-hidden="true" />
                  <input
                    id={`photo-upload-${end.endId}`}
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void handlePhotoUpload(end.endId, file);
                      event.currentTarget.value = "";
                    }}
                  />
                  <label
                    htmlFor={`photo-upload-${end.endId}`}
                    className="icon-action"
                    title={end.photoFileId ? "Replace end photo" : "Add end photo"}
                    aria-label={end.photoFileId ? "Replace end photo" : "Add end photo"}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M7 6h3l1.4-2h5.2L18 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Zm5 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-2.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z" />
                    </svg>
                  </label>
                  <a
                    className="icon-action"
                    href={end.photoWebViewLink || "#"}
                    target="_blank"
                    rel="noreferrer"
                    title={end.photoWebViewLink ? "View photo" : "No photo attached"}
                    aria-label={end.photoWebViewLink ? "View photo" : "No photo attached"}
                    aria-disabled={!end.photoWebViewLink}
                    onClick={(event) => {
                      if (!end.photoWebViewLink) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M12 5c5.6 0 9.7 4.3 11 6.5-1.3 2.2-5.4 6.5-11 6.5S2.3 13.7 1 11.5C2.3 9.3 6.4 5 12 5Zm0 2c-4.2 0-7.4 2.8-8.8 4.5C4.6 13.2 7.8 16 12 16s7.4-2.8 8.8-4.5C19.4 9.8 16.2 7 12 7Zm0 1.6a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Z" />
                    </svg>
                  </a>
                  <button
                    className="icon-action danger"
                    disabled={activeSession.ends.length <= 1}
                    title={activeSession.ends.length <= 1 ? "At least one end is required" : `Remove end ${end.endIndex}`}
                    aria-label={activeSession.ends.length <= 1 ? "Cannot remove last end" : `Remove end ${end.endIndex}`}
                    onClick={() =>
                      updateSession((session) => removeEnd(session, end.endId))
                    }
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM8 10h2v8H8v-8Z" />
                    </svg>
                  </button>
                  {uploadingEndId === end.endId ? <span className="tiny-link">Uploading...</span> : null}
                </div>
              </article>
                );
              })}
            </div>
            <div className="editor-actions">
              <button className="button" onClick={() => updateSession((session) => addEnd(session))}>
                + Add End
              </button>
              <button className="button primary" onClick={() => void syncNow()}>
                Save + Sync
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="panel">
          <h2>History</h2>
          <div className="history-list">
            {sessions.map((session) => (
              <article key={session.sessionId} className={`history-item ${activeSessionId === session.sessionId ? "active" : ""}`}>
                <button onClick={() => setActiveSessionId(session.sessionId)}>
                  <strong>{session.sessionDate}</strong>
                  <span>{session.ends.length} ends</span>
                  <span>{sessionArrows(session)} arrows</span>
                  <span>{sessionTotal(session)} pts</span>
                </button>
                <div className="history-item-actions">
                  <button
                    className="icon-action"
                    title={`Edit ${session.sessionDate}`}
                    aria-label={`Edit ${session.sessionDate}`}
                    onClick={() => {
                      setActiveSessionId(session.sessionId);
                      setTab("editor");
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M16.8 3.5a2.4 2.4 0 0 1 3.4 3.4l-9.6 9.6-4.4 1 1-4.4 9.6-9.6Zm-8 10.3-.4 1.8 1.8-.4 8.7-8.7-1.4-1.4-8.7 8.7Z" />
                    </svg>
                  </button>
                  <button className="danger-link" onClick={() => deleteSession(session.sessionId)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          {selectedHistorySession ? (
            <article className="history-detail-card">
              <div className="panel-head">
                <h3>{selectedHistorySession.sessionDate} (Read Only)</h3>
                <span>{selectedHistorySession.location || "No location"}</span>
              </div>
              <p className="helper-text">{selectedHistorySession.notes || "No notes for this session."}</p>
              <div className="history-ends-readonly">
                {selectedHistorySession.ends.map((end) => (
                  <div key={end.endId} className="history-end-row">
                    <span>End {end.endIndex}</span>
                    <span>{end.distanceMeters}m</span>
                    <span>{end.shots.map((shot) => shot.value).join(" ")}</span>
                    <strong>{end.shots.reduce((sum, shot) => sum + shot.score, 0)}</strong>
                    {end.photoWebViewLink ? (
                      <a className="tiny-link" href={end.photoWebViewLink} target="_blank" rel="noreferrer">
                        View Photo
                      </a>
                    ) : (
                      <span className="tiny-link muted">No Photo</span>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      {tab === "analytics" ? (
        <section className="panel">
          <h2>Analytics</h2>
          <div className="stats-grid">
            <StatCard label="Total Points" value={String(stats.totalPoints)} />
            <StatCard label="Rolling Avg" value={stats.avgPerArrow.toFixed(2)} />
            <StatCard label="Best Session" value={String(Math.max(0, ...sessions.map((s) => sessionTotal(s))))} />
            <StatCard label="Ends Logged" value={String(sessions.reduce((sum, s) => sum + s.ends.length, 0))} />
          </div>
          <div className="trend-bars">
            {sessions.slice(0, 12).reverse().map((session) => {
              const total = sessionTotal(session);
              return (
                <div key={session.sessionId} className="trend-bar-wrap">
                  <span>{session.sessionDate.slice(5)}</span>
                  <div className="trend-bar" style={{ height: `${Math.min(100, total)}%` }} />
                  <small>{total}</small>
                </div>
              );
            })}
          </div>
          {activeSession ? (
            <div className="active-avg-chart">
              <h3>Active Session Avg Points / Shot</h3>
              <div className="active-avg-bars">
                {activeSession.ends.map((end) => {
                  const endTotal = end.shots.reduce((sum, shot) => sum + shot.score, 0);
                  const avgPerShot = end.shots.length ? endTotal / end.shots.length : 0;
                  return (
                    <div key={end.endId} className="active-avg-bar-wrap">
                      <span>E{end.endIndex}</span>
                      <div className="active-avg-bar-track">
                        <div
                          className="active-avg-bar-fill"
                          style={{ width: `${Math.max(4, Math.min(100, (avgPerShot / 10) * 100))}%` }}
                        />
                      </div>
                      <strong>{avgPerShot.toFixed(2)}</strong>
                    </div>
                  );
                })}
              </div>
              <p className="helper-text">Active session average point/shot: {sessionAvgPerArrow(activeSession).toFixed(2)}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "account" ? (
        <section className="panel">
          <h2>Account & Storage</h2>
          <p>
            Signed in as <strong>{authSession.user.email}</strong>
          </p>
          <p>
            Linked Sheet: <strong>{meta?.spreadsheetTitle || "Not linked"}</strong>
          </p>
          <p>
            Spreadsheet ID: <code>{meta?.spreadsheetId || "-"}</code>
          </p>
          <p>Last Sync: {meta?.lastSyncedAt || "No successful sync yet"}</p>
          <div className="stack-row">
            <button className="button" onClick={() => void syncNow()}>
              Re-sync
            </button>
            <button
              className="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "archery-sessions.json";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export JSON
            </button>
            <button
              className="button"
              onClick={() => {
                const rows = [
                  "session_date,location,total_points,arrows,avg_per_arrow,notes",
                  ...sessions.map(
                    (s) =>
                      `${s.sessionDate},"${s.location.replaceAll('"', '""')}",${sessionTotal(s)},${sessionArrows(s)},${sessionAvgPerArrow(s).toFixed(2)},"${s.notes.replaceAll('"', '""')}"`
                  )
                ];
                const blob = new Blob([rows.join("\n")], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "archery-sessions.csv";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </button>
          </div>
          <p className="privacy-note">
            Privacy default: this app does not keep a centralized log database. Your practice data lives in your
            personal Google Sheet.
          </p>
        </section>
      ) : null}
    </main>
  );
}
