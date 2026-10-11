import { NextResponse } from "next/server";

import { DuplicateSourceError, ingestSource } from "@/lib/ingestion";
import {
  messageConversationIdentifier,
  messageConversationToSourceText,
  type ImportedMessage,
  type MessageConversationPreview,
} from "@/lib/imports/messages";

interface CommitRequest {
  conversation?: unknown;
}

function validateConversation(value: unknown): MessageConversationPreview | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MessageConversationPreview>;
  if (
    typeof candidate.conversationIdentifier !== "string" ||
    candidate.conversationIdentifier.trim().length === 0 ||
    candidate.conversationIdentifier.length > 500 ||
    !Array.isArray(candidate.messages) ||
    candidate.messages.length === 0 ||
    candidate.messages.length > 100 ||
    typeof candidate.importFileName !== "string" ||
    candidate.importFileName.length > 255 ||
    !Number.isInteger(candidate.partIndex) ||
    !Number.isInteger(candidate.partCount) ||
    (candidate.partIndex ?? 0) < 1 ||
    (candidate.partCount ?? 0) < (candidate.partIndex ?? 0)
  ) {
    return null;
  }

  const conversationIdentifier = candidate.conversationIdentifier.trim();
  const messages: ImportedMessage[] = [];
  for (const item of candidate.messages) {
    if (!item || typeof item !== "object") return null;
    const message = item as Partial<ImportedMessage>;
    const date = new Date(typeof message.timestamp === "string" ? message.timestamp : "");
    if (
      typeof message.text !== "string" ||
      message.text.trim().length === 0 ||
      message.text.length > 5_000 ||
      typeof message.sender !== "string" ||
      message.sender.trim().length === 0 ||
      message.sender.length > 320 ||
      Number.isNaN(date.getTime()) ||
      message.conversationIdentifier !== conversationIdentifier ||
      !Array.isArray(message.recipients) ||
      message.recipients.length > 20 ||
      message.recipients.some(
        (recipient) => typeof recipient !== "string" || recipient.length > 320,
      )
    ) {
      return null;
    }
    messages.push({
      text: message.text.trim(),
      sender: message.sender.trim(),
      timestamp: date.toISOString(),
      conversationIdentifier,
      recipients: message.recipients.map((recipient) => recipient.trim()).filter(Boolean),
    });
  }

  messages.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const sourceIdentifier = messageConversationIdentifier(
    conversationIdentifier,
    messages,
  );
  if (candidate.sourceIdentifier !== sourceIdentifier) return null;

  const participants = [
    ...new Set(
      messages.flatMap((message) => [message.sender, ...message.recipients]),
    ),
  ].slice(0, 100);
  const partIndex = candidate.partIndex as number;
  const partCount = candidate.partCount as number;
  return {
    sourceIdentifier,
    title: `Conversation ${conversationIdentifier}${partCount > 1 ? ` · part ${partIndex}` : ""}`.slice(
      0,
      160,
    ),
    conversationIdentifier,
    messages,
    participants,
    start: messages[0].timestamp,
    end: messages[messages.length - 1].timestamp,
    importFileName: candidate.importFileName,
    partIndex,
    partCount,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CommitRequest;
    const conversation = validateConversation(body.conversation);
    if (!conversation) {
      return NextResponse.json(
        { error: "This message conversation is invalid or incomplete." },
        { status: 400 },
      );
    }

    const result = await ingestSource({
      title: conversation.title,
      rawText: messageConversationToSourceText(conversation),
      sourceType: "conversation",
      sourceIdentifier: conversation.sourceIdentifier,
      occurredAt: new Date(conversation.start),
      endedAt: new Date(conversation.end),
      metadata: {
        importFileName: conversation.importFileName,
        importType: "messages",
        conversationIdentifier: conversation.conversationIdentifier,
        participants: conversation.participants,
        messageCount: conversation.messages.length,
      },
    });
    if (!result) {
      return NextResponse.json(
        { error: "No meaningful memories were found in this conversation." },
        { status: 422 },
      );
    }

    return NextResponse.json({ status: "imported", ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateSourceError) {
      return NextResponse.json({ status: "duplicate" });
    }
    console.error("Message import failed", error);
    return NextResponse.json(
      { error: "Could not process and save this conversation." },
      { status: 500 },
    );
  }
}
