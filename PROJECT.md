# RecallDB Project Reference

This document describes the current, verified RecallDB codebase and separates implemented behavior from planned work. It is intended to be the durable project reference for product, engineering, and future contributors.

## Product

RecallDB is a personal AI memory engine. It turns source material into structured memories, stores both the source and derived memories, retrieves memories by meaning, and produces answers grounded in the original material.

The core product loop is:

1. A user provides source text.
2. Luminal DeepSeek extracts people, ideas, decisions, tasks, facts, and other durable memories.
3. RecallDB creates a local 384-dimensional embedding for each memory.
4. The source and memories are stored as linked MongoDB Atlas documents.
5. A natural-language query is embedded locally and sent to MongoDB Atlas Vector Search.
6. Retrieved memories and source excerpts are sent to Luminal DeepSeek for a cited answer.

## Current status

### Implemented

- Manual text, note, conversation, and meeting-transcript ingestion.
- Structured memory extraction with Luminal Cloud using `deepseek-ai/DeepSeek-V4.1-Flash`.
- Local embeddings using Transformers.js and `Xenova/all-MiniLM-L6-v2`.
- MongoDB Atlas persistence for original sources and extracted memories.
- MongoDB Atlas Vector Search using 384-dimensional cosine vectors.
- MongoDB text-search fallback when vector retrieval is unavailable.
- Grounded question answering with source excerpts and citations.
- `.ics` calendar file parsing, preview, selection, duplicate detection, and ingestion APIs.
- CSV/JSON message export parsing, chronological conversation grouping, preview, selection, duplicate detection, and ingestion APIs.
- Session-level capture results that remain visible as additional sources are processed.
- Responsive black, white, and charcoal interface.
- Health endpoint for checking Atlas connectivity.

### Visible placeholders

The Connectors screen lists the following planned integrations:

- iMessage
- iCal
- Wispr Flow
- Google Calendar
- Outlook Calendar
- Granola

These connector cards do not authenticate, synchronize, or transfer data. Their buttons are disabled and labeled `Coming soon`. The existing manual iMessage-compatible CSV/JSON import and iCal-compatible `.ics` import remain implemented in the backend but are not exposed as primary tabs in the current interface.

### Not implemented

- User accounts or authentication.
- OAuth authorization for any connector.
- Background or incremental synchronization.
- Connector account management, revocation, or sync status.
- Direct access to the macOS Messages database.
- Live iMessage synchronization.
- Google Calendar, Outlook Calendar, Wispr Flow, or Granola APIs.
- Per-user data isolation; the current database is shared by the running application.
- A persistent UI history view that loads all memories from Atlas after refresh.
- Memory editing, deletion, source management, or export in the UI.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4 through PostCSS
- MongoDB Atlas
- Official MongoDB Node.js driver
- MongoDB Atlas Vector Search
- Luminal Cloud OpenAI-compatible chat-completions API
- DeepSeek model: `deepseek-ai/DeepSeek-V4.1-Flash`
- Transformers.js local embedding model: `Xenova/all-MiniLM-L6-v2`
- `ical.js` for calendar parsing

## Architecture

```text
Source text
   │
   ├── Luminal DeepSeek ──> structured memories
   │                              │
   │                              └── local 384d embeddings
   │
   └────────────────────────> MongoDB Atlas
                                  ├── sources collection
                                  └── memories collection
                                           │
Natural-language query ──> local embedding │
                                           ▼
                              Atlas Vector Search
                                           │
                              retrieved memories
                                           │
                              Luminal DeepSeek
                                           │
                              grounded answer + citations
```

Luminal extracts memories and writes grounded answers. It does not generate embeddings. Embeddings are generated inside the RecallDB server process. MongoDB Atlas is the persistence and semantic-retrieval layer.

## Application structure

```text
src/app/
  page.tsx                         Main page entry
  recall-app.tsx                   Client UI and interaction state
  globals.css                      Tailwind and global theme
  api/health/route.ts              Atlas health check
  api/sources/route.ts             Text ingestion
  api/search/route.ts              Semantic search
  api/answer/route.ts              Grounded answers
  api/imports/calendar/            Calendar preview and commit
  api/imports/messages/            Message preview and commit

src/lib/
  mongodb.ts                       Shared MongoDB client and database access
  models.ts                        Source and memory document types
  luminal.ts                       Extraction and grounded-answer requests
  embeddings.ts                    Local embedding pipeline
  ingestion.ts                     Shared source-to-memory persistence flow
  search.ts                        Vector search and text fallback
  imports/calendar.ts              `.ics` parsing and source formatting
  imports/messages.ts              CSV/JSON parsing and conversation grouping

scripts/
  setup-database.mjs               Collections, validators, and indexes
  backfill-embeddings.mjs          Adds embeddings to existing memories

atlas/vector-index.json            Atlas Vector Search index definition
demo/                              Synthetic import fixtures and demo assets
```

## MongoDB data model

### `sources`

Each source stores the original text plus provenance:

- `title`
- `rawText`
- `sourceType`: `note`, `conversation`, `meeting`, `calendar`, or `other`
- optional stable `sourceIdentifier` for import deduplication
- optional `occurredAt` and `endedAt`
- optional metadata for calendar or message imports
- `memoryCount`
- `createdAt`

The sparse unique `sourceIdentifier` index prevents duplicate imported sources while allowing manually pasted sources without an identifier.

### `memories`

Each memory links back to one source through `sourceId` and stores:

- `kind`: `person`, `idea`, `decision`, `task`, `fact`, or `other`
- `title`
- `content`
- exact `sourceExcerpt`
- `importance` from 1 through 5
- `tags`
- `people`
- optional 384-dimensional `embedding`
- `createdAt`

JSON Schema validation is applied to both collections by `npm run db:setup`.

## Ingestion behavior

`ingestSource()` is the shared ingestion path:

1. Check a supplied stable source identifier for duplicates.
2. Ask Luminal to extract one to ten grounded memories.
3. Generate a normalized local embedding for each memory.
4. Insert the original source into `sources`.
5. Insert linked memories into `memories`.
6. Remove the newly inserted source if memory insertion fails.

The source text limit for manual capture is 50,000 characters. Calendar and message preview routes validate file sizes and input formats before any selected material is sent to Luminal.

## Retrieval behavior

`semanticSearch()` embeds the user query locally and runs `$vectorSearch` against the `memory_vector_index`. It joins each result to its original source. If vector generation or vector search fails, it falls back to MongoDB `$text` search using the `memory_text_search` index.

The answer endpoint retrieves up to six memories, gives Luminal the memory claim, exact source excerpt, source title, source type, and timestamp, and returns only citations that map to retrieved results.

## API routes

| Method | Route | Current purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Verify MongoDB Atlas connectivity |
| `POST` | `/api/sources` | Extract, embed, and store a pasted source |
| `POST` | `/api/search` | Run semantic retrieval with text fallback |
| `POST` | `/api/answer` | Generate an answer grounded in retrieved memories |
| `POST` | `/api/imports/calendar/preview` | Parse an `.ics` file and flag duplicates |
| `POST` | `/api/imports/calendar/commit` | Process one approved calendar event |
| `POST` | `/api/imports/messages/preview` | Parse CSV/JSON and group conversations |
| `POST` | `/api/imports/messages/commit` | Process one approved conversation segment |

There are currently no connector API routes.

## Configuration

The application reads these server-side environment variables:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB` | Database name; defaults to `recalldb` |
| `LUMINAL_API_KEY` | Luminal bearer token |
| `LUMINAL_BASE_URL` | Luminal API base URL |
| `LUMINAL_MODEL` | Luminal chat model |

Secrets belong in `.env.local`, which is ignored by Git. Browser code does not receive these variables.

## Local development

```bash
npm install
cp .env.example .env.local
npm run db:setup
npm run dev
```

Open `http://localhost:3000`. The first local embedding request downloads the model. In Vercel, the model cache is directed to `/tmp/recalldb-transformers`, because the deployed application directory is read-only.

## Verification

```bash
npm run lint
npm run build
```

Production verification should also cover:

1. `GET /api/health` returns 200.
2. A synthetic pasted source is extracted and saved.
3. Semantic search returns a vector result with its source.
4. A grounded answer includes citations.
5. Calendar and message files can be previewed without sending data to Luminal.
6. Any synthetic production test records are removed afterward.

## Privacy and security boundaries

- Credentials are server-side only.
- The app accepts only user-selected files; it does not read private system databases.
- Calendar and message previews happen before AI processing.
- Only selected calendar events or message segments are submitted for extraction.
- There is currently no authentication or per-user authorization, so the deployed MVP must not be treated as a private multi-user service.
- Atlas network access must be explicitly configured for the deployment environment. Temporary broad allow-list rules are not a permanent production design.

## Connector implementation roadmap

Before implementing connector functionality, decisions are required for authentication, ownership, synchronization, and privacy. No connector should be built by assuming these choices.

1. Define whether RecallDB will support one local user, multiple accounts, or organizations.
2. Add authentication and per-user ownership to every source and memory.
3. Define a connector document model with provider, account, encrypted credentials, scopes, cursor, sync state, and last error.
4. Choose the exact provider APIs and OAuth scopes for Google Calendar and Microsoft Outlook.
5. Confirm whether “iCal” means uploaded `.ics` files, subscribed calendar feeds, Apple Calendar integration, or all three.
6. Confirm the permitted iMessage acquisition method; the current project supports user-provided exports only.
7. Confirm available Wispr Flow and Granola integration APIs and user-consent requirements.
8. Add preview and selection controls before external content is sent to Luminal.
9. Add incremental sync, deduplication, revocation, deletion, and retry behavior.
10. Add connector-specific tests and visible sync status.

## Open product decisions

The following are intentionally unresolved and require explicit direction:

- Authentication provider and account model.
- Whether connector sync is manual, scheduled, event-driven, or a combination.
- Whether connected data is imported in full or selected through a review queue.
- Data-retention and deletion policy.
- How connector credentials are encrypted and rotated.
- Whether existing manual calendar and message imports stay visible beside connectors.
- Whether the app needs a persistent library/browse view for all stored sources and memories.
- Deployment target and permanent Atlas network configuration.

## Demo data

Files in `demo/` are synthetic unless separately documented. They must not be presented as real imported user content. `demo/recall-demo.mp4` is an untracked local asset at the time this document was created and is not required by the application runtime.
