import { NextResponse } from "next/server";

import { semanticSearch } from "@/lib/search";

interface SearchRequest {
  query?: unknown;
  limit?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchRequest;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const requestedLimit = Number(body.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(10, Math.round(requestedLimit)))
      : 6;

    if (query.length < 2 || query.length > 500) {
      return NextResponse.json(
        { error: "Search query must be between 2 and 500 characters." },
        { status: 400 },
      );
    }

    const results = await semanticSearch(query, limit);

    return NextResponse.json({
      query,
      results,
    });
  } catch (error) {
    console.error("Semantic search failed", error);
    return NextResponse.json(
      { error: "Could not search memories." },
      { status: 500 },
    );
  }
}
