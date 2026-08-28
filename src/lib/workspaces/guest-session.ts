import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { db } from "@/lib/db";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export const GUEST_COOKIE_NAME = "grounded_guest";
export const GUEST_CREDENTIAL_BYTES = 32;
export const GUEST_INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 1 hour

const guestCredentialPattern = /^[A-Za-z0-9_-]{43}$/;

type GuestSessionRow = {
  workspace_id: string;
  chat_id: string;
  expires_at: string;
  last_active_at: string;
};

export type ClockFn = () => Date;

export type GuestSessionRepository = {
  findByDigest: (
    credentialDigest: string,
    now?: Date,
  ) => Promise<WorkspaceContext | null>;
  create: (
    credentialDigest: string,
    now?: Date,
  ) => Promise<WorkspaceContext>;
  touchActivity: (
    credentialDigest: string,
    now?: Date,
  ) => Promise<void>;
  deleteByDigest: (credentialDigest: string) => Promise<void>;
  deleteByWorkspaceId: (workspaceId: string) => Promise<void>;
  cleanupExpired: (
    batchSize?: number,
    now?: Date,
  ) => Promise<{ deletedCount: number }>;
};

export type GuestResolution = Readonly<{
  workspace: WorkspaceContext;
  credentialToSet: string | null;
}>;

export function isGuestCredential(value: string | undefined): value is string {
  return typeof value === "string" && guestCredentialPattern.test(value);
}

export function generateGuestCredential() {
  return randomBytes(GUEST_CREDENTIAL_BYTES).toString("base64url");
}

export function digestGuestCredential(credential: string) {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

export function guestCookieOptions(isProduction = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    priority: "high" as const,
  };
}

export const databaseGuestSessions: GuestSessionRepository = {
  async findByDigest(credentialDigest, now = new Date()) {
    const rows = (await db().query(
      `
        SELECT guest_sessions.workspace_id, guest_sessions.chat_id, guest_sessions.expires_at, guest_sessions.last_active_at
        FROM guest_sessions
        INNER JOIN workspaces ON workspaces.id = guest_sessions.workspace_id
        INNER JOIN chats
          ON chats.workspace_id = guest_sessions.workspace_id
          AND chats.id = guest_sessions.chat_id
        WHERE guest_sessions.credential_digest = $1
          AND guest_sessions.expires_at > $2
        LIMIT 1
      `,
      [credentialDigest, now.toISOString()],
    )) as unknown as GuestSessionRow[];
    const row = rows[0];
    return row
      ? Object.freeze({ workspaceId: row.workspace_id, conversationId: row.chat_id })
      : null;
  },

  async touchActivity(credentialDigest, now = new Date()) {
    const expiresAt = new Date(now.getTime() + GUEST_INACTIVITY_LIMIT_MS);
    await db().query(
      `
        UPDATE guest_sessions
        SET last_active_at = $2,
            expires_at = $3
        WHERE credential_digest = $1
      `,
      [credentialDigest, now.toISOString(), expiresAt.toISOString()],
    );
  },

  async create(credentialDigest, now = new Date()) {
    const workspaceId = randomUUID();
    const conversationId = randomUUID();
    const expiresAt = new Date(now.getTime() + GUEST_INACTIVITY_LIMIT_MS);
    const sql = db();

    await sql.transaction((transaction) => [
      transaction`
        INSERT INTO workspaces (id)
        VALUES (${workspaceId})
      `,
      transaction`
        INSERT INTO chats (id, workspace_id)
        VALUES (${conversationId}, ${workspaceId})
      `,
      transaction`
        INSERT INTO guest_sessions (credential_digest, workspace_id, chat_id, last_active_at, expires_at)
        VALUES (${credentialDigest}, ${workspaceId}, ${conversationId}, ${now.toISOString()}, ${expiresAt.toISOString()})
      `,
    ]);

    return Object.freeze({ workspaceId, conversationId });
  },

  async deleteByDigest(credentialDigest) {
    await db().query(
      `
        DELETE FROM workspaces
        WHERE id IN (
          SELECT workspace_id FROM guest_sessions WHERE credential_digest = $1
        )
      `,
      [credentialDigest],
    );
  },

  async deleteByWorkspaceId(workspaceId) {
    await db().query(
      `
        DELETE FROM workspaces
        WHERE id = $1
      `,
      [workspaceId],
    );
  },

  async cleanupExpired(batchSize = 50, now = new Date()) {
    const rows = (await db().query(
      `
        WITH expired AS (
          SELECT workspace_id
          FROM guest_sessions
          WHERE expires_at <= $1
          LIMIT $2
        )
        DELETE FROM workspaces
        WHERE id IN (SELECT workspace_id FROM expired)
        RETURNING id
      `,
      [now.toISOString(), batchSize],
    )) as unknown as { id: string }[];

    return { deletedCount: rows.length };
  },
};

export async function resolveGuestCredential(
  presentedCredential: string | undefined,
  repository: GuestSessionRepository = databaseGuestSessions,
  clock: ClockFn = () => new Date(),
): Promise<GuestResolution> {
  const now = clock();
  if (isGuestCredential(presentedCredential)) {
    const digest = digestGuestCredential(presentedCredential);
    const existing = await repository.findByDigest(digest, now);
    if (existing) {
      await repository.touchActivity(digest, now);
      return { workspace: existing, credentialToSet: null };
    }
    // Clean up any stale/expired workspace linked to this digest
    await repository.deleteByDigest(digest);
  }

  const credential = generateGuestCredential();
  const workspace = await repository.create(digestGuestCredential(credential), now);
  return { workspace, credentialToSet: credential };
}

export async function resolveGuestWorkspace(
  repository: GuestSessionRepository = databaseGuestSessions,
  clock: ClockFn = () => new Date(),
) {
  const cookieStore = await cookies();
  const resolution = await resolveGuestCredential(
    cookieStore.get(GUEST_COOKIE_NAME)?.value,
    repository,
    clock,
  );

  if (resolution.credentialToSet) {
    cookieStore.set(
      GUEST_COOKIE_NAME,
      resolution.credentialToSet,
      guestCookieOptions(),
    );
  }

  return resolution.workspace;
}

export async function resetGuestWorkspace(
  repository: GuestSessionRepository = databaseGuestSessions,
  clock: ClockFn = () => new Date(),
): Promise<{ workspace: WorkspaceContext; credential: string }> {
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(GUEST_COOKIE_NAME)?.value;

  if (isGuestCredential(existingCookie)) {
    await repository.deleteByDigest(digestGuestCredential(existingCookie));
  }

  const credential = generateGuestCredential();
  const workspace = await repository.create(digestGuestCredential(credential), clock());

  cookieStore.set(
    GUEST_COOKIE_NAME,
    credential,
    guestCookieOptions(),
  );

  return { workspace, credential };
}

export async function endGuestSession(
  repository: GuestSessionRepository = databaseGuestSessions,
): Promise<void> {
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(GUEST_COOKIE_NAME)?.value;

  if (isGuestCredential(existingCookie)) {
    await repository.deleteByDigest(digestGuestCredential(existingCookie));
  }

  cookieStore.delete(GUEST_COOKIE_NAME);
}
