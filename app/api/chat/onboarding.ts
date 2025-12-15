// zeta-frontend/app/api/chat/onboarding.ts

import type OpenAI from "openai";
import { getCurrentStepPrompt, type OnboardingKey } from "@/lib/onboarding";

/* ─────────────────────────────────────────────
   Step helpers
───────────────────────────────────────────── */

export function stepFromStatus(status: number): OnboardingKey | null {
  switch (status) {
    case 0: return "vision";
    case 1: return "long_term_goals";
    case 2: return "short_term_goals";
    case 3: return "telegram";
    default: return null; // 4+ complete
  }
}

export function labelForStep(k: OnboardingKey) {
  switch (k) {
    case "vision": return "Project vision";
    case "long_term_goals": return "Long-term goals";
    case "short_term_goals": return "Short-term goals";
    case "telegram": return "Connect Telegram";
  }
}

function stepIndexFromKey(step: OnboardingKey): number {
  switch (step) {
    case "vision": return 1;
    case "long_term_goals": return 2;
    case "short_term_goals": return 3;
    case "telegram": return 4;
    default: return 0;
  }
}

/* ─────────────────────────────────────────────
   Text utilities
───────────────────────────────────────────── */

function normalizeVisionText(raw: string): string {
  let v = raw.trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/^the project aims to\s*/i, "")
    .replace(/^the goal is to\s*/i, "")
    .replace(/^my (project )?vision is to\s*/i, "")
    .replace(/^i (want|would like) to\s*/i, "")
    .replace(/^to\s+/i, "")
    .trim();

  if (!v) return "";
  v = v.charAt(0).toUpperCase() + v.slice(1);
  if (!/[.!?]$/.test(v)) v += ".";
  return v;
}

function stripLegacyGoalWarning(text: string) {
  return text
    .replace(/📌[\s\S]*?(?=\n—|$)/g, "")
    .replace(/It looks like I .*?save your project vision directly[\s\S]*?(?=\n—|$)/gi, "")
    .replace(/It seems there .*?updating your .*? goals[\s\S]*?(?=\n—|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ─────────────────────────────────────────────
   Early onboarding handler
───────────────────────────────────────────── */

export async function handleOnboardingEarly(args: {
  message: string;
  projectId: string;
  ownerUserId: string;
  threadId: string;
  nowISO: string;

  onboardingActive: boolean;
  nextStep: OnboardingKey | null;
  projectOnboardingStatus: number;

  supabaseAdmin: any;
}) {
  const {
    message,
    projectId,
    ownerUserId,
    threadId,
    nowISO,
    onboardingActive,
    nextStep,
    projectOnboardingStatus,
    supabaseAdmin,
  } = args;

  const isSkip = (s?: string) =>
    !!s && ["skip", "skip this", "skip for now", "idk", "i dont know", "i don't know"].includes(s.trim().toLowerCase());

  const isDone = (s?: string) =>
    !!s && /\b(done|finished|complete|all set|set up|configured)\b/i.test(s);

  const isStatusQuestion = (s?: string) =>
    !!s && /\bonboarding\b.*(step|status|progress)/i.test(s);

  /* ─── skip step ─── */
  if (onboardingActive && nextStep && (isSkip(message) || (nextStep === "telegram" && isDone(message)))) {
    const skippedIndex = stepIndexFromKey(nextStep);
    const newStatus = Math.max(projectOnboardingStatus, skippedIndex);
    const complete = newStatus >= 4;

    await supabaseAdmin
      .from("user_projects")
      .update({ onboarding_status: complete ? 4 : newStatus, onboarding_complete: complete })
      .eq("id", projectId);

    if (complete) {
      await supabaseAdmin
        .from("mainframe_info")
        .update({ onboarding_complete: true, updated_at: nowISO })
        .eq("project_id", projectId);
    }

    const reply = complete
      ? "All good — setup is complete. You can connect Telegram later from the APIs panel."
      : `No worries, we’ll skip **${labelForStep(nextStep)}**.\n\n${getCurrentStepPrompt(
          stepFromStatus(newStatus)!
        )}`;

    return {
      handled: true as const,
      payload: {
        reply,
        threadId,
        onboarding: !complete,
        step: complete ? "complete" : stepFromStatus(newStatus),
        onboarding_status: complete ? 4 : newStatus,
      },
    };
  }

  /* ─── status question ─── */
  if (isStatusQuestion(message)) {
    if (!nextStep) {
      return {
        handled: true as const,
        payload: {
          reply: "Setup is complete (4/4). ✅",
          threadId,
          onboarding: false,
          step: "complete",
          onboarding_status: projectOnboardingStatus,
        },
      };
    }

    return {
      handled: true as const,
      payload: {
        reply:
          `You’re currently on **${labelForStep(nextStep)}**.\n\n` +
          getCurrentStepPrompt(nextStep),
        threadId,
        onboarding: true,
        step: nextStep,
        onboarding_status: projectOnboardingStatus,
      },
    };
  }

  return { handled: false as const };
}

/* ─────────────────────────────────────────────
   Auto-capture + onboarding hint
───────────────────────────────────────────── */

export async function applyOnboardingCaptureAndHint(args: {
  message: string;
  projectId: string;

  onboardingActive: boolean;
  projectOnboardingStatus: number;

  textContent: string;

  openai: OpenAI;
  supabaseAdmin: any;

  effectiveNextStepBase: OnboardingKey | null;
}) {
  let {
    message,
    projectId,
    onboardingActive,
    projectOnboardingStatus,
    textContent,
    openai,
    supabaseAdmin,
    effectiveNextStepBase,
  } = args;

  let visionCaptured = false;
  let longCaptured = false;
  let shortCaptured = false;

 /* ─── VISION ─── */
if (projectOnboardingStatus === 0 && message?.trim()) {
  const trimmed = message.trim();

  // ⛔ Don't auto-complete vision on tiny / vague messages.
  const minLenForAutoVision = 40;
  const hasVisionKeywords =
    /\b(vision|goal|aim|plan|project|want to|would like to|my focus is|my aim is)\b/i.test(trimmed);

  if (trimmed.length >= minLenForAutoVision && hasVisionKeywords) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You are a strict JSON parser. Given the user message, decide if it clearly states the VISION for their project. ' +
              'Return JSON with exactly two keys: "has_vision" (boolean) and "vision" (string). ' +
              '"vision" must be a single clear sentence or short paragraph summarising what they want this project to achieve overall.',
          },
          { role: "user", content: `User message:\n"""${message}"""` },
        ],
      });

      const raw = completion.choices?.[0]?.message?.content || "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }

      if (parsed.has_vision && typeof parsed.vision === "string" && parsed.vision.trim()) {
        const normalized = normalizeVisionText(parsed.vision);
        if (normalized) {
          const isoNow = new Date().toISOString();
          const today = isoNow.slice(0, 10);

          // ✅ THIS is what GoalsPanel reads
          await supabaseAdmin
            .from("user_projects")
            .update({ vision: normalized, onboarding_status: 1 })
            .eq("id", projectId);

          // keep mainframe in sync too
          await supabaseAdmin
            .from("mainframe_info")
            .update({ vision: normalized, updated_at: isoNow, current_date: today })
            .eq("project_id", projectId);

          visionCaptured = true;
          textContent = "Nice — I’ve saved that as your project vision.";
        }
      }
    } catch {}
  }
}

 /* ─── LONG-TERM GOALS ─── */
if (projectOnboardingStatus === 1 && message?.trim()) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are a strict JSON parser. Decide if the user stated one or more LONG-TERM goals (months/years). ' +
            'Return JSON with keys: "has_long_term_goals" (boolean) and "goals" (array of strings).',
        },
        { role: "user", content: `User message:\n"""${message}"""` },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {}

    const goals: string[] = Array.isArray(parsed.goals)
      ? parsed.goals.map((g: any) => String(g || "").trim()).filter(Boolean)
      : [];

    if (parsed.has_long_term_goals && goals.length) {
      // Dedupe against existing goals
      const { data: existing } = await supabaseAdmin
        .from("goals")
        .select("description")
        .eq("project_id", projectId)
        .eq("goal_type", "long_term");

      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const existingSet = new Set((existing ?? []).map((r: any) => norm(r.description || "")));

      const toInsert = goals
        .map((g) => g.replace(/^[-•*]\s*/, "").trim())
        .filter((g) => g && !existingSet.has(norm(g)))
        .map((g) => ({ project_id: projectId, goal_type: "long_term", description: g }));

      if (toInsert.length) {
        await supabaseAdmin.from("goals").insert(toInsert);
      }

      // Keep legacy fields in sync (optional)
      await supabaseAdmin
        .from("user_projects")
        .update({ long_term_goals: goals, onboarding_status: 2 })
        .eq("id", projectId);

      await supabaseAdmin
        .from("mainframe_info")
        .update({ long_term_goals: goals, updated_at: new Date().toISOString() })
        .eq("project_id", projectId);

      longCaptured = true;
      textContent = "Great — I’ve saved those as your long-term goals.";
    }
  } catch (e: any) {
    console.error("⚠️ long-term capture failed:", e?.message ?? e);
  }
}


  /* ─── SHORT-TERM GOALS ─── */
if (projectOnboardingStatus === 2 && message?.trim()) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are a strict JSON parser. Decide if the user stated one or more SHORT-TERM goals (today/this week/next few weeks). ' +
            'Return JSON with keys: "has_short_term_goals" (boolean) and "goals" (array of strings).',
        },
        { role: "user", content: `User message:\n"""${message}"""` },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {}

    const goals: string[] = Array.isArray(parsed.goals)
      ? parsed.goals.map((g: any) => String(g || "").trim()).filter(Boolean)
      : [];

    if (parsed.has_short_term_goals && goals.length) {
      const { data: existing } = await supabaseAdmin
        .from("goals")
        .select("description")
        .eq("project_id", projectId)
        .eq("goal_type", "short_term");

      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const existingSet = new Set((existing ?? []).map((r: any) => norm(r.description || "")));

      const toInsert = goals
        .map((g) => g.replace(/^[-•*]\s*/, "").trim())
        .filter((g) => g && !existingSet.has(norm(g)))
        .map((g) => ({ project_id: projectId, goal_type: "short_term", description: g }));

      if (toInsert.length) {
        await supabaseAdmin.from("goals").insert(toInsert);
      }

      await supabaseAdmin
        .from("user_projects")
        .update({ short_term_goals: goals, onboarding_status: 3 })
        .eq("id", projectId);

      await supabaseAdmin
        .from("mainframe_info")
        .update({ short_term_goals: goals, updated_at: new Date().toISOString() })
        .eq("project_id", projectId);

      shortCaptured = true;
      textContent = "Awesome — I’ve saved those as your short-term goals.";
    }
  } catch (e: any) {
    console.error("⚠️ short-term capture failed:", e?.message ?? e);
  }
}


  /* ─── effective step ─── */
  let effectiveStatus = projectOnboardingStatus;
  if (visionCaptured) effectiveStatus = 1;
  if (longCaptured) effectiveStatus = 2;
  if (shortCaptured) effectiveStatus = 3;

  const effectiveNextStep = onboardingActive ? stepFromStatus(effectiveStatus) : null;

  if (onboardingActive && effectiveNextStep) {
    textContent +=
      `\n\n—\nNext up: **${labelForStep(effectiveNextStep)}**\n` +
      getCurrentStepPrompt(effectiveNextStep);
  }

  textContent = stripLegacyGoalWarning(textContent);

  return {
    textContent,
    effectiveStatusNum: effectiveStatus,
    effectiveNextStep,
    captured: { visionCaptured, longTermGoalsCaptured: longCaptured, shortTermGoalsCaptured: shortCaptured },
  };
}
