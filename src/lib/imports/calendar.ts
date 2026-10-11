import "server-only";

import { createHash } from "node:crypto";

import ICAL from "ical.js";

export interface CalendarPreviewEvent {
  sourceIdentifier: string;
  title: string;
  description: string;
  start: string | null;
  end: string | null;
  location: string;
  attendees: string[];
  calendarUid: string;
  recurrenceRule: string;
  importFileName: string;
  duplicate?: boolean;
}

export class CalendarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarParseError";
  }
}

function safeIso(value: { toJSDate(): Date } | null) {
  if (!value) return null;
  const date = value.toJSDate();
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eventTime(getTime: () => ICAL.Time) {
  try {
    return safeIso(getTime());
  } catch {
    return null;
  }
}

function cleanText(value: unknown, maxLength = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function attendeeLabel(property: ICAL.Property) {
  const commonName = cleanText(property.getFirstParameter("cn"), 200);
  if (commonName) return commonName;

  const value = cleanText(property.getFirstValue(), 320);
  return value.replace(/^mailto:/i, "");
}

export function calendarEventToSourceText(event: CalendarPreviewEvent) {
  const lines = [
    "Calendar event",
    `Title: ${event.title}`,
    `Starts: ${event.start ?? "Not provided"}`,
    `Ends: ${event.end ?? "Not provided"}`,
    `Location: ${event.location || "Not provided"}`,
    `Attendees: ${event.attendees.length ? event.attendees.join(", ") : "Not provided"}`,
  ];

  if (event.recurrenceRule) {
    lines.push(`Recurrence: ${event.recurrenceRule}`);
  }

  lines.push("Description:", event.description || "Not provided");
  return lines.join("\n");
}

export function parseCalendarFile(text: string, importFileName: string) {
  try {
    const root = new ICAL.Component(ICAL.parse(text));
    const components = root.getAllSubcomponents("vevent");

    if (components.length === 0) {
      throw new CalendarParseError("No calendar events were found in this file.");
    }

    return components.map((component, index): CalendarPreviewEvent => {
      const event = new ICAL.Event(component);
      const componentText = component.toString();
      const fallbackHash = createHash("sha256")
        .update(componentText)
        .digest("hex")
        .slice(0, 24);
      const uid = cleanText(event.uid, 500) || `missing-uid-${fallbackHash}`;
      const start = eventTime(() => event.startDate);
      // Event.endDate also resolves RFC 5545 DURATION values when DTEND is absent.
      const end = eventTime(() => event.endDate);
      const recurrenceId = safeIso(
        component.getFirstPropertyValue("recurrence-id") as ICAL.Time | null,
      );
      const recurrenceValue = component.getFirstPropertyValue("rrule");
      const attendees = component
        .getAllProperties("attendee")
        .map(attendeeLabel)
        .filter(Boolean)
        .slice(0, 100);
      const identitySuffix = recurrenceId ?? start ?? fallbackHash;

      return {
        sourceIdentifier: `calendar:${uid}:${identitySuffix}`.slice(0, 1_000),
        title: cleanText(event.summary, 160) || `Untitled event ${index + 1}`,
        description: cleanText(event.description),
        start,
        end,
        location: cleanText(event.location, 500),
        attendees: [...new Set(attendees)],
        calendarUid: uid,
        recurrenceRule: recurrenceValue ? String(recurrenceValue) : "",
        importFileName: cleanText(importFileName, 255) || "calendar.ics",
      };
    });
  } catch (error) {
    if (error instanceof CalendarParseError) throw error;
    throw new CalendarParseError(
      error instanceof Error
        ? `Could not parse this calendar: ${error.message}`
        : "Could not parse this calendar file.",
    );
  }
}
