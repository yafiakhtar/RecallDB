import "server-only";

import { createHash } from "node:crypto";

export interface ImportedMessage {
  text: string;
  sender: string;
  timestamp: string;
  conversationIdentifier: string;
  recipients: string[];
}

export interface MessageConversationPreview {
  sourceIdentifier: string;
  title: string;
  conversationIdentifier: string;
  messages: ImportedMessage[];
  participants: string[];
  start: string;
  end: string;
  importFileName: string;
  partIndex: number;
  partCount: number;
  duplicate?: boolean;
}

export class MessageImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageImportError";
  }
}

const MAX_MESSAGES = 2_000;
const MAX_MESSAGES_PER_SEGMENT = 100;
const MAX_SEGMENT_CHARACTERS = 24_000;

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new MessageImportError("The CSV contains an unclosed quoted field.");
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function recipientList(value: unknown) {
  const recipients = (Array.isArray(value) ? value : String(value ?? "").split(/[;|]/))
    .filter((recipient): recipient is string => typeof recipient === "string")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
  if (
    recipients.length > 20 ||
    recipients.some((recipient) => recipient.length > 320)
  ) {
    throw new MessageImportError(
      "A message may include up to 20 recipients of 320 characters each.",
    );
  }
  return recipients;
}

function timestamp(value: unknown, rowNumber: number) {
  const date =
    typeof value === "number"
      ? new Date(value)
      : typeof value === "string"
        ? new Date(value.trim())
        : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new MessageImportError(
      `Message ${rowNumber} has an invalid timestamp. Use an ISO 8601 date.`,
    );
  }
  return date.toISOString();
}

function normalizeMessage(value: unknown, rowNumber: number): ImportedMessage {
  if (!value || typeof value !== "object") {
    throw new MessageImportError(`Message ${rowNumber} is not an object.`);
  }
  const record = value as Record<string, unknown>;
  const rawText = record.text ?? record.message ?? record.body;
  const rawSender = record.sender ?? record.from;
  const rawConversationIdentifier =
    record.conversationIdentifier ??
      record.conversationId ??
      record.conversation_id ??
      record.threadId ??
      record.chatId;
  const text = typeof rawText === "string" ? rawText.trim() : "";
  const sender = typeof rawSender === "string" ? rawSender.trim() : "";
  const conversationIdentifier =
    typeof rawConversationIdentifier === "string"
      ? rawConversationIdentifier.trim()
      : "";

  if (
    !text ||
    !sender ||
    !conversationIdentifier ||
    text.length > 5_000 ||
    sender.length > 320 ||
    conversationIdentifier.length > 500
  ) {
    throw new MessageImportError(
      `Message ${rowNumber} must include text, sender, timestamp, and conversationIdentifier within the documented limits.`,
    );
  }

  return {
    text,
    sender,
    timestamp: timestamp(record.timestamp ?? record.date ?? record.time, rowNumber),
    conversationIdentifier,
    recipients: recipientList(record.recipients ?? record.recipient ?? record.to),
  };
}

function parseJson(input: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new MessageImportError("The JSON file is not valid JSON.");
  }

  const messages = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as { messages?: unknown }).messages
      : null;
  if (!Array.isArray(messages)) {
    throw new MessageImportError(
      'JSON must be an array of messages or an object with a "messages" array.',
    );
  }
  return messages.map((message, index) => normalizeMessage(message, index + 1));
}

function parseCsv(input: string) {
  const rows = parseCsvRows(input);
  if (rows.length < 2) {
    throw new MessageImportError("The CSV must include a header and at least one message.");
  }

  const headers = rows[0].map(normalizeHeader);
  const indexFor = (...names: string[]) =>
    headers.findIndex((header) => names.includes(header));
  const indexes = {
    text: indexFor("text", "message", "body"),
    sender: indexFor("sender", "from"),
    timestamp: indexFor("timestamp", "date", "time"),
    conversation: indexFor(
      "conversationidentifier",
      "conversationid",
      "threadid",
      "chatid",
    ),
    recipients: indexFor("recipients", "recipient", "to"),
  };
  if (
    indexes.text < 0 ||
    indexes.sender < 0 ||
    indexes.timestamp < 0 ||
    indexes.conversation < 0
  ) {
    throw new MessageImportError(
      "CSV headers must include text, sender, timestamp, and conversationIdentifier.",
    );
  }

  return rows.slice(1).map((row, index) =>
    normalizeMessage(
      {
        text: row[indexes.text],
        sender: row[indexes.sender],
        timestamp: row[indexes.timestamp],
        conversationIdentifier: row[indexes.conversation],
        recipients: indexes.recipients >= 0 ? row[indexes.recipients] : "",
      },
      index + 2,
    ),
  );
}

function messageLine(message: ImportedMessage) {
  const recipients = message.recipients.length
    ? ` -> ${message.recipients.join(", ")}`
    : "";
  return `[${message.timestamp}] ${message.sender}${recipients}: ${message.text}`;
}

export function messageConversationToSourceText(
  conversation: MessageConversationPreview,
) {
  return [
    "Message conversation",
    `Conversation identifier: ${conversation.conversationIdentifier}`,
    `Participants: ${conversation.participants.join(", ")}`,
    `Time range: ${conversation.start} to ${conversation.end}`,
    conversation.partCount > 1
      ? `Segment: ${conversation.partIndex} of ${conversation.partCount}`
      : "",
    "Transcript (chronological):",
    ...conversation.messages.map(messageLine),
  ]
    .filter(Boolean)
    .join("\n");
}

export function messageConversationIdentifier(
  conversationIdentifier: string,
  messages: ImportedMessage[],
) {
  const digest = createHash("sha256")
    .update(JSON.stringify({ conversationIdentifier, messages }))
    .digest("hex")
    .slice(0, 32);
  return `messages:${conversationIdentifier}:${digest}`.slice(0, 1_000);
}

export function parseMessageFile(
  input: string,
  fileName: string,
): MessageConversationPreview[] {
  const lowerName = fileName.toLowerCase();
  const messages = lowerName.endsWith(".json") ? parseJson(input) : parseCsv(input);
  if (messages.length === 0) {
    throw new MessageImportError("No messages were found in this file.");
  }
  if (messages.length > MAX_MESSAGES) {
    throw new MessageImportError(`Import up to ${MAX_MESSAGES} messages at a time.`);
  }

  const grouped = new Map<string, ImportedMessage[]>();
  for (const message of messages) {
    const group = grouped.get(message.conversationIdentifier) ?? [];
    group.push(message);
    grouped.set(message.conversationIdentifier, group);
  }

  const previews: MessageConversationPreview[] = [];
  for (const [conversationIdentifier, unsorted] of grouped) {
    const sorted = [...unsorted].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp),
    );
    const chunks: ImportedMessage[][] = [];
    let chunk: ImportedMessage[] = [];
    let characters = 0;
    for (const message of sorted) {
      const lineLength = messageLine(message).length + 1;
      if (
        chunk.length > 0 &&
        (chunk.length >= MAX_MESSAGES_PER_SEGMENT ||
          characters + lineLength > MAX_SEGMENT_CHARACTERS)
      ) {
        chunks.push(chunk);
        chunk = [];
        characters = 0;
      }
      chunk.push(message);
      characters += lineLength;
    }
    if (chunk.length) chunks.push(chunk);

    chunks.forEach((segmentMessages, index) => {
      const participants = [
        ...new Set(
          segmentMessages.flatMap((message) => [
            message.sender,
            ...message.recipients,
          ]),
        ),
      ].slice(0, 100);
      const partIndex = index + 1;
      const partCount = chunks.length;
      const titleBase = `Conversation ${conversationIdentifier}`;
      previews.push({
        sourceIdentifier: messageConversationIdentifier(
          conversationIdentifier,
          segmentMessages,
        ),
        title: `${titleBase}${partCount > 1 ? ` · part ${partIndex}` : ""}`.slice(
          0,
          160,
        ),
        conversationIdentifier,
        messages: segmentMessages,
        participants,
        start: segmentMessages[0].timestamp,
        end: segmentMessages[segmentMessages.length - 1].timestamp,
        importFileName: cleanString(fileName, 255) || "messages.json",
        partIndex,
        partCount,
      });
    });
  }

  return previews.sort((left, right) => left.start.localeCompare(right.start));
}
