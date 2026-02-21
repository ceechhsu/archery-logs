import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/server/auth";
import { createSpreadsheet, ensureSchema, findSpreadsheet } from "@/lib/server/sheets";

export async function POST() {
  try {
    const accessToken = await requireAccessToken();
    try {
      const existing = await findSpreadsheet(accessToken);
      if (existing) {
        await ensureSchema(existing.id, accessToken);
        return NextResponse.json({ spreadsheetId: existing.id, spreadsheetTitle: existing.name });
      }
    } catch {
      // If Drive API lookup is unavailable, continue with create flow.
    }

    const created = await createSpreadsheet(accessToken);
    return NextResponse.json({ spreadsheetId: created.id, spreadsheetTitle: created.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bootstrap failed" },
      { status: 400 }
    );
  }
}
