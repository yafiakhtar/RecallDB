import { NextResponse } from "next/server";

import { DuplicateSourceError, ingestSource } from "@/lib/ingestion";
import {
  calendarEventToSourceText,
  type CalendarPreviewEvent,
} from "@/lib/imports/calendar";

interface CommitRequest {
  event?: unknown;
}

function optionalDate(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function validateEvent(value: unknown): CalendarPreviewEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Partial<CalendarPreviewEvent>;
  const start = optionalDate(event.start);
  const end = optionalDate(event.end);

  if (
    typeof event.sourceIdentifier !== "string" ||
    !event.sourceIdentifier.startsWith("calendar:") ||
    event.sourceIdentifier.length > 1_000 ||
    typeof event.title !== "string" ||
    event.title.trim().length === 0 ||
    event.title.length > 160 ||
    typeof event.description !== "string" ||
    event.description.length > 10_000 ||
    typeof event.location !== "string" ||
    event.location.length > 500 ||
    !Array.isArray(event.attendees) ||
    event.attendees.length > 100 ||
    event.attendees.some(
      (attendee) => typeof attendee !== "string" || attendee.length > 320,
    ) ||
    typeof event.calendarUid !== "string" ||
    event.calendarUid.length === 0 ||
    event.calendarUid.length > 500 ||
    typeof event.recurrenceRule !== "string" ||
    event.recurrenceRule.length > 1_000 ||
    typeof event.importFileName !== "string" ||
    event.importFileName.length > 255 ||
    start === undefined ||
    end === undefined
  ) {
    return null;
  }

  return {
    sourceIdentifier: event.sourceIdentifier,
    title: event.title.trim(),
    description: event.description.trim(),
    start: start?.toISOString() ?? null,
    end: end?.toISOString() ?? null,
    location: event.location.trim(),
    attendees: event.attendees.map((attendee) => attendee.trim()).filter(Boolean),
    calendarUid: event.calendarUid,
    recurrenceRule: event.recurrenceRule,
    importFileName: event.importFileName,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CommitRequest;
    const event = validateEvent(body.event);
    if (!event) {
      return NextResponse.json(
        { error: "This calendar event is invalid or incomplete." },
        { status: 400 },
      );
    }

    const result = await ingestSource({
      title: event.title,
      rawText: calendarEventToSourceText(event),
      sourceType: "calendar",
      sourceIdentifier: event.sourceIdentifier,
      ...(event.start ? { occurredAt: new Date(event.start) } : {}),
      ...(event.end ? { endedAt: new Date(event.end) } : {}),
      metadata: {
        ...(event.location ? { location: event.location } : {}),
        ...(event.attendees.length ? { attendees: event.attendees } : {}),
        importFileName: event.importFileName,
        calendarUid: event.calendarUid,
        ...(event.recurrenceRule
          ? { recurrenceRule: event.recurrenceRule }
          : {}),
      },
    });

    if (!result) {
      return NextResponse.json(
        { error: "No meaningful memories were found in this event." },
        { status: 422 },
      );
    }

    return NextResponse.json({ status: "imported", ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateSourceError) {
      return NextResponse.json({ status: "duplicate" });
    }
    console.error("Calendar import failed", error);
    return NextResponse.json(
      { error: "Could not process and save this calendar event." },
      { status: 500 },
    );
  }
}
