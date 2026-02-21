import { Session } from "@/lib/types";

const SHEET_TITLE = "Shoot With Ceech Log";
const APP_PROPERTY_KEY = "archery_app";
const APP_PROPERTY_VALUE = "v2_personal_sheets";

async function googleFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API request failed: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}

export async function findSpreadsheet(accessToken: string): Promise<{ id: string; name: string } | null> {
  const query = encodeURIComponent(
    `appProperties has { key='${APP_PROPERTY_KEY}' and value='${APP_PROPERTY_VALUE}' } and trashed=false`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1`;
  const response = await googleFetch<{ files?: Array<{ id: string; name: string }> }>(url, accessToken);
  const file = response.files?.[0];
  if (!file) return null;
  return { id: file.id, name: file.name };
}

export async function createSpreadsheet(accessToken: string): Promise<{ id: string; name: string }> {
  const body = {
    properties: { title: SHEET_TITLE },
    sheets: [{ properties: { title: "sessions" } }, { properties: { title: "ends" } }, { properties: { title: "shots" } }, { properties: { title: "meta" } }]
  };

  const created = await googleFetch<{ spreadsheetId: string; properties: { title: string } }>(
    "https://sheets.googleapis.com/v4/spreadsheets",
    accessToken,
    { method: "POST", body: JSON.stringify(body) }
  );

  try {
    await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${created.spreadsheetId}`,
      accessToken,
      {
        method: "PATCH",
        body: JSON.stringify({ appProperties: { [APP_PROPERTY_KEY]: APP_PROPERTY_VALUE } })
      }
    );
  } catch {
    // Continue even if Drive metadata patch is unavailable.
  }

  await ensureSchema(created.spreadsheetId, accessToken);

  return { id: created.spreadsheetId, name: created.properties.title };
}

async function writeRange(spreadsheetId: string, range: string, values: string[][], accessToken: string): Promise<void> {
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values })
    }
  );
}

export async function ensureSchema(spreadsheetId: string, accessToken: string): Promise<void> {
  await writeRange(
    spreadsheetId,
    "sessions!A1:H1",
    [["session_id", "session_date", "created_at", "updated_at", "location", "notes", "location_lat", "location_lng"]],
    accessToken
  );
  await writeRange(
    spreadsheetId,
    "ends!A1:J1",
    [[
      "end_id",
      "session_id",
      "end_index",
      "shots_count",
      "distance_meters",
      "end_total",
      "photo_file_id",
      "photo_name",
      "photo_uploaded_at",
      "photo_web_view_link"
    ]],
    accessToken
  );
  await writeRange(
    spreadsheetId,
    "shots!A1:E1",
    [["shot_id", "end_id", "shot_index", "score", "shot_value"]],
    accessToken
  );
  await writeRange(spreadsheetId, "meta!A1:B1", [["key", "value"]], accessToken);
}

async function clearDataRows(spreadsheetId: string, range: string, accessToken: string): Promise<void> {
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    accessToken,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function pushSessions(spreadsheetId: string, sessions: Session[], accessToken: string): Promise<void> {
  const sessionRows = sessions.map((s) => [
    s.sessionId,
    s.sessionDate,
    s.createdAt,
    s.updatedAt,
    s.location || "",
    s.notes,
    s.locationLat == null ? "" : String(s.locationLat),
    s.locationLng == null ? "" : String(s.locationLng)
  ]);
  const endRows: string[][] = [];
  const shotRows: string[][] = [];

  for (const session of sessions) {
    for (const end of session.ends) {
      const endTotal = end.shots.reduce((sum, shot) => sum + shot.score, 0);
      endRows.push([
        end.endId,
        session.sessionId,
        String(end.endIndex),
        String(end.shots.length),
        String(end.distanceMeters),
        String(endTotal),
        end.photoFileId || "",
        end.photoName || "",
        end.photoUploadedAt || "",
        end.photoWebViewLink || ""
      ]);
      for (const shot of end.shots) {
        shotRows.push([shot.shotId, end.endId, String(shot.shotIndex), String(shot.score), shot.value]);
      }
    }
  }

  await clearDataRows(spreadsheetId, "sessions!A2:H", accessToken);
  await clearDataRows(spreadsheetId, "ends!A2:J", accessToken);
  await clearDataRows(spreadsheetId, "shots!A2:E", accessToken);

  if (sessionRows.length) {
    await writeRange(spreadsheetId, `sessions!A2:H${sessionRows.length + 1}`, sessionRows, accessToken);
  }
  if (endRows.length) {
    await writeRange(spreadsheetId, `ends!A2:J${endRows.length + 1}`, endRows, accessToken);
  }
  if (shotRows.length) {
    await writeRange(spreadsheetId, `shots!A2:E${shotRows.length + 1}`, shotRows, accessToken);
  }

  await writeRange(spreadsheetId, "meta!A2:B2", [["last_synced_at", new Date().toISOString()]], accessToken);
}

async function getSheetValues(spreadsheetId: string, range: string, accessToken: string): Promise<string[][]> {
  const result = await googleFetch<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    accessToken
  );
  return result.values ?? [];
}

export async function pullSessions(spreadsheetId: string, accessToken: string): Promise<Session[]> {
  const [sessionRows, endRows, shotRows] = await Promise.all([
    getSheetValues(spreadsheetId, "sessions!A2:H", accessToken),
    getSheetValues(spreadsheetId, "ends!A2:J", accessToken),
    getSheetValues(spreadsheetId, "shots!A2:E", accessToken)
  ]);

  const shotsByEnd = new Map<string, Array<{ shotId: string; shotIndex: number; score: number; value: string }>>();
  for (const row of shotRows) {
    const [shotId = "", endId = "", shotIndex = "0", score = "0", shotValue = ""] = row;
    if (!endId || !shotId) continue;
    const list = shotsByEnd.get(endId) || [];
    list.push({
      shotId,
      shotIndex: Number(shotIndex),
      score: Number(score),
      value: shotValue || (Number(score) === 0 ? "M" : String(Number(score)))
    });
    shotsByEnd.set(endId, list);
  }

  const endsBySession = new Map<
    string,
    Array<{
      endId: string;
      endIndex: number;
      distanceMeters: number;
      photoFileId: string | null;
      photoName: string | null;
      photoUploadedAt: string | null;
      photoWebViewLink: string | null;
      shots: Array<{ shotId: string; shotIndex: number; score: number; value: string }>;
    }>
  >();
  for (const row of endRows) {
    const [
      endId = "",
      sessionId = "",
      endIndex = "0",
      ,
      distanceMeters = "18",
      ,
      photoFileId = "",
      photoName = "",
      photoUploadedAt = "",
      photoWebViewLink = ""
    ] = row;
    if (!sessionId || !endId) continue;
    const list = endsBySession.get(sessionId) || [];
    list.push({
      endId,
      endIndex: Number(endIndex),
      distanceMeters: Number(distanceMeters) || 18,
      photoFileId: photoFileId || null,
      photoName: photoName || null,
      photoUploadedAt: photoUploadedAt || null,
      photoWebViewLink: photoWebViewLink || null,
      shots: (shotsByEnd.get(endId) || []).sort((a, b) => a.shotIndex - b.shotIndex)
    });
    endsBySession.set(sessionId, list);
  }

  const sessions: Session[] = [];
  for (const row of sessionRows) {
    const [sessionId = "", sessionDate = "", createdAt = "", updatedAt = ""] = row;
    if (!sessionId) continue;
    const location = row.length >= 6 ? row[4] || "" : "";
    const notes = row.length >= 6 ? row[5] || "" : row[4] || "";
    const locationLat = row.length >= 8 && row[6] ? Number(row[6]) : null;
    const locationLng = row.length >= 8 && row[7] ? Number(row[7]) : null;
    sessions.push({
      sessionId,
      sessionDate,
      createdAt,
      updatedAt,
      location,
      locationLat: Number.isFinite(locationLat) ? locationLat : null,
      locationLng: Number.isFinite(locationLng) ? locationLng : null,
      notes,
      ends: (endsBySession.get(sessionId) || []).sort((a, b) => a.endIndex - b.endIndex)
    });
  }

  return sessions.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
}
