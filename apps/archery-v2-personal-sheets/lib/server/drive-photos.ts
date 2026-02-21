const PHOTOS_FOLDER_NAME = "Shoot With Ceech Photos";
const PHOTO_FOLDER_KEY = "archery_photos_folder";
const PHOTO_FOLDER_VALUE = "v2_personal_sheets";

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
  const existing = await findPhotosFolder(accessToken);
  if (existing) return existing;
  return createPhotosFolder(accessToken);
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
  const mediaResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=media&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": params.mimeType || "application/octet-stream"
    },
    body: params.bytes,
    cache: "no-store"
  });

  if (!mediaResponse.ok) {
    const text = await mediaResponse.text();
    throw new Error(`Photo upload failed: ${mediaResponse.status} ${text}`);
  }

  const uploaded = (await mediaResponse.json()) as { id: string };
  const safeName = `${params.spreadsheetId.slice(0, 8)}_${params.endId}_${Date.now()}_${params.fileName}`;

  const patched = await googleFetch<{ id: string; name: string; webViewLink?: string }>(
    `https://www.googleapis.com/drive/v3/files/${uploaded.id}?addParents=${encodeURIComponent(folderId)}&fields=id,name,webViewLink`,
    params.accessToken,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: safeName })
    }
  );

  return {
    fileId: patched.id,
    name: patched.name,
    webViewLink: patched.webViewLink
  };
}
