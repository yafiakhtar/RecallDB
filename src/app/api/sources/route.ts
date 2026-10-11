import { NextResponse } from "next/server";

import { ingestSource } from "@/lib/ingestion";
import { SOURCE_TYPES } from "@/lib/models";

interface IngestRequest {
  rawText?: unknown;
  title?: unknown;
  sourceType?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IngestRequest;
    const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const sourceType = SOURCE_TYPES.includes(
      body.sourceType as (typeof SOURCE_TYPES)[number],
    )
      ? (body.sourceType as (typeof SOURCE_TYPES)[number])
      : "note";

    if (rawText.length < 20) {
      return NextResponse.json(
        { error: "Paste at least 20 characters of source text." },
        { status: 400 },
      );
    }

    if (rawText.length > 50_000) {
      return NextResponse.json(
        { error: "Source text must be 50,000 characters or fewer." },
        { status: 400 },
      );
    }

    const result = await ingestSource({ rawText, title, sourceType });
    if (!result) {
      return NextResponse.json(
        { error: "No meaningful memories were found in that text." },
        { status: 422 },
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Source ingestion failed", error);
    return NextResponse.json(
      { error: "Could not extract and save memories." },
      { status: 500 },
    );
  }
}
