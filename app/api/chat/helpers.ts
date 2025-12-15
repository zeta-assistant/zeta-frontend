// zeta-frontend/app/api/chat/helpers.ts

import type OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSharedContext } from "@/lib/onboarding";
import { sum, product, evaluate as evalExpr } from "@/lib/mathEngine";

export type AutonomyPolicy = "off" | "shadow" | "ask" | "auto";
export type ProjectFileRow = { file_name: string; file_url: string; created_at: string };
export type RecentUserInput = {
  timestamp?: string;
  created_at?: string;
  author?: string | null;
  content: string;
};

export async function readBody(req: Request): Promise<{
  message: string;
  projectId: string;
  modelId?: string;
  verbosity?: "short" | "normal" | "long";
}> {
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      return await req.json();
    }
  } catch {}

  const text = await req.text();
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    return {
      message: params.get("message") || "",
      projectId: params.get("projectId") || "",
      modelId: params.get("modelId") || "gpt-4o",
      verbosity: (params.get("verbosity") as any) || "normal",
    };
  }
}

export async function safeGetSharedContext(
  projectId: string
): Promise<{ mainframeInfo: any; recentUserInputs: RecentUserInput[] }> {
  try {
    const ctx = await getSharedContext(projectId);
    return {
      mainframeInfo: ctx?.mainframeInfo ?? {},
      recentUserInputs: Array.isArray(ctx?.recentUserInputs) ? ctx.recentUserInputs : [],
    };
  } catch (e: any) {
    console.error("⚠️ getSharedContext failed; fallback:", e?.message ?? e);

    const { data: uil } = await supabaseAdmin
      .from("user_input_log")
      .select("content, timestamp, author")
      .eq("project_id", projectId)
      .order("timestamp", { ascending: false })
      .limit(5);

    const recentUserInputs =
      (uil ?? []).map((r: any) => ({
        content: r.content,
        timestamp: r.timestamp,
        author: r.author ?? "user",
      })) as RecentUserInput[];

    return { mainframeInfo: {}, recentUserInputs };
  }
}

export function parseFilesIntent(message?: string) {
  if (!message) return { wantsFiles: false, query: "" };
  const m = message.match(/^\/files(?:\s+(.*))?$/i);
  return m ? { wantsFiles: true, query: (m[1] || "").trim() } : { wantsFiles: false, query: "" };
}

export async function fetchProjectFiles(
  projectId: string,
  opts?: { search?: string; limit?: number }
): Promise<ProjectFileRow[]> {
  const { search = "", limit = 20 } = opts || {};
  let q = supabaseAdmin
    .from("documents")
    .select("file_name, file_url, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) q = q.ilike("file_name", `%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProjectFileRow[];
}

export async function handleRequiredActions(args: {
  openai: OpenAI;
  threadId: string;
  runId: string;
  run: any;
  projectId: string;
  autonomyPolicy: AutonomyPolicy;
}) {
  const { openai, threadId, runId, run, projectId, autonomyPolicy } = args;

  const tcalls = run?.required_action?.submit_tool_outputs?.tool_calls ?? [];
  if (!tcalls.length) return;

  const tool_outputs: Array<{ tool_call_id: string; output: string }> = [];

  for (const tc of tcalls) {
    if (tc.type !== "function") continue;
    const name = tc.function?.name ?? "";

    try {
      const parsedArgs = JSON.parse(tc.function?.arguments || "{}");

      if (name === "compute_math") {
        const mode = String(parsedArgs.mode || "").toLowerCase();
        let out: any;

        if (mode === "sum") out = { result: Number(sum(parsedArgs.numbers || []).toString()) };
        else if (mode === "product") out = { result: Number(product(parsedArgs.numbers || []).toString()) };
        else if (mode === "expression") out = { result: evalExpr(String(parsedArgs.expression || "0")) };
        else out = { error: `Unsupported mode: ${mode}` };

        tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify(out) });
      } else if (name === "propose_autonomy") {
        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!baseUrl || !srk) {
          tool_outputs.push({
            tool_call_id: tc.id,
            output: JSON.stringify({ ok: false, error: "Missing Supabase URL or Service Role Key in env." }),
          });
        } else {
          const res = await fetch(`${baseUrl}/functions/v1/apply-autonomy`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: srk, Authorization: `Bearer ${srk}` },
            body: JSON.stringify({ projectId, policy: autonomyPolicy, plan: parsedArgs }),
          });

          let out: any;
          try {
            out = await res.json();
          } catch {
            out = { ok: res.ok };
          }

          tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify(out) });
        }
      } else {
        tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify({ error: `Unhandled tool: ${name}` }) });
      }
    } catch (e: any) {
      tool_outputs.push({ tool_call_id: tc.id, output: JSON.stringify({ error: e?.message || String(e) }) });
    }
  }

  await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs });
}

export function clampShort(text: string) {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstTwo = parts.slice(0, 2).join(" ");
  const words = firstTwo.split(/\s+/);
  return words.length <= 60 ? firstTwo : words.slice(0, 60).join(" ") + "…";
}
