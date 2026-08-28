// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  reciprocalRankFusion,
  type RetrievalCandidate,
} from "@/lib/ai/retrieval-ranking";

const migrationsDirectory = resolve(process.cwd(), "migrations");
const allMigrations = [
  "001_initial.sql",
  "002_openrouter_embeddings.sql",
  "003_workspace_ownership.sql",
  "004_temporary_guest_conversation.sql",
  "005_guest_lifecycle.sql",
  "006_ingestion_jobs.sql",
  "007_hybrid_retrieval.sql",
];

const workspaceA = "10000000-0000-4000-8000-000000000001";
const workspaceB = "20000000-0000-4000-8000-000000000002";
const chatA = "10000000-0000-4000-8000-000000000011";
const chatB = "20000000-0000-4000-8000-000000000012";

function createDatabase() {
  return new PGlite({ extensions: { vector } });
}

async function applyMigrations(database: PGlite, filenames: string[]) {
  for (const filename of filenames) {
    const migration = await readFile(resolve(migrationsDirectory, filename), "utf8");
    const statements = migration
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await database.transaction(async (transaction) => {
      for (const statement of statements) await transaction.exec(statement);
    });
  }
}

describe("reciprocal rank fusion algorithm", () => {
  const candidate1: RetrievalCandidate = {
    chunkId: "c1",
    documentId: "d1",
    filename: "doc1.txt",
    pageNumber: 1,
    section: "Intro",
    chunkIndex: 0,
    content: "Postgres full text search and vector embeddings.",
    similarity: 0.9,
  };

  const candidate2: RetrievalCandidate = {
    chunkId: "c2",
    documentId: "d1",
    filename: "doc1.txt",
    pageNumber: 2,
    section: "Body",
    chunkIndex: 1,
    content: "Reciprocal rank fusion combines multiple ranking signals.",
    similarity: 0.8,
  };

  const candidate3: RetrievalCandidate = {
    chunkId: "c3",
    documentId: "d2",
    filename: "doc2.txt",
    pageNumber: 1,
    section: null,
    chunkIndex: 0,
    content: "Keyword search matches exact terms.",
    similarity: 0.7,
  };

  it("fuses vector and lexical candidate lists deterministically", () => {
    const vectorCandidates = [candidate1, candidate2];
    const lexicalCandidates = [candidate2, candidate3];

    const results = reciprocalRankFusion(vectorCandidates, lexicalCandidates);

    expect(results).toHaveLength(3);
    // Candidate 2 is rank 2 in vector (1/(60+2)) and rank 1 in lexical (1/(60+1)) => highest combined score
    expect(results[0]?.chunkId).toBe("c2");
    expect(results[0]?.id).toBe("E1");
    expect(results[0]?.excerpt).toBe(candidate2.content);
    expect(results[0]?.pageNumber).toBe(2);
    expect(results[0]?.section).toBe("Body");
  });

  it("gracefully falls back to vector list when lexical list is empty", () => {
    const vectorCandidates = [candidate1, candidate2];
    const lexicalCandidates: RetrievalCandidate[] = [];

    const results = reciprocalRankFusion(vectorCandidates, lexicalCandidates);

    expect(results).toHaveLength(2);
    expect(results[0]?.chunkId).toBe("c1");
    expect(results[1]?.chunkId).toBe("c2");
  });

  it("supports custom k constant and weights", () => {
    const vectorCandidates = [candidate1];
    const lexicalCandidates = [candidate2];

    const results = reciprocalRankFusion(vectorCandidates, lexicalCandidates, {
      k: 10,
      vectorWeight: 2.0,
      lexicalWeight: 1.0,
    });

    // candidate1 vector score = 2.0 / (10 + 1) = 0.1818
    // candidate2 lexical score = 1.0 / (10 + 1) = 0.0909
    expect(results[0]?.chunkId).toBe("c1");
    expect(results[1]?.chunkId).toBe("c2");
  });
});

describe("database hybrid full-text & vector retrieval", () => {
  let database: PGlite;
  const zeroVector = `[${Array.from({ length: 1_024 }, () => "0").join(",")}]`;

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);

    await database.query("INSERT INTO workspaces (id) VALUES ($1), ($2)", [workspaceA, workspaceB]);
    await database.query("INSERT INTO chats (id, workspace_id) VALUES ($1, $2), ($3, $4)", [
      chatA,
      workspaceA,
      chatB,
      workspaceB,
    ]);

    // Insert doc in workspace A
    await database.query(
      "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ('50000000-0000-4000-8000-000000000001', $1, 'finance.txt', 'text/plain', 100, 'text', 'ready')",
      [workspaceA],
    );
    await database.query(
      "INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, '50000000-0000-4000-8000-000000000001')",
      [workspaceA, chatA],
    );
    await database.query(
      `INSERT INTO document_chunks (id, workspace_id, document_id, chunk_index, content, embedding)
       VALUES ('70000000-0000-4000-8000-000000000001', $1, '50000000-0000-4000-8000-000000000001', 0, 'Quarterly revenue exceeded five million dollars.', $2::vector)`,
      [workspaceA, zeroVector],
    );

    // Insert doc in workspace B (for isolation check)
    await database.query(
      "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ('50000000-0000-4000-8000-000000000002', $1, 'finance_b.txt', 'text/plain', 100, 'text', 'ready')",
      [workspaceB],
    );
    await database.query(
      "INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, '50000000-0000-4000-8000-000000000002')",
      [workspaceB, chatB],
    );
    await database.query(
      `INSERT INTO document_chunks (id, workspace_id, document_id, chunk_index, content, embedding)
       VALUES ('70000000-0000-4000-8000-000000000002', $1, '50000000-0000-4000-8000-000000000002', 0, 'Quarterly revenue in workspace B exceeded ten million.', $2::vector)`,
      [workspaceB, zeroVector],
    );
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("matches full-text search using generated content_tsv column", async () => {
    const result = await database.query<{ chunk_id: string; content: string }>(
      `
        SELECT chunks.id AS chunk_id, chunks.content
        FROM document_chunks AS chunks
        INNER JOIN documents ON documents.id = chunks.document_id
        INNER JOIN chat_documents ON chat_documents.document_id = documents.id
        WHERE chunks.workspace_id = $1
          AND chat_documents.chat_id = $2
          AND documents.status = 'ready'
          AND chunks.content_tsv @@ plainto_tsquery('english', 'revenue')
      `,
      [workspaceA, chatA],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.chunk_id).toBe("70000000-0000-4000-8000-000000000001");
    expect(result.rows[0]?.content).toContain("Quarterly revenue");
  });

  it("strictly respects workspace isolation in full-text queries", async () => {
    const crossResult = await database.query(
      `
        SELECT chunks.id
        FROM document_chunks AS chunks
        INNER JOIN documents ON documents.id = chunks.document_id
        INNER JOIN chat_documents ON chat_documents.document_id = documents.id
        WHERE chunks.workspace_id = $1
          AND chat_documents.chat_id = $2
          AND chunks.content_tsv @@ plainto_tsquery('english', 'revenue')
      `,
      [workspaceA, chatB],
    );

    expect(crossResult.rows).toHaveLength(0);
  });
});
