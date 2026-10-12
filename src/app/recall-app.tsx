"use client";

import { FormEvent, useEffect, useState } from "react";

const DEMO_NOTE = `Product sync — October 11

Maya Chen proposed making RecallDB a personal AI memory engine for messy notes and conversations. We decided to use MongoDB Atlas as the source of truth and ship the hackathon demo before 7:30 PM today.

Jordan owns the vector search implementation and will finish it by 6:50 PM. Maya will record the 90-second demo video after search is working. The team agreed to skip authentication and external integrations for the demo.`;

type Memory = {
  id: string;
  kind: string;
  title: string;
  content: string;
  sourceExcerpt: string;
  importance: number;
  tags: string[];
  people: string[];
  sourceLabel?: string;
};

type Reference = {
  number: number;
  memoryId: string;
  memoryTitle: string;
  memoryContent: string;
  sourceExcerpt: string;
  sourceTitle: string | null;
  sourceType: string;
  occurredAt: string | null;
  score: number;
};

type SearchResult = {
  id: string;
  kind: string;
  title: string;
  content: string;
  sourceExcerpt: string;
  score: number;
  retrievalMethod: "vector" | "text";
  source: {
    title: string | null;
    sourceType: string;
    occurredAt: string | null;
  } | null;
};

type CalendarEvent = {
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
  duplicate: boolean;
};

type CalendarImportResult = {
  imported: number;
  skipped: number;
  failed: number;
};

type ImportedMessage = {
  text: string;
  sender: string;
  timestamp: string;
  conversationIdentifier: string;
  recipients: string[];
};

type MessageConversation = {
  sourceIdentifier: string;
  title: string;
  conversationIdentifier: string;
  messages: ImportedMessage[];
  participants: string[];
  start: string;
  end: string;
  importFileName: string;
  partIndex: number;
  partCount: number;
  duplicate: boolean;
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 fill-none stroke-current stroke-[1.5]"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function DatabaseMark() {
  return (
    <span className="grid size-8 place-items-center rounded-full border border-black bg-black text-[10px] font-bold tracking-tight text-white">
      R
    </span>
  );
}

function formatCalendarDate(value: string | null) {
  if (!value) return "Time not provided";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function RecallApp() {
  const [databaseOnline, setDatabaseOnline] = useState<boolean | null>(null);
  const [captureMode, setCaptureMode] = useState<
    "text" | "calendar" | "messages"
  >("text");
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("note");
  const [rawText, setRawText] = useState("");
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedCalendarEvents, setSelectedCalendarEvents] = useState<Set<string>>(
    new Set(),
  );
  const [calendarFileName, setCalendarFileName] = useState("");
  const [calendarPreviewLoading, setCalendarPreviewLoading] = useState(false);
  const [calendarImportLoading, setCalendarImportLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [calendarProgress, setCalendarProgress] = useState("");
  const [calendarResult, setCalendarResult] =
    useState<CalendarImportResult | null>(null);
  const [messageConversations, setMessageConversations] = useState<
    MessageConversation[]
  >([]);
  const [selectedMessageConversations, setSelectedMessageConversations] =
    useState<Set<string>>(new Set());
  const [messageFileName, setMessageFileName] = useState("");
  const [messagePreviewLoading, setMessagePreviewLoading] = useState(false);
  const [messageImportLoading, setMessageImportLoading] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [messageProgress, setMessageProgress] = useState("");
  const [messageResult, setMessageResult] =
    useState<CalendarImportResult | null>(null);
  const [question, setQuestion] = useState("");
  const [queryMode, setQueryMode] = useState<"answer" | "search">("answer");
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [answer, setAnswer] = useState("");
  const [references, setReferences] = useState<Reference[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => setDatabaseOnline(response.ok))
      .catch(() => setDatabaseOnline(false));
  }, []);

  async function handleCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCaptureLoading(true);
    setCaptureError("");

    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sourceType, rawText }),
      });
      const payload = (await response.json()) as {
        error?: string;
        memories?: Memory[];
      };

      if (!response.ok || !payload.memories) {
        throw new Error(payload.error ?? "Could not save this memory.");
      }

      setMemories((current) => [
        ...payload.memories!.map((memory) => ({
          ...memory,
          sourceLabel: `${sourceType} · ${title.trim() || "Untitled source"}`,
        })),
        ...current,
      ]);
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setCaptureLoading(false);
    }
  }

  async function handleCalendarFile(file: File | undefined) {
    setCalendarEvents([]);
    setSelectedCalendarEvents(new Set());
    setCalendarFileName(file?.name ?? "");
    setCalendarError("");
    setCalendarProgress("");
    setCalendarResult(null);
    if (!file) return;

    setCalendarPreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/imports/calendar/preview", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        events?: CalendarEvent[];
      };
      if (!response.ok || !payload.events) {
        throw new Error(payload.error ?? "Could not preview this calendar.");
      }

      setCalendarEvents(payload.events);
      setSelectedCalendarEvents(
        new Set(
          payload.events
            .filter((event) => !event.duplicate)
            .slice(0, 20)
            .map((event) => event.sourceIdentifier),
        ),
      );
    } catch (error) {
      setCalendarError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setCalendarPreviewLoading(false);
    }
  }

  function toggleCalendarEvent(sourceIdentifier: string) {
    setSelectedCalendarEvents((current) => {
      const next = new Set(current);
      if (next.has(sourceIdentifier)) {
        next.delete(sourceIdentifier);
      } else if (next.size < 20) {
        next.add(sourceIdentifier);
      }
      return next;
    });
  }

  async function handleCalendarImport() {
    const selected = calendarEvents.filter((event) =>
      selectedCalendarEvents.has(event.sourceIdentifier),
    );
    if (selected.length === 0) return;

    setCalendarImportLoading(true);
    setCalendarError("");
    setCalendarResult(null);
    const result: CalendarImportResult = { imported: 0, skipped: 0, failed: 0 };
    const importedMemories: Memory[] = [];

    for (const [index, event] of selected.entries()) {
      setCalendarProgress(`Processing ${index + 1} of ${selected.length}: ${event.title}`);
      try {
        const response = await fetch("/api/imports/calendar/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event }),
        });
        const payload = (await response.json()) as {
          error?: string;
          status?: "imported" | "duplicate";
          memories?: Memory[];
        };
        if (!response.ok) {
          throw new Error(payload.error ?? `Could not import ${event.title}.`);
        }
        if (payload.status === "duplicate") {
          result.skipped += 1;
        } else {
          result.imported += 1;
          importedMemories.push(
            ...(payload.memories ?? []).map((memory) => ({
              ...memory,
              sourceLabel: `Calendar · ${event.title}`,
            })),
          );
        }
      } catch {
        result.failed += 1;
      }
      setCalendarResult({ ...result });
    }

    setMemories((current) => [...importedMemories, ...current]);
    setCalendarProgress("");
    setCalendarImportLoading(false);
    if (result.failed > 0) {
      setCalendarError(
        `${result.failed} event${result.failed === 1 ? "" : "s"} could not be imported. The others were saved safely.`,
      );
    }
  }

  async function handleMessageFile(file: File | undefined) {
    setMessageConversations([]);
    setSelectedMessageConversations(new Set());
    setMessageFileName(file?.name ?? "");
    setMessageError("");
    setMessageProgress("");
    setMessageResult(null);
    if (!file) return;

    setMessagePreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/imports/messages/preview", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        conversations?: MessageConversation[];
      };
      if (!response.ok || !payload.conversations) {
        throw new Error(payload.error ?? "Could not preview these messages.");
      }
      setMessageConversations(payload.conversations);
      setSelectedMessageConversations(
        new Set(
          payload.conversations
            .filter((conversation) => !conversation.duplicate)
            .slice(0, 10)
            .map((conversation) => conversation.sourceIdentifier),
        ),
      );
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setMessagePreviewLoading(false);
    }
  }

  function toggleMessageConversation(sourceIdentifier: string) {
    setSelectedMessageConversations((current) => {
      const next = new Set(current);
      if (next.has(sourceIdentifier)) {
        next.delete(sourceIdentifier);
      } else if (next.size < 10) {
        next.add(sourceIdentifier);
      }
      return next;
    });
  }

  async function handleMessageImport() {
    const selected = messageConversations.filter((conversation) =>
      selectedMessageConversations.has(conversation.sourceIdentifier),
    );
    if (selected.length === 0) return;

    setMessageImportLoading(true);
    setMessageError("");
    setMessageResult(null);
    const result: CalendarImportResult = { imported: 0, skipped: 0, failed: 0 };
    const importedMemories: Memory[] = [];

    for (const [index, conversation] of selected.entries()) {
      setMessageProgress(
        `Processing ${index + 1} of ${selected.length}: ${conversation.title}`,
      );
      try {
        const response = await fetch("/api/imports/messages/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation }),
        });
        const payload = (await response.json()) as {
          error?: string;
          status?: "imported" | "duplicate";
          memories?: Memory[];
        };
        if (!response.ok) {
          throw new Error(
            payload.error ?? `Could not import ${conversation.title}.`,
          );
        }
        if (payload.status === "duplicate") {
          result.skipped += 1;
        } else {
          result.imported += 1;
          importedMemories.push(
            ...(payload.memories ?? []).map((memory) => ({
              ...memory,
              sourceLabel: `Messages · ${conversation.title}`,
            })),
          );
        }
      } catch {
        result.failed += 1;
      }
      setMessageResult({ ...result });
    }

    setMemories((current) => [...importedMemories, ...current]);
    setMessageProgress("");
    setMessageImportLoading(false);
    if (result.failed > 0) {
      setMessageError(
        `${result.failed} conversation segment${result.failed === 1 ? "" : "s"} could not be imported. The others were saved safely.`,
      );
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQueryLoading(true);
    setQueryError("");
    setAnswer("");
    setReferences([]);
    setSearchResults([]);

    try {
      const endpoint = queryMode === "answer" ? "/api/answer" : "/api/search";
      const requestBody =
        queryMode === "answer" ? { question } : { query: question, limit: 6 };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as {
        error?: string;
        answer?: string;
        references?: Reference[];
        results?: SearchResult[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not search your memories.");
      }

      if (queryMode === "answer") {
        setAnswer(payload.answer ?? "No answer returned.");
        setReferences(payload.references ?? []);
      } else {
        setSearchResults(payload.results ?? []);
      }
    } catch (error) {
      setQueryError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setQueryLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#111]">
      <header className="border-b border-black/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <DatabaseMark />
            <span className="text-[17px] font-semibold tracking-[-0.03em]">
              RecallDB
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-black/55">
            <span
              className={`size-2 rounded-full ${
                databaseOnline === false ? "bg-black/20" : "bg-black"
              } ${databaseOnline === null ? "animate-pulse" : ""}`}
            />
            {databaseOnline === null
              ? "Checking Atlas"
              : databaseOnline
                ? "Atlas connected"
                : "Atlas unavailable"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:py-14">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">
            Personal AI memory engine
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
            Turn messy context into memory you can ask.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-black/55">
            RecallDB extracts the signal, stores it in MongoDB Atlas, and
            retrieves the right memory with vector search.
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between border-b border-black/10 px-5 py-5 sm:px-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/40">
                  01 / Capture
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
                  Remember this
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCaptureMode("text");
                  setTitle("Product sync");
                  setSourceType("meeting");
                  setRawText(DEMO_NOTE);
                }}
                className="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:border-black hover:bg-black hover:text-white"
              >
                Use demo note
              </button>
            </div>

            <div className="border-b border-black/10 px-5 pt-5 sm:px-6">
              <div className="flex gap-1 rounded-lg bg-[#f0f0ed] p-1 text-xs">
                {([
                  ["text", "Paste Text"],
                  ["calendar", "Import Calendar"],
                  ["messages", "Import Messages"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setCaptureMode(mode);
                      setCaptureError("");
                      setCalendarError("");
                      setMessageError("");
                    }}
                    className={`flex-1 rounded-md px-3 py-2 font-medium transition ${
                      captureMode === mode
                        ? "bg-white text-black shadow-sm"
                        : "text-black/45 hover:text-black"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {captureMode === "text" ? (
              <form
                onSubmit={handleCapture}
                className="min-w-0 space-y-4 p-5 sm:p-6"
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-black/55">
                    Title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Optional source title"
                    className="h-11 w-full min-w-0 max-w-full rounded-lg border border-black/15 bg-white px-3.5 text-sm outline-none transition placeholder:text-black/30 focus:border-black"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-black/55">
                    Type
                  </span>
                  <select
                    value={sourceType}
                    onChange={(event) => setSourceType(event.target.value)}
                    className="h-11 w-full min-w-0 max-w-full rounded-lg border border-black/15 bg-white px-3 text-sm outline-none transition focus:border-black"
                  >
                    <option value="note">Note</option>
                    <option value="meeting">Meeting</option>
                    <option value="conversation">Conversation</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                </div>

                <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-black/55">
                  Raw text
                </span>
                <textarea
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Paste a note, conversation, or meeting transcript…"
                  rows={11}
                  className="w-full min-w-0 max-w-full resize-none rounded-xl border border-black/15 bg-[#fafaf8] p-4 text-[15px] leading-6 outline-none transition placeholder:text-black/30 focus:border-black focus:bg-white"
                />
                </label>

                <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-black/35">
                  {rawText.length.toLocaleString()} / 50,000
                </span>
                <button
                  type="submit"
                  disabled={captureLoading || rawText.trim().length < 20}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/20"
                >
                  {captureLoading ? <Spinner /> : <ArrowIcon />}
                  {captureLoading ? "Extracting memories" : "Extract & remember"}
                </button>
                </div>

                {captureError ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-black/15 bg-[#f5f5f2] px-3 py-2 text-sm"
                  >
                    {captureError}
                  </p>
                ) : null}
              </form>
            ) : captureMode === "calendar" ? (
              <div className="min-w-0 space-y-5 p-5 sm:p-6">
                <div>
                  <label className="block rounded-xl border border-dashed border-black/20 bg-[#fafaf8] p-5 text-center transition hover:border-black/40">
                    <span className="block text-sm font-semibold">
                      Choose an .ics calendar file
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-black/45">
                      Up to 2 MB and 100 events. Your file is previewed before AI processing.
                    </span>
                    <input
                      type="file"
                      accept=".ics,text/calendar"
                      disabled={calendarPreviewLoading || calendarImportLoading}
                      onChange={(event) =>
                        void handleCalendarFile(event.target.files?.[0])
                      }
                      className="mx-auto mt-4 block max-w-full text-xs file:mr-3 file:rounded-full file:border file:border-black/15 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium"
                    />
                  </label>
                  {calendarPreviewLoading ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-black/55">
                      <Spinner /> Reading {calendarFileName || "calendar"}…
                    </p>
                  ) : null}
                </div>

                {calendarEvents.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Review {calendarEvents.length} event
                          {calendarEvents.length === 1 ? "" : "s"}
                        </h3>
                        <p className="mt-1 text-xs text-black/45">
                          Nothing is sent to Luminal until you process selected events.
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-black/40">
                        {selectedCalendarEvents.size}/20 selected
                      </span>
                    </div>
                    <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                      {calendarEvents.map((event) => (
                        <label
                          key={event.sourceIdentifier}
                          className={`flex gap-3 rounded-lg border p-3.5 ${
                            event.duplicate
                              ? "border-black/5 bg-black/[0.025] text-black/40"
                              : "border-black/10 bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCalendarEvents.has(event.sourceIdentifier)}
                            disabled={event.duplicate || calendarImportLoading}
                            onChange={() => toggleCalendarEvent(event.sourceIdentifier)}
                            className="mt-1 size-4 accent-black"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-3">
                              <span className="truncate text-sm font-semibold">
                                {event.title}
                              </span>
                              <span className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider">
                                {event.duplicate ? "Already imported" : "Calendar"}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs text-black/50">
                              {formatCalendarDate(event.start)}
                            </span>
                            {event.location ? (
                              <span className="mt-1 block truncate text-xs text-black/40">
                                {event.location}
                              </span>
                            ) : null}
                            {event.description ? (
                              <span className="mt-2 line-clamp-2 block text-xs leading-5 text-black/50">
                                {event.description}
                              </span>
                            ) : null}
                            {event.attendees.length > 0 ? (
                              <span className="mt-2 block text-[11px] text-black/35">
                                {event.attendees.length} attendee
                                {event.attendees.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCalendarImport()}
                      disabled={
                        calendarImportLoading || selectedCalendarEvents.size === 0
                      }
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/20"
                    >
                      {calendarImportLoading ? <Spinner /> : <ArrowIcon />}
                      {calendarImportLoading
                        ? calendarProgress || "Processing calendar"
                        : `Process ${selectedCalendarEvents.size} selected with AI`}
                    </button>
                  </div>
                ) : null}

                {calendarResult ? (
                  <p className="rounded-lg border border-black/15 bg-[#f5f5f2] px-3 py-2 text-sm">
                    {calendarResult.imported} imported · {calendarResult.skipped} skipped ·{" "}
                    {calendarResult.failed} failed
                  </p>
                ) : null}
                {calendarError ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-black/15 bg-[#f5f5f2] px-3 py-2 text-sm"
                  >
                    {calendarError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0 space-y-5 p-5 sm:p-6">
                <div>
                  <label className="block rounded-xl border border-dashed border-black/20 bg-[#fafaf8] p-5 text-center transition hover:border-black/40">
                    <span className="block text-sm font-semibold">
                      Choose a CSV or JSON message export
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-black/45">
                      Required: text, sender, timestamp, conversationIdentifier. Recipients are optional.
                    </span>
                    <input
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      disabled={messagePreviewLoading || messageImportLoading}
                      onChange={(event) =>
                        void handleMessageFile(event.target.files?.[0])
                      }
                      className="mx-auto mt-4 block max-w-full text-xs file:mr-3 file:rounded-full file:border file:border-black/15 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium"
                    />
                  </label>
                  <p className="mt-2 text-[11px] leading-5 text-black/40">
                    User-provided exports only. RecallDB never accesses the macOS Messages database.
                  </p>
                  {messagePreviewLoading ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-black/55">
                      <Spinner /> Reading {messageFileName || "messages"}…
                    </p>
                  ) : null}
                </div>

                {messageConversations.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Review {messageConversations.length} conversation segment
                          {messageConversations.length === 1 ? "" : "s"}
                        </h3>
                        <p className="mt-1 text-xs text-black/45">
                          Messages stay chronological. Only selected segments are sent to Luminal.
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-black/40">
                        {selectedMessageConversations.size}/10 selected
                      </span>
                    </div>
                    <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                      {messageConversations.map((conversation) => (
                        <label
                          key={conversation.sourceIdentifier}
                          className={`flex gap-3 rounded-lg border p-3.5 ${
                            conversation.duplicate
                              ? "border-black/5 bg-black/[0.025] text-black/40"
                              : "border-black/10 bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedMessageConversations.has(
                              conversation.sourceIdentifier,
                            )}
                            disabled={conversation.duplicate || messageImportLoading}
                            onChange={() =>
                              toggleMessageConversation(conversation.sourceIdentifier)
                            }
                            className="mt-1 size-4 accent-black"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-3">
                              <span className="truncate text-sm font-semibold">
                                {conversation.title}
                              </span>
                              <span className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider">
                                {conversation.duplicate
                                  ? "Already imported"
                                  : "Messages"}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs text-black/50">
                              {conversation.messages.length} message
                              {conversation.messages.length === 1 ? "" : "s"} ·{" "}
                              {formatCalendarDate(conversation.start)}
                            </span>
                            <span className="mt-1 block truncate text-[11px] text-black/35">
                              {conversation.participants.join(", ") || "Unknown participants"}
                            </span>
                            <span className="mt-2 block space-y-1">
                              {conversation.messages.slice(0, 2).map((message, index) => (
                                <span
                                  key={`${message.timestamp}-${index}`}
                                  className="line-clamp-1 block text-xs leading-5 text-black/50"
                                >
                                  <strong className="font-medium text-black/65">
                                    {message.sender}:
                                  </strong>{" "}
                                  {message.text}
                                </span>
                              ))}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleMessageImport()}
                      disabled={
                        messageImportLoading ||
                        selectedMessageConversations.size === 0
                      }
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/20"
                    >
                      {messageImportLoading ? <Spinner /> : <ArrowIcon />}
                      {messageImportLoading
                        ? messageProgress || "Processing messages"
                        : `Process ${selectedMessageConversations.size} selected with AI`}
                    </button>
                  </div>
                ) : null}

                {messageResult ? (
                  <p className="rounded-lg border border-black/15 bg-[#f5f5f2] px-3 py-2 text-sm">
                    {messageResult.imported} imported · {messageResult.skipped} skipped ·{" "}
                    {messageResult.failed} failed
                  </p>
                ) : null}
                {messageError ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-black/15 bg-[#f5f5f2] px-3 py-2 text-sm"
                  >
                    {messageError}
                  </p>
                ) : null}
              </div>
            )}

            {memories.length > 0 ? (
              <div className="border-t border-black/10 bg-[#fafaf8] p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {memories.length} memories saved to Atlas
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-black/40">
                    This session · Embedded · Indexed
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {memories.map((memory) => (
                    <article
                      key={memory.id}
                      className="rounded-lg border border-black/10 bg-white p-3.5"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-black/40">
                          {memory.kind}
                        </span>
                        <span className="text-[10px] text-black/35">
                          {memory.importance}/5
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold leading-5">
                        {memory.title}
                      </h4>
                      {memory.sourceLabel ? (
                        <p className="mt-1 text-[10px] text-black/40">
                          {memory.sourceLabel}
                        </p>
                      ) : null}
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-black/50">
                        {memory.content}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="min-w-0 self-start overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)] lg:sticky lg:top-5">
            <div className="border-b border-black/10 px-5 py-5 sm:px-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/40">
                02 / Retrieve
              </p>
              <div className="mt-1 flex items-end justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-[-0.035em]">
                  Ask your memory
                </h2>
                <div className="flex rounded-full bg-[#f0f0ed] p-1 text-xs">
                  {(["answer", "search"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setQueryMode(mode)}
                      className={`rounded-full px-3 py-1.5 capitalize transition ${
                        queryMode === mode
                          ? "bg-white font-semibold shadow-sm"
                          : "text-black/45"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleQuery} className="min-w-0 p-5 sm:p-6">
              <label className="block">
                <span className="sr-only">Question or search query</span>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={
                    queryMode === "answer"
                      ? "Ask a question across everything you remember…"
                      : "Describe the memory you are looking for…"
                  }
                  rows={4}
                  className="w-full min-w-0 max-w-full resize-none rounded-xl border border-black/15 bg-[#fafaf8] p-4 text-[15px] leading-6 outline-none transition placeholder:text-black/30 focus:border-black focus:bg-white"
                />
              </label>
              <div className="mt-3 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() =>
                    setQuestion(
                      "Who owns the vector search implementation and when is it due?",
                    )
                  }
                  className="text-left text-xs text-black/40 underline decoration-black/20 underline-offset-4 hover:text-black"
                >
                  Try a demo question
                </button>
                <button
                  type="submit"
                  disabled={queryLoading || question.trim().length < 3}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/20"
                >
                  {queryLoading ? <Spinner /> : <ArrowIcon />}
                  {queryLoading
                    ? queryMode === "answer"
                      ? "Thinking"
                      : "Searching"
                    : queryMode === "answer"
                      ? "Ask RecallDB"
                      : "Semantic search"}
                </button>
              </div>
              {queryError ? (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-black/15 bg-[#f5f5f2] px-3 py-2 text-sm"
                >
                  {queryError}
                </p>
              ) : null}
            </form>

            {answer ? (
              <div className="border-t border-black/10 p-5 sm:p-6">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-black/40">
                  Grounded answer
                </p>
                <p className="text-lg leading-8 tracking-[-0.015em]">{answer}</p>
                <div className="mt-6 space-y-2">
                  {references.map((reference) => (
                    <details
                      key={reference.memoryId}
                      className="group rounded-lg border border-black/10 bg-[#fafaf8] open:bg-white"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-3.5">
                        <span className="text-sm font-medium">
                          [{reference.number}] {reference.memoryTitle}
                        </span>
                        <span className="font-mono text-[10px] text-black/40">
                          {(reference.score * 100).toFixed(0)}% match
                        </span>
                      </summary>
                      <div className="border-t border-black/10 px-3.5 py-3 text-xs leading-5 text-black/55">
                        <p>“{reference.sourceExcerpt}”</p>
                        <p className="mt-2 font-medium text-black/70">
                          Source: {reference.sourceTitle ?? "Untitled source"}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-black/40">
                          {reference.sourceType}
                          {reference.occurredAt
                            ? ` · ${formatCalendarDate(reference.occurredAt)}`
                            : ""}
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ) : null}

            {searchResults.length > 0 ? (
              <div className="border-t border-black/10 p-5 sm:p-6">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-black/40">
                  {searchResults[0]?.retrievalMethod === "text"
                    ? "MongoDB text fallback matches"
                    : "Vector matches"}
                </p>
                <div className="space-y-2">
                  {searchResults.map((result, index) => (
                    <article
                      key={result.id}
                      className="rounded-lg border border-black/10 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-black/40">
                            {String(index + 1).padStart(2, "0")} · {result.kind}
                          </span>
                          <h3 className="mt-1 text-sm font-semibold">
                            {result.title}
                          </h3>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-black/40">
                          {(result.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-black/55">
                        {result.content}
                      </p>
                      <p className="mt-2 text-[11px] text-black/35">
                        {result.source?.title ?? "Untitled source"} ·{" "}
                        {result.source?.sourceType ?? "unknown"}
                        {result.source?.occurredAt
                          ? ` · ${formatCalendarDate(result.source.occurredAt)}`
                          : ""}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {!answer && searchResults.length === 0 && !queryLoading ? (
              <div className="border-t border-black/10 px-5 py-10 text-center sm:px-6">
                <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full border border-black/10 bg-[#fafaf8] font-mono text-xs">
                  ⌘K
                </div>
                <p className="text-sm font-medium">Your memory is ready</p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-black/40">
                  RecallDB embeds your question, retrieves matches from Atlas,
                  and answers only from those sources.
                </p>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="mt-8 flex flex-col gap-2 border-t border-black/10 pt-5 text-[11px] text-black/35 sm:flex-row sm:items-center sm:justify-between">
          <p>RecallDB · Built for c0mpiled-15 at Penn State</p>
          <p>MongoDB Atlas · Vector Search · Luminal Cloud</p>
        </footer>
      </main>
    </div>
  );
}
