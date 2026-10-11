import "server-only";

import { pipeline } from "@huggingface/transformers";

const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: ReturnType<typeof createExtractor> | undefined;

function createExtractor() {
  return pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  extractorPromise ??= createExtractor();
  const extractor = await extractorPromise;
  const output = await extractor(texts, {
    pooling: "mean",
    normalize: true,
  });

  return output.tolist() as number[][];
}

export function memoryEmbeddingText(memory: {
  title: string;
  content: string;
  tags: string[];
  people: string[];
}) {
  const details = [
    memory.title,
    memory.content,
    memory.tags.length ? `Topics: ${memory.tags.join(", ")}` : "",
    memory.people.length ? `People: ${memory.people.join(", ")}` : "",
  ].filter(Boolean);

  return details.join("\n");
}
