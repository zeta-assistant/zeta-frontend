// app/api/docgen/delete/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "project-docs";

function toStoragePath(urlOrPath: string): string {
  if (!urlOrPath) return "";
  if (urlOrPath.startsWith("http")) {
    const marker = "/object/public/project-docs/";
    const i = urlOrPath.indexOf(marker);
    return i >= 0 ? urlOrPath.slice(i + marker.length) : urlOrPath;
  }
  return urlOrPath;
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, fileUrl } = await req.json();
    if (!projectId || !fileUrl) {
      return NextResponse.json({ error: "Missing projectId or fileUrl" }, { status: 400 });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server env missing Supabase keys" }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const path = toStoragePath(fileUrl);

    // 1) delete from storage
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (storageErr) {
      return NextResponse.json({ error: storageErr.message }, { status: 400 });
    }

    // 2) best-effort DB delete (don’t fail if not found)
    const { error: dbErr } = await supabase
      .from("documents")
      .delete()
      .eq("project_id", projectId)
      .or(`file_url.eq.${fileUrl},file_url.eq.${path}`);

    return NextResponse.json({ ok: true, removed: path, dbWarning: dbErr?.message ?? null }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // ALWAYS json
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
