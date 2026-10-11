import { NextResponse } from "next/server";

import {
  MessageImportError,
  parseMessageFile,
} from "@/lib/imports/messages";
import type { SourceDocument } from "@/lib/models";
import { getDatabase } from "@/lib/mongodb";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SEGMENTS = 50;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a CSV or JSON message export." },
        { status: 400 },
      );
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".json")) {
      return NextResponse.json(
        { error: "Message imports must use a .csv or .json file." },
        { status: 400 },
      );
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Message files must be between 1 byte and 2 MB." },
        { status: 400 },
      );
    }

    const conversations = parseMessageFile(await file.text(), file.name);
    if (conversations.length > MAX_SEGMENTS) {
      return NextResponse.json(
        {
          error: `This file creates ${conversations.length} conversation segments. Import up to ${MAX_SEGMENTS} at a time.`,
        },
        { status: 400 },
      );
    }

    const database = await getDatabase();
    const existing = await database
      .collection<SourceDocument>("sources")
      .find(
        {
          sourceIdentifier: {
            $in: conversations.map((conversation) => conversation.sourceIdentifier),
          },
        },
        { projection: { sourceIdentifier: 1 } },
      )
      .toArray();
    const identifiers = new Set(
      existing.map((source) => source.sourceIdentifier).filter(Boolean),
    );
    const preview = conversations.map((conversation) => ({
      ...conversation,
      duplicate: identifiers.has(conversation.sourceIdentifier),
    }));

    return NextResponse.json({
      fileName: file.name,
      conversations: preview,
      summary: {
        conversations: new Set(
          preview.map((conversation) => conversation.conversationIdentifier),
        ).size,
        segments: preview.length,
        messages: preview.reduce(
          (total, conversation) => total + conversation.messages.length,
          0,
        ),
        duplicates: preview.filter((conversation) => conversation.duplicate).length,
      },
    });
  } catch (error) {
    if (error instanceof MessageImportError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Message preview failed", error);
    return NextResponse.json(
      { error: "Could not preview this message file." },
      { status: 500 },
    );
  }
}
