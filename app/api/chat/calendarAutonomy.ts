// app/api/chat/calendarAutonomy.ts

type CalendarAutonomyArgs = {
  supabaseAdmin: any;
  projectId: string;
  message: string;
  now: Date;
};

type CalendarAutonomyResult = {
  handled: boolean;
  reply?: string;
};

/**
 * Very small helper that looks at the *raw user message* and,
 * if it looks like “add X to my calendar on DATE/tomorrow”,
 * inserts a row into `calendar_items` and returns a short reply.
 */
export async function maybeAutonomousCalendarAdd(
  args: CalendarAutonomyArgs
): Promise<CalendarAutonomyResult> {
  const { supabaseAdmin, projectId, message, now } = args;

  const lower = message.toLowerCase();

  // Only trigger if user is clearly talking about calendar-ish behavior
  const wantsCalendar =
    lower.includes("calendar") ||
    lower.includes("schedule") ||
    lower.includes("remind me") ||
    lower.includes("reminder");

  if (!wantsCalendar) {
    return { handled: false };
  }

  // ───────────────── date detection ─────────────────
  let targetDate: string | null = null;

  // 1) "tomorrow" / "tmr"
  if (lower.includes("tomorrow") || lower.includes("tmr")) {
    const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    targetDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  // 2) Simple "dec 16", "dec 16th", "january 3" etc
  if (!targetDate) {
    const monthMap: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };

    const m = lower.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
    );
    if (m) {
      const monthStr = m[1];
      const dayStr = m[2];
      const monthIdx = monthMap[monthStr] ?? null;
      const dayNum = parseInt(dayStr, 10);

      if (monthIdx !== null && dayNum >= 1 && dayNum <= 31) {
        const year = now.getFullYear();
        const d = new Date(year, monthIdx, dayNum);
        targetDate = d.toISOString().slice(0, 10);
      }
    }
  }

  if (!targetDate) {
    // No clear date → do nothing, let normal chat flow handle it
    return { handled: false };
  }

  // ───────────────── title extraction ─────────────────
  // Try to grab something like “learn about derivatives” from the sentence
  let title = "Calendar item";

  const titleMatch = message.match(
    /(add|put|schedule|remind(?: me)? to|learn|study)\s+(.+?)(?:\s+on\b|\s+for\b|\s+tomorrow\b|\s+tmr\b|$)/i
  );
  if (titleMatch && titleMatch[2]) {
    title = titleMatch[2].trim();
  } else {
    // Fallback: truncate the whole message
    title = message.trim().slice(0, 80);
  }

  // ───────────────── insert into calendar_items ─────────────────
  const insertRow = {
    project_id: projectId,
    type: "task" as const,
    title,
    date: targetDate,
    details: message,
    time: null,
    length: null,
    reminder_offset_minutes: 0,
    reminder_channels: { telegram: true, email: false, inapp: true },
  };

  try {
    await supabaseAdmin.from("calendar_items").insert([insertRow]);
  } catch (e) {
    console.warn("maybeAutonomousCalendarAdd insert failed:", e);
    return { handled: false };
  }

  const readableDate = targetDate;
  const reply = `📅 I’ve added “${title}” to your calendar for ${readableDate}.`;

  return { handled: true, reply };
}
    