import { NextRequest, NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  try {
    const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
    if (!fileId) {
      return NextResponse.json({ error: "fileId is required" }, { status: 400 });
    }

    const accessToken = await requireAccessToken();
    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      }
    );

    if (!driveResponse.ok) {
      const text = await driveResponse.text();
      return NextResponse.json(
        { error: `Unable to load photo: ${driveResponse.status} ${text}` },
        { status: driveResponse.status }
      );
    }

    const bytes = await driveResponse.arrayBuffer();
    const contentType = driveResponse.headers.get("content-type") || "image/jpeg";
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=120"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load photo" },
      { status: 400 }
    );
  }
}
