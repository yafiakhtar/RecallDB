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
  source: {
    id: string;
    title: string | null;
    sourceType: string;
    rawText: string;
    createdAt: string;
  } | null;
}

export async function semanticSearch(
  query: string,
  limit = 6,
): Promise<SemanticSearchResult[]> {
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

  return results.map((result) => ({
    id: result._id.toHexString(),
    kind: result.kind,
    title: result.title,
    content: result.content,
    sourceExcerpt: result.sourceExcerpt,
    importance: result.importance,
    tags: result.tags,
    people: result.people,
    score: result.score,
    source: result.source[0]
      ? {
          id: result.source[0]._id.toHexString(),
          title: result.source[0].title ?? null,
          sourceType: result.source[0].sourceType,
          rawText: result.source[0].rawText,
          createdAt: result.source[0].createdAt.toISOString(),
        }
      : null,
  }));
}
