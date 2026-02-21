import { NextRequest, NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/server/auth";
import { uploadEndPhotoToDrive } from "@/lib/server/drive-photos";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const spreadsheetId = String(formData.get("spreadsheetId") || "").trim();
    const endId = String(formData.get("endId") || "").trim();
    const file = formData.get("file");

    if (!spreadsheetId || !endId) {
      return NextResponse.json({ error: "spreadsheetId and endId are required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const accessToken = await requireAccessToken();
    const bytes = await file.arrayBuffer();
    const uploaded = await uploadEndPhotoToDrive({
      accessToken,
      spreadsheetId,
      endId,
      fileName: file.name || "end-photo.jpg",
      mimeType: file.type || "image/jpeg",
      bytes
    });

    return NextResponse.json(uploaded);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Photo upload failed" },
      { status: 400 }
    );
  }
}
