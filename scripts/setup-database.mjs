import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "recalldb";

if (!uri) {
  throw new Error("MONGODB_URI is not configured");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    // Text indexes are supported by Atlas but excluded from Stable API strict mode.
    strict: false,
    deprecationErrors: true,
  },
});

const validators = {
  sources: {
    $jsonSchema: {
      bsonType: "object",
      required: ["rawText", "sourceType", "memoryCount", "createdAt"],
      properties: {
        title: { bsonType: "string" },
        rawText: { bsonType: "string", minLength: 1 },
        sourceType: {
          bsonType: "string",
          enum: ["note", "conversation", "meeting", "calendar", "other"],
        },
        sourceIdentifier: { bsonType: "string", minLength: 1 },
        occurredAt: { bsonType: "date" },
        endedAt: { bsonType: "date" },
        metadata: {
          bsonType: "object",
          properties: {
            location: { bsonType: "string" },
            attendees: { bsonType: "array", items: { bsonType: "string" } },
            importFileName: { bsonType: "string" },
            calendarUid: { bsonType: "string" },
            recurrenceRule: { bsonType: "string" },
            importType: { bsonType: "string", enum: ["calendar", "messages"] },
            conversationIdentifier: { bsonType: "string" },
            participants: {
              bsonType: "array",
              items: { bsonType: "string" },
            },
            messageCount: { bsonType: "int", minimum: 1 },
          },
        },
        memoryCount: { bsonType: "int", minimum: 0 },
        createdAt: { bsonType: "date" },
      },
    },
  },
  memories: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "sourceId",
        "kind",
        "title",
        "content",
        "sourceExcerpt",
        "importance",
        "tags",
        "people",
        "createdAt",
      ],
      properties: {
        sourceId: { bsonType: "objectId" },
        kind: {
          bsonType: "string",
          enum: ["person", "idea", "decision", "task", "fact", "other"],
        },
        title: { bsonType: "string", minLength: 1 },
        content: { bsonType: "string", minLength: 1 },
        sourceExcerpt: { bsonType: "string", minLength: 1 },
        importance: { bsonType: "int", minimum: 1, maximum: 5 },
        tags: { bsonType: "array", items: { bsonType: "string" } },
        people: { bsonType: "array", items: { bsonType: "string" } },
        embedding: { bsonType: "array", items: { bsonType: "double" } },
        createdAt: { bsonType: "date" },
      },
    },
  },
};

async function ensureCollection(database, name, validator) {
  const exists = await database
    .listCollections({ name }, { nameOnly: true })
    .hasNext();

  if (exists) {
    await database.command({
      collMod: name,
      validator,
      validationLevel: "strict",
      validationAction: "error",
    });
    return "updated";
  }

  await database.createCollection(name, {
    validator,
    validationLevel: "strict",
    validationAction: "error",
  });
  return "created";
}

try {
  await client.connect();
  const database = client.db(databaseName);

  const sourceStatus = await ensureCollection(
    database,
    "sources",
    validators.sources,
  );
  const memoryStatus = await ensureCollection(
    database,
    "memories",
    validators.memories,
  );

  const sourceIndexes = await database.collection("sources").createIndexes([
    { key: { createdAt: -1 }, name: "createdAt_desc" },
    {
      key: { sourceIdentifier: 1 },
      name: "unique_sourceIdentifier",
      unique: true,
      sparse: true,
    },
  ]);
  const memoryIndexes = await database.collection("memories").createIndexes([
    { key: { sourceId: 1, createdAt: -1 }, name: "source_createdAt" },
    { key: { kind: 1, createdAt: -1 }, name: "kind_createdAt" },
    { key: { tags: 1 }, name: "tags" },
    {
      key: {
        title: "text",
        content: "text",
        sourceExcerpt: "text",
        tags: "text",
        people: "text",
      },
      name: "memory_text_search",
      weights: { title: 8, content: 5, sourceExcerpt: 3, tags: 2, people: 2 },
    },
  ]);

  console.log(
    JSON.stringify({
      database: databaseName,
      collections: {
        sources: sourceStatus,
        memories: memoryStatus,
      },
      indexes: {
        sources: sourceIndexes,
        memories: memoryIndexes,
      },
    }),
  );
} finally {
  await client.close();
}
