import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { buildGoogleOAuthUrl, setOauthStateCookie } from "@/lib/server/auth";

export async function GET() {
  const state = randomUUID();
  await setOauthStateCookie(state);
  return NextResponse.redirect(buildGoogleOAuthUrl(state));
}
