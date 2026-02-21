export type SyncState = "Not synced" | "Syncing" | "Synced" | "Sync failed";

export interface Shot {
  shotId: string;
  shotIndex: number;
  score: number;
  value: string;
}

export interface End {
  endId: string;
  endIndex: number;
  distanceMeters: number;
  photoFileId?: string | null;
  photoName?: string | null;
  photoUploadedAt?: string | null;
  photoWebViewLink?: string | null;
  shots: Shot[];
}

export interface Session {
  sessionId: string;
  sessionDate: string;
  createdAt: string;
  updatedAt: string;
  location: string;
  locationLat?: number | null;
  locationLng?: number | null;
  notes: string;
  ends: End[];
}

export interface AppMeta {
  spreadsheetId: string;
  spreadsheetTitle: string;
  lastSyncedAt?: string;
}

export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthSession {
  user: SessionUser;
  expiresAt: number;
}

export interface QueueEntry {
  id: string;
  createdAt: string;
  payload: Session[];
}
