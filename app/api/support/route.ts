// app/api/support/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Support form submission:", body);

    // TODO: email integration or save to DB
    return NextResponse.json({ success: true, message: "Support request received" });
  } catch (err) {
    console.error("Support error:", err);
    return NextResponse.json({ success: false, error: "Failed to process request" }, { status: 500 });
  }
}

// optional GET (for testing)
export async function GET() {
  return NextResponse.json({ ok: true });
}