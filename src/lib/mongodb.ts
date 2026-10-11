import "server-only";

import { Db, MongoClient } from "mongodb";

declare global {
  var recallDbMongoClient: Promise<MongoClient> | undefined;
}

function createClient() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  return new MongoClient(uri, {
    maxPoolSize: 10,
  });
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!global.recallDbMongoClient) {
    global.recallDbMongoClient = createClient().connect();
  }

  return global.recallDbMongoClient;
}

export async function getDatabase(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB ?? "recalldb");
}
