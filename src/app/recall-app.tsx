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
};

type Reference = {
  number: number;
  memoryId: string;
  memoryTitle: string;
  memoryContent: string;
  sourceExcerpt: string;
  sourceTitle: string | null;
  score: number;
};

type SearchResult = {
  id: string;
  kind: string;
  title: string;
  content: string;
  sourceExcerpt: string;
  score: number;
  source: { title: string | null } | null;
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

export default function RecallApp() {
  const [databaseOnline, setDatabaseOnline] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("note");
  const [rawText, setRawText] = useState("");
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
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
    setMemories([]);

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

      setMemories(payload.memories);
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setCaptureLoading(false);
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
                  setTitle("Product sync");
                  setSourceType("meeting");
                  setRawText(DEMO_NOTE);
                }}
                className="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:border-black hover:bg-black hover:text-white"
              >
                Use demo note
              </button>
            </div>

            <form onSubmit={handleCapture} className="min-w-0 space-y-4 p-5 sm:p-6">
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

            {memories.length > 0 ? (
              <div className="border-t border-black/10 bg-[#fafaf8] p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {memories.length} memories saved to Atlas
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-black/40">
                    Embedded · Indexed
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
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ) : null}

            {searchResults.length > 0 ? (
              <div className="border-t border-black/10 p-5 sm:p-6">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-black/40">
                  Vector matches
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
                        {result.source?.title ?? "Untitled source"}
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
