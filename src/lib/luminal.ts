import "server-only";

import { MEMORY_KINDS, type MemoryKind } from "@/lib/models";

interface LuminalResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: string | { message?: string };
}

export interface ExtractedMemory {
  kind: MemoryKind;
  title: string;
  content: string;
  sourceExcerpt: string;
  importance: number;
  tags: string[];
  people: string[];
}

export interface GroundingContext {
  title: string;
  content: string;
  sourceExcerpt: string;
  sourceTitle: string | null;
  sourceType: string;
  occurredAt: string | null;
}

export interface GroundedAnswer {
  answer: string;
  citations: number[];
}

function requireEnvironment(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function parseJsonObject(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Luminal returned an invalid extraction response");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function cleanStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function validateExtraction(value: unknown): ExtractedMemory[] {
  if (!value || typeof value !== "object") {
    throw new Error("Luminal returned an invalid extraction response");
  }

  const memories = (value as { memories?: unknown }).memories;
  if (!Array.isArray(memories)) {
    throw new Error("Luminal response did not include memories");
  }

  return memories.slice(0, 10).map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Luminal returned a malformed memory");
    }

    const candidate = item as Record<string, unknown>;
    const kind = MEMORY_KINDS.includes(candidate.kind as MemoryKind)
      ? (candidate.kind as MemoryKind)
      : "other";
    const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
    const content =
      typeof candidate.content === "string" ? candidate.content.trim() : "";
    const sourceExcerpt =
      typeof candidate.sourceExcerpt === "string"
        ? candidate.sourceExcerpt.trim()
        : "";

    if (!title || !content || !sourceExcerpt) {
      throw new Error("Luminal returned an incomplete memory");
    }

    const numericImportance = Number(candidate.importance);
    const importance = Number.isFinite(numericImportance)
      ? Math.max(1, Math.min(5, Math.round(numericImportance)))
      : 3;

    return {
      kind,
      title: title.slice(0, 120),
      content: content.slice(0, 1000),
      sourceExcerpt: sourceExcerpt.slice(0, 500),
      importance,
      tags: cleanStringArray(candidate.tags, 8),
      people: cleanStringArray(candidate.people, 8),
    };
  });
}

export async function extractMemories(rawText: string) {
  const baseUrl = requireEnvironment("LUMINAL_BASE_URL").replace(/\/$/, "");
  const apiKey = requireEnvironment("LUMINAL_API_KEY");
  const model = requireEnvironment("LUMINAL_MODEL");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 5000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract durable, useful memories from messy text. Stay strictly grounded in the provided text. Return valid JSON only, with no markdown or commentary.",
        },
        {
          role: "user",
          content: `Extract the important people, ideas, decisions, tasks, and facts from the source below.

Return this exact shape:
{"memories":[{"kind":"person|idea|decision|task|fact|other","title":"short label","content":"self-contained grounded statement","sourceExcerpt":"short exact quote from the source","importance":1,"tags":["lowercase tag"],"people":["person name"]}]}

Rules:
- Return 1 to 10 memories; prefer fewer, meaningful items.
- importance is an integer from 1 (minor) to 5 (critical).
- sourceExcerpt must be copied verbatim from the source.
- Do not infer unsupported details or invent names.

SOURCE:
${rawText}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const payload = (await response.json()) as LuminalResponse;
  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ?? "Luminal request failed";
    throw new Error(`Luminal request failed (${response.status}): ${message}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Luminal returned no extraction content");
  }

  return validateExtraction(parseJsonObject(content));
}

export async function generateGroundedAnswer(
  question: string,
  contexts: GroundingContext[],
): Promise<GroundedAnswer> {
  const baseUrl = requireEnvironment("LUMINAL_BASE_URL").replace(/\/$/, "");
  const apiKey = requireEnvironment("LUMINAL_API_KEY");
  const model = requireEnvironment("LUMINAL_MODEL");
  const evidence = contexts
    .map(
      (context, index) => `[${index + 1}]
Memory: ${context.title}
Claim: ${context.content}
Original excerpt: "${context.sourceExcerpt}"
Source: ${context.sourceTitle ?? "Untitled source"}
Source type: ${context.sourceType}
Source timestamp: ${context.occurredAt ?? "Not provided"}`,
    )
    .join("\n\n");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 5000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Answer only from the supplied memory evidence. If the evidence is insufficient, say so plainly. Clearly label any inference as an inference, never present it as a fact. Cite every factual claim with bracketed evidence numbers like [1]. Return valid JSON only.",
        },
        {
          role: "user",
          content: `Question: ${question}

Evidence:
${evidence}

Return exactly: {"answer":"grounded answer with [1] citations","citations":[1]}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const payload = (await response.json()) as LuminalResponse;
  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ?? "Luminal request failed";
    throw new Error(`Luminal request failed (${response.status}): ${message}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Luminal returned no answer content");

  const parsed = parseJsonObject(content) as {
    answer?: unknown;
    citations?: unknown;
  };
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const citations = Array.isArray(parsed.citations)
    ? [
        ...new Set(
          parsed.citations
            .map(Number)
            .filter(
              (number) =>
                Number.isInteger(number) && number >= 1 && number <= contexts.length,
            ),
        ),
      ]
    : [];

  if (!answer) throw new Error("Luminal returned an empty answer");
  return { answer, citations };
}
