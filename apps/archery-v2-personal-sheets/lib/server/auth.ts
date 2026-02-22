import { JWTPayload, SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/server/env";
import { AuthSession } from "@/lib/types";

const SESSION_COOKIE = "archery_session";
const OAUTH_STATE_COOKIE = "archery_oauth_state";

export function scopes(): string[] {
  return [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file"
  ];
}

export function buildGoogleOAuthUrl(state: string): string {
  const env = serverEnv();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: scopes().join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const env = serverEnv();
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Google OAuth code for tokens");
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const env = serverEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Google access token");
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
}> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google user profile");
  }

  return (await response.json()) as {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  };
}

const encoder = new TextEncoder();

function key() {
  return encoder.encode(serverEnv().APP_SESSION_SECRET);
}

interface SessionToken extends JWTPayload {
  user: AuthSession["user"];
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export async function setSessionCookie(payload: SessionToken): Promise<void> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function setOauthStateCookie(state: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10
  });
}

export async function readOauthStateCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(OAUTH_STATE_COOKIE)?.value;
}

export async function clearOauthStateCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function getSessionToken(): Promise<SessionToken | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, key());
    return payload as unknown as SessionToken;
  } catch {
    return null;
  }
}

export async function requireAccessToken(): Promise<string> {
  const token = await getSessionToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  const now = Date.now();
  if (token.expiresAt > now + 30_000) {
    return token.accessToken;
  }
  if (!token.refreshToken) {
    throw new Error("Session expired. Re-authentication required.");
  }
  const refreshed = await refreshAccessToken(token.refreshToken);
  await setSessionCookie({
    ...token,
    accessToken: refreshed.access_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000
  });
  return refreshed.access_token;
}

export async function getPublicSession(): Promise<AuthSession | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return {
    user: token.user,
    expiresAt: token.expiresAt
  };
}
