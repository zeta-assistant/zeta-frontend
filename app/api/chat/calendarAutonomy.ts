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

/** Format a local Y-M-D as YYYY-MM-DD without timezone shenanigans */
function formatYMD(year: number, monthIdx: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(monthIdx + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Very small helper that looks at the *raw user message* and,
 * if it looks like “add X to my calendar on DATE/tomorrow”
 * or “fix/move it to DATE”, inserts or updates a row in
 * `calendar_items` and returns a short reply.
 */
export async function maybeAutonomousCalendarAdd(
  args: CalendarAutonomyArgs
): Promise<CalendarAutonomyResult> {
  const { supabaseAdmin, projectId, message, now } = args;

  const lower = message.toLowerCase();

  // ───────────────── intent detection ─────────────────
  const addIntent =
    /\bcalendar\b/.test(lower) ||
    /\bschedule\b/.test(lower) ||
    /\bremind me\b/.test(lower) ||
    /\breminder\b/.test(lower) ||
    /\badd\b/.test(lower) ||
    /\bput\b/.test(lower);

  const modifyIntent =
    /\bfix\b/.test(lower) ||
    /\bmove\b/.test(lower) ||
    /\bchange\b/.test(lower) ||
    /\bupdate\b/.test(lower) ||
    /\breschedule\b/.test(lower);

  const wantsCalendar = addIntent || modifyIntent;

  if (!wantsCalendar) {
    return { handled: false };
  }

  // ───────────────── month mapping ─────────────────
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

  // ───────────────── generic date detection ─────────────────
  let targetDate: string | null = null;

  // 1) "tomorrow"/"tmr" + common misspellings
  if (
    lower.includes("tomorrow") ||
    lower.includes("tmr") ||
    lower.includes("tommorow") ||
    lower.includes("tommorrow")
  ) {
    const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    targetDate = formatYMD(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // 2) Explicit ISO style: 2025-12-16
  if (!targetDate) {
    const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const mIdx = parseInt(isoMatch[2], 10) - 1;
      const d = parseInt(isoMatch[3], 10);
      if (!isNaN(y) && !isNaN(mIdx) && !isNaN(d)) {
        targetDate = formatYMD(y, mIdx, d);
      }
    }
  }

  // 3) Month-first: "dec 16", "december 16th", optional year
  if (!targetDate) {
    const m1 = lower.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/
    );
    if (m1) {
      const monthStr = m1[1];
      const dayStr = m1[2];
      const yearStr = m1[3];
      const monthIdx = monthMap[monthStr] ?? null;
      const dayNum = parseInt(dayStr, 10);

      if (monthIdx !== null && dayNum >= 1 && dayNum <= 31) {
        let year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
        const candidate = new Date(year, monthIdx, dayNum);

        // If no explicit year and the date has already passed, bump to next year
        if (!yearStr && candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
          year = year + 1;
        }

        targetDate = formatYMD(year, monthIdx, dayNum);
      }
    }
  }

  // 4) Day-first: "16 dec", "16th december 2025"
  if (!targetDate) {
    const m2 = lower.match(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/
    );
    if (m2) {
      const dayStr = m2[1];
      const monthStr = m2[2];
      const yearStr = m2[3];
      const monthIdx = monthMap[monthStr] ?? null;
      const dayNum = parseInt(dayStr, 10);

      if (monthIdx !== null && dayNum >= 1 && dayNum <= 31) {
        let year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
        const candidate = new Date(year, monthIdx, dayNum);

        if (!yearStr && candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
          year = year + 1;
        }

        targetDate = formatYMD(year, monthIdx, dayNum);
      }
    }
  }

  // ───────────────── MODIFY mode: change most recent item’s date ─────────────────
  if (modifyIntent) {
    try {
      // Grab the most recent calendar item for this project
      const { data: recent, error } = await supabaseAdmin
        .from("calendar_items")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error || !recent || recent.length === 0) {
        return { handled: false };
      }

      const itemToUpdate = recent[0];

      let newDate = targetDate;

      // If no full date parsed yet (e.g. "on the 16th not the 15th"),
      // infer the day from the message but keep month/year from existing item.
      if (!newDate) {
        const baseDate: string | null = itemToUpdate.date;
        if (!baseDate || baseDate.length < 10) return { handled: false };

        const baseYear = parseInt(baseDate.slice(0, 4), 10);
        const baseMonthIdx = parseInt(baseDate.slice(5, 7), 10) - 1;

        let dayNum: number | null = null;

        // Prefer "on the 16th" style
        const onMatch = lower.match(/on the (\d{1,2})(?:st|nd|rd|th)?/);
        if (onMatch) {
          dayNum = parseInt(onMatch[1], 10);
        }

        // Fallback: any number in the message
        if (!dayNum) {
          const anyMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
          if (anyMatch) {
            dayNum = parseInt(anyMatch[1], 10);
          }
        }

        if (!dayNum || dayNum < 1 || dayNum > 31) {
          return { handled: false };
        }

        newDate = formatYMD(baseYear, baseMonthIdx, dayNum);
      }

      const { error: upErr } = await supabaseAdmin
        .from("calendar_items")
        .update({ date: newDate })
        .eq("id", itemToUpdate.id);

      if (upErr) {
        console.warn("maybeAutonomousCalendarAdd update failed:", upErr);
        return { handled: false };
      }

      const reply = `📅 I’ve updated “${itemToUpdate.title}” to ${newDate}.`;
      return { handled: true, reply };
    } catch (e) {
      console.warn("maybeAutonomousCalendarAdd modify failed:", e);
      return { handled: false };
    }
  }

  // If we're not in addIntent mode, we're done
  if (!addIntent) {
    return { handled: false };
  }

  // For ADD, if we still don't have a date, bail out
  if (!targetDate) {
    return { handled: false };
  }

  // ───────────────── title extraction ─────────────────
  let title = "Calendar item";

  const titleMatch = message.match(
    /(add|put|schedule|remind(?: me)? to|learn|study)\s+(.+?)(?:\s+on\b|\s+for\b|\s+tomorrow\b|\s+tommorow\b|\s+tommorrow\b|\s+tmr\b|$)/i
  );
  if (titleMatch && titleMatch[2]) {
    title = titleMatch[2].trim();
  } else {
    title = message.trim().slice(0, 80);
  }

  // Clean up obvious date tail like "to 16th december 2025 in calendar"
  // If the tail after the last " to " looks date-ish, drop it.
  if (title.toLowerCase().includes(" to ")) {
    const parts = title.split(" to ");
    const lastPart = parts[parts.length - 1].toLowerCase();
    const dateish = /(\d{1,2}(st|nd|rd|th)?|\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/;
    if (dateish.test(lastPart)) {
      title = parts.slice(0, -1).join(" to ").trim();
    }
  }

  // Strip trailing "in calendar"
  title = title.replace(/\s+in calendar\s*$/i, "").trim();

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

  const reply = `📅 I’ve added “${title}” to your calendar for ${targetDate}.`;
  return { handled: true, reply };
}
