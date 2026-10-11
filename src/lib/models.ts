import type { ObjectId } from "mongodb";

export const SOURCE_TYPES = ["note", "conversation", "meeting", "other"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const MEMORY_KINDS = [
  "person",
  "idea",
  "decision",
  "task",
  "fact",
  "other",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface SourceDocument {
  _id?: ObjectId;
  title?: string;
  rawText: string;
  sourceType: SourceType;
  memoryCount: number;
  createdAt: Date;
}

export interface MemoryDocument {
  _id?: ObjectId;
  sourceId: ObjectId;
  kind: MemoryKind;
  title: string;
  content: string;
  sourceExcerpt: string;
  importance: number;
  tags: string[];
  people: string[];
  embedding?: number[];
  createdAt: Date;
}
