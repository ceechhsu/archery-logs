import { AppMeta, AuthSession, Session } from "@/lib/types";

const MAX_UPLOAD_DIMENSION = 1800;
const JPEG_QUALITY = 0.78;
const MIN_COMPRESSION_SAVINGS_RATIO = 0.9;
const FAST_MODE_SOURCE_THRESHOLD_BYTES = 6 * 1024 * 1024;
const FAST_MODE_MAX_UPLOAD_DIMENSION = 1400;
const FAST_MODE_JPEG_QUALITY = 0.68;

export type UploadPhase = "optimizing" | "uploading";

export interface UploadProgress {
  phase: UploadPhase;
  percent: number | null;
}

interface UploadEndPhotoOptions {
  onProgress?: (progress: UploadProgress) => void;
}

function fileNameToJpeg(name: string): string {
  if (!name) return `photo-${Date.now()}.jpg`;
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}

async function loadImageElement(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode image"));
  });
  return { image, objectUrl };
}

async function optimizeImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let objectUrl: string | null = null;
  try {
    const loaded = await loadImageElement(file);
    const image = loaded.image;
    objectUrl = loaded.objectUrl;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return file;

    const useFastMode = file.size >= FAST_MODE_SOURCE_THRESHOLD_BYTES;
    const targetDimension = useFastMode ? FAST_MODE_MAX_UPLOAD_DIMENSION : MAX_UPLOAD_DIMENSION;
    const targetQuality = useFastMode ? FAST_MODE_JPEG_QUALITY : JPEG_QUALITY;

    const scale = Math.min(1, targetDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", targetQuality);
    });

    if (!compressedBlob) return file;
    if (compressedBlob.size >= file.size * MIN_COMPRESSION_SAVINGS_RATIO) {
      return file;
    }

    return new File([compressedBlob], fileNameToJpeg(file.name), {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  } catch {
    return file;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function postFormDataWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (progress: UploadProgress) => void
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (!event.lengthComputable) {
        onProgress({ phase: "uploading", percent: null });
        return;
      }
      const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      onProgress({ phase: "uploading", percent });
    };

    xhr.onerror = () => reject(new Error("Photo upload failed"));
    xhr.onabort = () => reject(new Error("Photo upload aborted"));
    xhr.onload = () => {
      const headers = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim().split(/\r?\n/);
      for (const line of rawHeaders) {
        if (!line) continue;
        const index = line.indexOf(":");
        if (index <= 0) continue;
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        headers.append(key, value);
      }
      resolve(new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers }));
    };

    xhr.send(formData);
  });
}

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
  file: File,
  options?: UploadEndPhotoOptions
): Promise<{ fileId: string; name: string; webViewLink?: string }> {
  options?.onProgress?.({ phase: "optimizing", percent: null });
  const optimizedFile = await optimizeImageForUpload(file);

  const formData = new FormData();
  formData.set("spreadsheetId", spreadsheetId);
  formData.set("endId", endId);
  formData.set("file", optimizedFile);

  const response = await postFormDataWithProgress("/api/photos/upload", formData, options?.onProgress);

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
