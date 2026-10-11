import "server-only";

import { ObjectId } from "mongodb";

import { embedTexts } from "@/lib/embeddings";
import { getDatabase } from "@/lib/mongodb";

interface SearchDocument {
  _id: ObjectId;
  kind: string;
  title: string;
  content: string;
  sourceExcerpt: string;
  importance: number;
  tags: string[];
  people: string[];
  score: number;
  source: Array<{
    _id: ObjectId;
    title?: string;
    rawText: string;
    sourceType: string;
    metadata?: { importType?: string };
    occurredAt?: Date;
    endedAt?: Date;
    createdAt: Date;
  }>;
}

export interface SemanticSearchResult {
  id: string;
  kind: string;
  title: string;
  content: string;
  sourceExcerpt: string;
  importance: number;
  tags: string[];
  people: string[];
  score: number;
  retrievalMethod: "vector" | "text";
  source: {
    id: string;
    title: string | null;
    sourceType: string;
    rawText: string;
    occurredAt: string | null;
    endedAt: string | null;
    createdAt: string;
  } | null;
}

function mapResults(
  results: SearchDocument[],
  retrievalMethod: "vector" | "text",
): SemanticSearchResult[] {
  return results.map((result) => ({
    id: result._id.toHexString(),
    kind: result.kind,
    title: result.title,
    content: result.content,
    sourceExcerpt: result.sourceExcerpt,
    importance: result.importance,
    tags: result.tags,
    people: result.people,
    score:
      retrievalMethod === "text"
        ? result.score / (result.score + 1)
        : result.score,
    retrievalMethod,
    source: result.source[0]
      ? {
          id: result.source[0]._id.toHexString(),
          title: result.source[0].title ?? null,
          sourceType:
            result.source[0].metadata?.importType ?? result.source[0].sourceType,
          rawText: result.source[0].rawText,
          occurredAt: result.source[0].occurredAt?.toISOString() ?? null,
          endedAt: result.source[0].endedAt?.toISOString() ?? null,
          createdAt: result.source[0].createdAt.toISOString(),
        }
      : null,
  }));
}

async function mongoTextSearch(query: string, limit: number) {
  const database = await getDatabase();
  const results = await database
    .collection("memories")
    .aggregate<SearchDocument>([
      { $match: { $text: { $search: query } } },
      { $addFields: { score: { $meta: "textScore" } } },
      { $sort: { score: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "sources",
          localField: "sourceId",
          foreignField: "_id",
          as: "source",
        },
      },
      { $project: { embedding: 0 } },
    ])
    .toArray();

  return mapResults(results, "text");
}

export async function semanticSearch(
  query: string,
  limit = 6,
): Promise<SemanticSearchResult[]> {
  try {
    const [queryVector] = await embedTexts([query]);
    const database = await getDatabase();
    const results = await database
      .collection("memories")
      .aggregate<SearchDocument>([
        {
          $vectorSearch: {
            index: "memory_vector_index",
            path: "embedding",
            queryVector,
            numCandidates: Math.max(limit * 15, 100),
            limit,
          },
        },
        {
          $lookup: {
            from: "sources",
            localField: "sourceId",
            foreignField: "_id",
            as: "source",
          },
        },
        {
          $project: {
            embedding: 0,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray();
    return mapResults(results, "vector");
  } catch (error) {
    console.warn("Vector retrieval unavailable; using MongoDB text search", error);
    return mongoTextSearch(query, limit);
  }
}
