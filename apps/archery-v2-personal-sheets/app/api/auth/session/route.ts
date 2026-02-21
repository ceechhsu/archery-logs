import { NextResponse } from "next/server";
import { getPublicSession } from "@/lib/server/auth";

export async function GET() {
  const session = await getPublicSession();
  return NextResponse.json({ session });
}
