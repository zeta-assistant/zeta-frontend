// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AVAILABLE_MODELS } from "@/lib/models";
import { shouldUseOnboarding, type OnboardingKey } from "@/lib/onboarding";
import { sum, product, evaluate as evalExpr } from "@/lib/mathEngine";

import { maybeAutonomousCalendarAdd } from "./calendarAutonomy";

// ✅ NEW: onboarding split
import {
  handleOnboardingEarly,
  applyOnboardingCaptureAndHint,
  stepFromStatus,
} from "./onboarding";
import {
  readBody,
  safeGetSharedContext,
  parseFilesIntent,
  fetchProjectFiles,
  handleRequiredActions,
  clampShort,
} from "./helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });

type AutonomyPolicy = "off" | "shadow" | "ask" | "auto";
type ProjectFileRow = { file_name: string; file_url: string; created_at: string };
type RecentUserInput = {
  timestamp?: string;
  created_at?: string;
  author?: string | null;
  content: string;
};

const uniq = (arr: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of arr) {
    const key = (s ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
};

export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const { message, projectId, modelId = "gpt-4o", verbosity = "normal" } = body;

    const now = new Date();
    const nowISO = now.toISOString();

    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      return NextResponse.json(
        { reply: "⚠️ Invalid model selected." },
        { status: 400 }
      );
    }

    // ───────────────── project & owner ─────────────────
    const { data: projRow, error: projErr } = await supabaseAdmin
      .from("user_projects")
      .select(
        "assistant_id, preferred_user_name, autonomy_policy, user_id, name, onboarding_status"
      )
      .eq("id", projectId)
      .single();

    if (projErr) {
      console.error("❌ /api/chat: failed to load project", projErr.message);
      return NextResponse.json(
        { reply: "⚠️ Could not load this project.", error: projErr.message },
        { status: 500 }
      );
    }

    if (!projRow?.user_id) {
      return NextResponse.json(
        {
          reply: "⚠️ This project is missing its owner (user_id).",
          error: "Missing user_id on project",
        },
        { status: 400 }
      );
    }

    const ownerUserId: string = projRow.user_id as string;
    const autonomyPolicy: AutonomyPolicy =
      (projRow?.autonomy_policy as AutonomyPolicy) ?? "auto";
    const projectOnboardingStatus: number =
      (projRow as any).onboarding_status ?? 0;

    // ───────────────── Ensure assistant_id ─────────────────
    let assistantId = projRow.assistant_id as string | null;

    if (!assistantId) {
      const fallback = await openai.beta.assistants.create({
        name: projRow.name
          ? `${projRow.name} (fallback)`
          : "Zeta Fallback",
        model: modelId === "gpt-4o" ? "gpt-4o" : "gpt-4",
        instructions:
          "You are Zeta, an AI assistant for this project. Respond clearly, helpfully, and concisely.",
        tools: [{ type: "file_search" }],
      });

      assistantId = fallback.id;

      const { error: upErr } = await supabaseAdmin
        .from("user_projects")
        .update({ assistant_id: assistantId })
        .eq("id", projectId);
      if (upErr) {
        return NextResponse.json(
          {
            reply: "⚠️ Failed to attach an assistant to this project.",
            error: upErr.message,
          },
          { status: 500 }
        );
      }
    }

    // ───────────────── thread management ─────────────────
    const { data: existingThread } = await supabaseAdmin
      .from("threads")
      .select("*")
      .eq("project_id", projectId)
      .order("last_active", { ascending: false })
      .limit(1)
      .maybeSingle();

    const expired =
      existingThread?.expired ||
      (existingThread?.last_active &&
        now.getTime() -
          new Date(existingThread.last_active).getTime() >
          1000 * 60 * 60);

    let threadId: string;

    if (!existingThread?.thread_id || expired) {
      const newThread = await openai.beta.threads.create();
      threadId = newThread.id;

      await supabaseAdmin.from("threads").insert({
        project_id: projectId,
        thread_id: threadId,
        created_at: nowISO,
        last_active: nowISO,
        expired: false,
      });

      await supabaseAdmin
        .from("user_projects")
        .update({ thread_id: threadId })
        .eq("id", projectId);
    } else {
      threadId = existingThread.thread_id;
      await supabaseAdmin
        .from("threads")
        .update({ last_active: nowISO })
        .eq("thread_id", threadId);
    }

    // ───────────────── onboarding flags ─────────────────
    const { data: mf } = await supabaseAdmin
      .from("mainframe_info")
      .select("onboarding_complete")
      .eq("project_id", projectId)
      .maybeSingle();

    const mfComplete = mf?.onboarding_complete === true;

    if (projectOnboardingStatus >= 4 && !mfComplete) {
      try {
        await supabaseAdmin
          .from("mainframe_info")
          .update({ onboarding_complete: true })
          .eq("project_id", projectId);
      } catch {
        // ignore
      }
    }

    const onboardingComplete = mfComplete || projectOnboardingStatus >= 4;
    const onboardingActive =
      !onboardingComplete && (await shouldUseOnboarding(projectId));
    const nextStep: OnboardingKey | null = onboardingActive
      ? stepFromStatus(projectOnboardingStatus)
      : null;

    // ───────────────── log user input ─────────────────
    try {
      await supabaseAdmin.from("user_input_log").insert({
        project_id: projectId,
        author: "user",
        content: message,
        timestamp: nowISO,
        meta: { source: "chat_tab" },
      });
    } catch {
      // non-fatal
    }

    // ───────────────── EARLY onboarding short-circuit ─────────────────
    const early = await handleOnboardingEarly({
      message,
      projectId,
      ownerUserId,
      threadId,
      nowISO,
      onboardingActive,
      nextStep,
      projectOnboardingStatus,
      supabaseAdmin,
    });

    if (early.handled) {
      return NextResponse.json(early.payload);
    }

    // ───────────────── AUTONOMOUS CALENDAR SCAN ─────────────────
    try {
      const cal = await maybeAutonomousCalendarAdd({
        supabaseAdmin,
        projectId,
        message,
        now,
      });

      if (cal.handled && cal.reply) {
        let replyText: string = cal.reply;

        // avoid exact duplicates in zeta_conversation_log
        try {
          const threeMinAgoISO = new Date(
            Date.now() - 3 * 60 * 1000
          ).toISOString();
          const { data: recent } = await supabaseAdmin
            .from("zeta_conversation_log")
            .select("id, message, timestamp")
            .eq("project_id", projectId)
            .eq("thread_id", threadId)
            .eq("role", "assistant")
            .gte("timestamp", threeMinAgoISO)
            .order("timestamp", { ascending: false })
            .limit(10);

          const dupe = (recent ?? []).find(
            (r: any) => (r.message ?? "") === replyText
          );
          if (!dupe) {
            await supabaseAdmin.from("zeta_conversation_log").insert({
              id: crypto.randomUUID(),
              user_id: ownerUserId,
              project_id: projectId,
              thread_id: threadId,
              role: "assistant",
              message: replyText,
              timestamp: new Date().toISOString(),
              content_type: "plain",
              metadata: { source: "calendar_autonomy" },
            });
          }
        } catch {
          // non-fatal
        }

        if (
          verbosity === "short" &&
          !/```|\\\[|\\\(|\$\$/.test(replyText)
        ) {
          replyText = clampShort(replyText);
        }

        return NextResponse.json({
          reply: replyText,
          threadId,
          appended: null,
          onboarding: onboardingActive,
          step: nextStep || "complete",
          onboarding_status: projectOnboardingStatus,
        });
      }
    } catch (e) {
      console.warn("calendar autonomy failed (non-fatal):", e);
    }

    // ───────────────── shared context + files ─────────────────
    const { mainframeInfo, recentUserInputs } =
      await safeGetSharedContext(projectId);

    const { wantsFiles, query } = parseFilesIntent(message);
    let filesContext: ProjectFileRow[] = [];
    if (wantsFiles) {
      const files = await fetchProjectFiles(projectId, {
        search: query,
        limit: 20,
      });
      filesContext = files.map((f) => ({
        file_name: f.file_name,
        file_url: f.file_url,
        created_at: f.created_at,
      }));
    }

    const inputsFormatted =
      !recentUserInputs ||
      (recentUserInputs as RecentUserInput[]).length === 0
        ? "None"
        : (recentUserInputs as RecentUserInput[])
            .map(
              (u) =>
                `- [${
                  u.created_at ?? u.timestamp ?? ""
                }] ${u.author ?? "user"}: ${u.content ?? ""}`
            )
            .join("\n");

    const filesFormatted =
      filesContext.length === 0
        ? wantsFiles
          ? "No matching files."
          : "Not requested."
        : filesContext
            .map(
              (f) =>
                `- ${f.file_name} — ${f.file_url} (${f.created_at})`
            )
            .join("\n");

    const verbosityInstruction =
      verbosity === "short"
        ? "For THIS reply, keep it to 1–2 sentences (<= ~60 words)."
        : verbosity === "long"
        ? "For THIS reply, be thorough: at least 5 sentences with helpful detail."
        : "No special length requirement for this reply.";

    const context = `[CONTEXT]
Now: ${nowISO}
You are Zeta — the AI assistant for this project.
Preferred user name: ${projRow?.preferred_user_name || "there"}

[VERBOSITY]
${verbosityInstruction}

[MAINFRAME]
${JSON.stringify(mainframeInfo ?? {}, null, 2)}

[RECENT_USER_INPUTS (last 5)]
${inputsFormatted}

[PROJECT_FILES] — included only when the user calls /files
${filesFormatted}
(If the user asks to search files, ask them to use "/files <keywords>" and then base your response on the provided list.)

[AUTONOMY]
If appropriate, call the function "propose_autonomy" ONCE with the minimal, high-confidence changes that would help now.
Cover only what is needed among: vision, long_term_goals, short_term_goals, tasks (create/update), calendar_items (create/update), files (generate).
Avoid duplicates (prefer updates). Keep it concise.
You may also remove goals by including { "delete": true } and an "id" (preferred) or an exact "description".

— End of context.`;

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: context,
    });
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message || " ",
    });

    let run = await openai.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: assistantId!,
    });
    if (run.status === "requires_action") {
      await handleRequiredActions({
        openai,
        threadId,
        runId: run.id,
        run,
        projectId,
        autonomyPolicy,
      });
      run = await openai.beta.threads.runs.poll(run.id, {
        thread_id: threadId,
      });
    }

    const list = await openai.beta.threads.messages.list(threadId, {
      order: "desc",
      limit: 50,
    });
    const extractText = (msg: any) => {
      const parts = msg?.content ?? [];
      const chunks: string[] = [];
      for (const p of parts)
        if (p?.type === "text" && p.text?.value) chunks.push(p.text.value);
      return chunks.join("\n\n").trim();
    };

    const produced = list.data.filter(
      (m: any) => m.role === "assistant" && m.run_id === run.id
    );
    const producedTexts = uniq(produced.map(extractText).filter(Boolean));
    let textContent = producedTexts.join("\n\n").trim();

    if (!textContent) {
      const anyAssistant = list.data.find(
        (m: any) => m.role === "assistant"
      );
      textContent = anyAssistant ? extractText(anyAssistant) : "⚠️ No reply.";
    }

    // ───────────────── AUTO-CAPTURE + HINT ─────────────────
    const capture = await applyOnboardingCaptureAndHint({
      message,
      projectId,
      onboardingActive,
      projectOnboardingStatus,
      textContent,
      openai,
      supabaseAdmin,
      effectiveNextStepBase: onboardingActive
        ? stepFromStatus(projectOnboardingStatus)
        : null,
    });

    textContent = capture.textContent;

    if (
      verbosity === "short" &&
      !/```|\\\[|\\\(|\$\$/.test(textContent)
    ) {
      textContent = clampShort(textContent);
    }

    // ───────────────── assistant insert ─────────────────
    let appended: any = null;
    if (textContent && textContent !== "⚠️ No reply.") {
      try {
        const threeMinAgoISO = new Date(
          Date.now() - 3 * 60 * 1000
        ).toISOString();
        const { data: recent } = await supabaseAdmin
          .from("zeta_conversation_log")
          .select("id, message, timestamp")
          .eq("project_id", projectId)
          .eq("thread_id", threadId)
          .eq("role", "assistant")
          .gte("timestamp", threeMinAgoISO)
          .order("timestamp", { ascending: false })
          .limit(10);

        const dupe = (recent ?? []).find(
          (r: any) => (r.message ?? "") === textContent
        );
        if (dupe) {
          appended = dupe;
        } else {
          const { data, error } = await supabaseAdmin
            .from("zeta_conversation_log")
            .insert({
              id: crypto.randomUUID(),
              user_id: ownerUserId,
              project_id: projectId,
              thread_id: threadId,
              role: "assistant",
              message: textContent,
              timestamp: new Date().toISOString(),
              content_type: "plain",
              metadata: {},
            })
            .select()
            .single();

          if (error) throw error;
          appended = data;
        }
      } catch {
        appended = {
          id: `temp-assistant-${Date.now()}`,
          user_id: ownerUserId,
          project_id: projectId,
          thread_id: threadId,
          role: "assistant",
          message: textContent,
          timestamp: new Date().toISOString(),
          content_type: "plain",
          metadata: { source: "append-fallback" },
        };
      }
    }

    return NextResponse.json({
      reply: textContent,
      threadId,
      appended,
      onboarding: onboardingActive,
      step: capture.effectiveNextStep || "complete",
      onboarding_status: capture.effectiveStatusNum,
    });
  } catch (err: any) {
    console.error("❌ /api/chat error:", err?.message ?? err);
    return NextResponse.json(
      { reply: "⚠️ Zeta had an internal error.", error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
