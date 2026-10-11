# RecallDB

RecallDB is a personal AI memory engine built for **c0mpiled-15 at Penn State**. Paste a messy note, conversation, or meeting transcript; RecallDB extracts durable memories, stores them with their original source in MongoDB Atlas, and retrieves them later through natural-language Vector Search.

## Why MongoDB

MongoDB is the product's memory layer, not a replaceable persistence detail:

- Original source documents and extracted memories are stored in linked Atlas collections.
- MongoDB JSON Schema validation protects the document contract.
- Every memory carries a locally generated 384-dimensional embedding.
- Atlas Vector Search performs semantic retrieval through a named cosine-similarity index.
- Grounded answers cite the retrieved memory and its exact source excerpt.

```text
Messy text
   │
   ├─ Luminal Cloud ──> structured memories
   │                         │
   │                         ├─ local embeddings (384d)
   │                         │
   └────────────────────> MongoDB Atlas
                             ├─ sources
Natural-language query ─────>├─ memories
                             └─ Atlas Vector Search
                                      │
                                      └─ Luminal grounded answer + citations
```

## Features

- AI extraction of people, ideas, decisions, tasks, and facts
- Real MongoDB Atlas persistence with validated collections
- Local sentence-transformer embeddings with no additional API credential
- MongoDB Atlas Vector Search with relevance scores
- Retrieval-augmented answers grounded in saved memories
- Exact excerpts and original-source references
- Responsive black-and-white demo interface

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- MongoDB Atlas and the official Node.js driver
- MongoDB Atlas Vector Search
- Luminal Cloud (`deepseek-ai/DeepSeek-V4.1-Flash`)
- Hugging Face Transformers.js (`Xenova/all-MiniLM-L6-v2`)

## Local setup

Requirements: Node.js 20+, npm, a MongoDB Atlas cluster, Atlas CLI, and a Luminal Cloud API key.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`, then create the validated collections and standard indexes:

```bash
npm run db:setup
```

Create the Atlas Vector Search index using the checked-in definition:

```bash
atlas clusters search indexes create \
  --clusterName <your-cluster-name> \
  --projectId <your-project-id> \
  --file atlas/vector-index.json
```

Backfill embeddings if the database already contains memories:

```bash
npm run db:backfill-embeddings
```

Start RecallDB:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first embedding request downloads and caches the compact local model.

## API routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Verify the live Atlas connection |
| `POST /api/sources` | Extract, embed, and persist memories with their source |
| `POST /api/search` | Run semantic retrieval through Atlas Vector Search |
| `POST /api/answer` | Retrieve memories and generate a cited, grounded answer |

## Verification

```bash
npm run lint
npm run build
```

The demo data is synthetic. Secrets stay in `.env.local`, which is excluded from Git.
