import { NextRequest, NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/server/auth";
import { pullSessions } from "@/lib/server/sheets";

export async function GET(request: NextRequest) {
  const spreadsheetId = request.nextUrl.searchParams.get("spreadsheetId");
  if (!spreadsheetId) {
    return NextResponse.json({ error: "spreadsheetId is required" }, { status: 400 });
  }

  try {
    const accessToken = await requireAccessToken();
    const sessions = await pullSessions(spreadsheetId, accessToken);
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pull failed" },
      { status: 401 }
    );
  }
}
