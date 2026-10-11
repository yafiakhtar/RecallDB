import type { ObjectId } from "mongodb";

export const SOURCE_TYPES = [
  "note",
  "conversation",
  "meeting",
  "calendar",
  "other",
] as const;
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

export interface SourceMetadata {
  location?: string;
  attendees?: string[];
  importFileName?: string;
  calendarUid?: string;
  recurrenceRule?: string;
  importType?: "calendar" | "messages";
  conversationIdentifier?: string;
  participants?: string[];
  messageCount?: number;
}

export interface SourceDocument {
  _id?: ObjectId;
  title?: string;
  rawText: string;
  sourceType: SourceType;
  sourceIdentifier?: string;
  occurredAt?: Date;
  endedAt?: Date;
  metadata?: SourceMetadata;
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
