import { NextResponse } from "next/server";

import {
  CalendarParseError,
  parseCalendarFile,
} from "@/lib/imports/calendar";
import type { SourceDocument } from "@/lib/models";
import { getDatabase } from "@/lib/mongodb";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 100;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose an .ics calendar file." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".ics")) {
      return NextResponse.json(
        { error: "Calendar imports must use an .ics file." },
        { status: 400 },
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Calendar files must be between 1 byte and 2 MB." },
        { status: 400 },
      );
    }

    const events = parseCalendarFile(await file.text(), file.name);
    if (events.length > MAX_EVENTS) {
      return NextResponse.json(
        { error: `This file contains ${events.length} events. Import up to ${MAX_EVENTS} at a time.` },
        { status: 400 },
      );
    }

    const database = await getDatabase();
    const existing = await database
      .collection<SourceDocument>("sources")
      .find(
        { sourceIdentifier: { $in: events.map((event) => event.sourceIdentifier) } },
        { projection: { sourceIdentifier: 1 } },
      )
      .toArray();
    const existingIdentifiers = new Set(
      existing.map((source) => source.sourceIdentifier).filter(Boolean),
    );
    const previewEvents = events.map((event) => ({
      ...event,
      duplicate: existingIdentifiers.has(event.sourceIdentifier),
    }));

    return NextResponse.json({
      fileName: file.name,
      events: previewEvents,
      summary: {
        total: previewEvents.length,
        new: previewEvents.filter((event) => !event.duplicate).length,
        duplicates: previewEvents.filter((event) => event.duplicate).length,
      },
    });
  } catch (error) {
    if (error instanceof CalendarParseError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Calendar preview failed", error);
    return NextResponse.json(
      { error: "Could not preview this calendar file." },
      { status: 500 },
    );
  }
}
