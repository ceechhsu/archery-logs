const PHOTOS_FOLDER_NAME = "ArrowLog Photos";
const PHOTO_FOLDER_KEY = "archery_photos_folder";
const PHOTO_FOLDER_VALUE = "v2_personal_sheets";
let cachedPhotosFolderId: string | null = null;

async function googleFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

async function findPhotosFolder(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and appProperties has { key='${PHOTO_FOLDER_KEY}' and value='${PHOTO_FOLDER_VALUE}' } and trashed=false`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`;
  const result = await googleFetch<{ files?: Array<{ id: string }> }>(url, accessToken);
  return result.files?.[0]?.id || null;
}

async function createPhotosFolder(accessToken: string): Promise<string> {
  const result = await googleFetch<{ id: string }>("https://www.googleapis.com/drive/v3/files?fields=id", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: PHOTOS_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: {
        [PHOTO_FOLDER_KEY]: PHOTO_FOLDER_VALUE
      }
    })
  });
  return result.id;
}

async function ensurePhotosFolder(accessToken: string): Promise<string> {
  if (cachedPhotosFolderId) return cachedPhotosFolderId;
  const existing = await findPhotosFolder(accessToken);
  if (existing) {
    cachedPhotosFolderId = existing;
    return existing;
  }
  const created = await createPhotosFolder(accessToken);
  cachedPhotosFolderId = created;
  return created;
}

export async function uploadEndPhotoToDrive(params: {
  accessToken: string;
  spreadsheetId: string;
  endId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
}): Promise<{ fileId: string; name: string; webViewLink?: string }> {
  const folderId = await ensurePhotosFolder(params.accessToken);
  const safeName = `${params.spreadsheetId.slice(0, 8)}_${params.endId}_${Date.now()}_${params.fileName}`;
  const boundary = `archery-photo-${Date.now().toString(36)}`;
  const metadata = {
    name: safeName,
    parents: [folderId]
  };
  const multipartBody = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${params.mimeType || "application/octet-stream"}\r\n\r\n`,
    new Uint8Array(params.bytes),
    `\r\n--${boundary}--`
  ]);

  const uploadResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: multipartBody,
    cache: "no-store"
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Photo upload failed: ${uploadResponse.status} ${text}`);
  }

  const uploaded = (await uploadResponse.json()) as { id: string; name: string; webViewLink?: string };

  return {
    fileId: uploaded.id,
    name: uploaded.name,
    webViewLink: uploaded.webViewLink
  };
}
