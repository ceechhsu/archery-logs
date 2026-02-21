import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { lat?: number; lng?: number };
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Valid lat/lng required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY is not configured" }, { status: 400 });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, { cache: "no-store" });
    const json = (await response.json()) as {
      status?: string;
      results?: Array<{ formatted_address?: string }>;
      error_message?: string;
    };

    if (!response.ok || json.status !== "OK" || !json.results?.length) {
      return NextResponse.json(
        { error: json.error_message || "Failed to reverse geocode location" },
        { status: 400 }
      );
    }

    return NextResponse.json({ formattedAddress: json.results[0].formatted_address || "" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reverse geocode failed" },
      { status: 400 }
    );
  }
}
