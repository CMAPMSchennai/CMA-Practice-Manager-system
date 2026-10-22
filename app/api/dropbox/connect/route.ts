import { NextResponse } from "next/server";

/**
 * Not in use. The permanent Dropbox connection was dropped because the platform does not allow
 * app code to renew Dropbox tokens itself. This empty route can be deleted with the other
 * test-only Dropbox tools before go-live.
 */
export async function POST() {
  return NextResponse.json({ error: "Not available." }, { status: 404 });
}
