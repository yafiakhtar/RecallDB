import { pipeline } from "@huggingface/transformers";
import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "recalldb";

if (!uri) throw new Error("MONGODB_URI is not configured");

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

try {
  await client.connect();
  const memories = client.db(databaseName).collection("memories");
  const documents = await memories
    .find({ embedding: { $exists: false } })
    .project({ title: 1, content: 1, tags: 1, people: 1 })
    .toArray();

  if (documents.length === 0) {
    console.log(JSON.stringify({ updated: 0, dimensions: 384 }));
  } else {
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8" },
    );
    const inputs = documents.map((memory) =>
      [
        memory.title,
        memory.content,
        memory.tags?.length ? `Topics: ${memory.tags.join(", ")}` : "",
        memory.people?.length ? `People: ${memory.people.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const output = await extractor(inputs, {
      pooling: "mean",
      normalize: true,
    });
    const vectors = output.tolist();

    const result = await memories.bulkWrite(
      documents.map((memory, index) => ({
        updateOne: {
          filter: { _id: memory._id },
          update: { $set: { embedding: vectors[index] } },
        },
      })),
    );

    console.log(
      JSON.stringify({ updated: result.modifiedCount, dimensions: vectors[0].length }),
    );
  }
} finally {
  await client.close();
}
