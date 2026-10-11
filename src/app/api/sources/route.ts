import { NextResponse } from "next/server";

import { embedTexts, memoryEmbeddingText } from "@/lib/embeddings";
import { extractMemories } from "@/lib/luminal";
import { SOURCE_TYPES, type MemoryDocument, type SourceDocument } from "@/lib/models";
import { getDatabase } from "@/lib/mongodb";

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

    const extracted = await extractMemories(rawText);
    if (extracted.length === 0) {
      return NextResponse.json(
        { error: "No meaningful memories were found in that text." },
        { status: 422 },
      );
    }

    const embeddings = await embedTexts(extracted.map(memoryEmbeddingText));

    const database = await getDatabase();
    const createdAt = new Date();
    const source: SourceDocument = {
      ...(title ? { title: title.slice(0, 160) } : {}),
      rawText,
      sourceType,
      memoryCount: extracted.length,
      createdAt,
    };
    const sourceResult = await database
      .collection<SourceDocument>("sources")
      .insertOne(source);

    const memories: MemoryDocument[] = extracted.map((memory, index) => ({
      ...memory,
      sourceId: sourceResult.insertedId,
      embedding: embeddings[index],
      createdAt,
    }));

    try {
      const memoryResult = await database
        .collection<MemoryDocument>("memories")
        .insertMany(memories);

      return NextResponse.json(
        {
          source: {
            id: sourceResult.insertedId.toHexString(),
            title: source.title ?? null,
            sourceType,
            createdAt: createdAt.toISOString(),
          },
          memories: memories.map((memory, index) => ({
            id: memoryResult.insertedIds[index].toHexString(),
            kind: memory.kind,
            title: memory.title,
            content: memory.content,
            sourceExcerpt: memory.sourceExcerpt,
            importance: memory.importance,
            tags: memory.tags,
            people: memory.people,
          })),
        },
        { status: 201 },
      );
    } catch (error) {
      await database
        .collection<SourceDocument>("sources")
        .deleteOne({ _id: sourceResult.insertedId });
      throw error;
    }
  } catch (error) {
    console.error("Source ingestion failed", error);
    return NextResponse.json(
      { error: "Could not extract and save memories." },
      { status: 500 },
    );
  }
}
