import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAccessToken } from "@/lib/server/auth";
import { pullSessions, pushSessions } from "@/lib/server/sheets";

const payloadSchema = z.object({
  spreadsheetId: z.string().min(1),
  sessions: z.array(
    z.object({
      sessionId: z.string(),
      sessionDate: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      location: z.string(),
      locationLat: z.number().nullable().optional(),
      locationLng: z.number().nullable().optional(),
      notes: z.string(),
      photos: z
        .array(
          z.object({
            fileId: z.string(),
            name: z.string(),
            webViewLink: z.string().nullable().optional(),
            uploadedAt: z.string()
          })
        )
        .optional(),
      ends: z.array(
        z.object({
          endId: z.string(),
          endIndex: z.number(),
          distanceMeters: z.number().min(1).max(300).nullable(),
          photoFileId: z.string().nullable().optional(),
          photoName: z.string().nullable().optional(),
          photoUploadedAt: z.string().nullable().optional(),
          photoWebViewLink: z.string().nullable().optional(),
          shots: z.array(
            z.object({
              shotId: z.string(),
              shotIndex: z.number(),
              score: z.number().int().min(0).max(10),
              value: z.string().regex(/^(X|M|10|[1-9])$/)
            })
          )
        })
      )
    })
  )
});

export async function POST(request: NextRequest) {
  try {
    const parsed = payloadSchema.parse(await request.json());
    const accessToken = await requireAccessToken();
    await pushSessions(parsed.spreadsheetId, parsed.sessions, accessToken);
    const persisted = await pullSessions(parsed.spreadsheetId, accessToken);
    const endsCount = parsed.sessions.reduce((sum, session) => sum + session.ends.length, 0);
    const shotsCount = parsed.sessions.reduce(
      (sum, session) => sum + session.ends.reduce((inner, end) => inner + end.shots.length, 0),
      0
    );
    const persistedEnds = persisted.reduce((sum, session) => sum + session.ends.length, 0);
    const persistedShots = persisted.reduce(
      (sum, session) => sum + session.ends.reduce((inner, end) => inner + end.shots.length, 0),
      0
    );
    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      counts: {
        sessions: parsed.sessions.length,
        ends: endsCount,
        shots: shotsCount
      },
      persisted: {
        sessions: persisted.length,
        ends: persistedEnds,
        shots: persistedShots
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Push failed" },
      { status: 400 }
    );
  }
}
