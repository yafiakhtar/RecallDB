import "server-only";

import { MongoServerError } from "mongodb";

import { embedTexts, memoryEmbeddingText } from "@/lib/embeddings";
import { extractMemories } from "@/lib/luminal";
import type {
  MemoryDocument,
  SourceDocument,
  SourceMetadata,
  SourceType,
} from "@/lib/models";
import { getDatabase } from "@/lib/mongodb";

export interface IngestSourceInput {
  rawText: string;
  title?: string;
  sourceType: SourceType;
  sourceIdentifier?: string;
  occurredAt?: Date;
  endedAt?: Date;
  metadata?: SourceMetadata;
}

export class DuplicateSourceError extends Error {
  constructor() {
    super("This source has already been imported.");
    this.name = "DuplicateSourceError";
  }
}

function isDuplicateKeyError(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000;
}

export async function ingestSource(input: IngestSourceInput) {
  const database = await getDatabase();

  if (
    input.sourceIdentifier &&
    (await database
      .collection<SourceDocument>("sources")
      .findOne({ sourceIdentifier: input.sourceIdentifier }, { projection: { _id: 1 } }))
  ) {
    throw new DuplicateSourceError();
  }

  const extracted = await extractMemories(input.rawText);
  if (extracted.length === 0) {
    return null;
  }

  const embeddings = await embedTexts(extracted.map(memoryEmbeddingText));
  const createdAt = new Date();
  const source: SourceDocument = {
    ...(input.title ? { title: input.title.slice(0, 160) } : {}),
    rawText: input.rawText,
    sourceType: input.sourceType,
    ...(input.sourceIdentifier
      ? { sourceIdentifier: input.sourceIdentifier }
      : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.endedAt ? { endedAt: input.endedAt } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    memoryCount: extracted.length,
    createdAt,
  };

  let sourceId;
  try {
    sourceId = (
      await database.collection<SourceDocument>("sources").insertOne(source)
    ).insertedId;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new DuplicateSourceError();
    }
    throw error;
  }

  const memories: MemoryDocument[] = extracted.map((memory, index) => ({
    ...memory,
    sourceId,
    embedding: embeddings[index],
    createdAt,
  }));

  try {
    const memoryResult = await database
      .collection<MemoryDocument>("memories")
      .insertMany(memories);

    return {
      source: {
        id: sourceId.toHexString(),
        title: source.title ?? null,
        sourceType: source.sourceType,
        occurredAt: source.occurredAt?.toISOString() ?? null,
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
    };
  } catch (error) {
    await database
      .collection<SourceDocument>("sources")
      .deleteOne({ _id: sourceId });
    throw error;
  }
}
