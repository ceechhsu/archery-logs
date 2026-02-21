import { AppMeta, AuthSession, Session } from "@/lib/types";

export async function fetchSession(): Promise<AuthSession | null> {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  if (!response.ok) return null;
  const json = (await response.json()) as { session: AuthSession | null };
  return json.session;
}

export async function bootstrapSheet(): Promise<AppMeta> {
  const response = await fetch("/api/sheets/bootstrap", { method: "POST" });
  if (!response.ok) {
    let message = "Could not initialize Google Sheet. Check OAuth scopes.";
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) {
        message = json.error;
      }
    } catch {
      // fall back to generic message
    }
    throw new Error(message);
  }
  const json = (await response.json()) as { spreadsheetId: string; spreadsheetTitle: string };
  return {
    spreadsheetId: json.spreadsheetId,
    spreadsheetTitle: json.spreadsheetTitle
  };
}

export async function pullSheet(spreadsheetId: string): Promise<Session[]> {
  const response = await fetch(`/api/sheets/pull?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Unable to load sheet data.");
  }
  const json = (await response.json()) as { sessions: Session[] };
  return json.sessions;
}

export async function pushSheet(spreadsheetId: string, sessions: Session[]): Promise<string> {
  const response = await fetch("/api/sheets/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spreadsheetId, sessions })
  });

  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error || "Unable to sync to Google Sheets.");
  }

  const json = (await response.json()) as { syncedAt: string };
  return json.syncedAt;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function uploadEndPhoto(
  spreadsheetId: string,
  endId: string,
  file: File
): Promise<{ fileId: string; name: string; webViewLink?: string }> {
  const formData = new FormData();
  formData.set("spreadsheetId", spreadsheetId);
  formData.set("endId", endId);
  formData.set("file", file);

  const response = await fetch("/api/photos/upload", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "Photo upload failed");
  }

  const json = (await response.json()) as {
    fileId: string;
    name: string;
    webViewLink?: string;
  };
  return json;
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ formattedAddress: string }> {
  const response = await fetch("/api/maps/reverse-geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng })
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "Unable to resolve location address");
  }

  return (await response.json()) as { formattedAddress: string };
}
