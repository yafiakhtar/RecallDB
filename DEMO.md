# 90-second demo

## 0:00–0:12 — The problem

“Notes and meeting transcripts contain important decisions and tasks, but finding them later is painful. RecallDB turns messy context into memory you can ask.”

Point out the live **Atlas connected** indicator.

## 0:12–0:38 — Capture

1. Click **Use demo note**.
2. Click **Extract & remember**.
3. While it runs: “Luminal extracts structured people, ideas, decisions, and tasks. RecallDB generates embeddings locally, then stores the original source and every linked memory in MongoDB Atlas.”
4. Show the returned memory cards and **Embedded · Indexed** label.

## 0:38–1:03 — MongoDB Vector Search

1. Select **Search**.
2. Click **Try a demo question**.
3. Change the query to: `Who is responsible for semantic vector search?`
4. Click **Semantic search**.
5. Show Jordan ranked first and point out the similarity percentage.

Say: “This is a real `$vectorSearch` aggregation against the 384-dimensional vectors stored on each MongoDB memory document.”

## 1:03–1:25 — Grounded answer

1. Select **Answer**.
2. Use: `Who owns vector search and when is it due?`
3. Click **Ask RecallDB**.
4. Expand citation `[1]`.

Say: “RecallDB retrieves through Atlas first, then Luminal answers only from that evidence. Every claim links back to the exact stored excerpt and original source.”

## 1:25–1:30 — Close

“MongoDB is the memory, retrieval, and grounding layer behind the entire product. This is RecallDB.”
