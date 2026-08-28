import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { db } from "@/lib/db";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export const GUEST_COOKIE_NAME = "grounded_guest";
export const GUEST_CREDENTIAL_BYTES = 32;

const guestCredentialPattern = /^[A-Za-z0-9_-]{43}$/;

type GuestSessionRow = {
  workspace_id: string;
  chat_id: string;
};

export type GuestSessionRepository = {
  findByDigest: (credentialDigest: string) => Promise<WorkspaceContext | null>;
  create: (credentialDigest: string) => Promise<WorkspaceContext>;
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

const databaseGuestSessions: GuestSessionRepository = {
  async findByDigest(credentialDigest) {
    const rows = (await db().query(
      `
        SELECT guest_sessions.workspace_id, guest_sessions.chat_id
        FROM guest_sessions
        INNER JOIN workspaces ON workspaces.id = guest_sessions.workspace_id
        INNER JOIN chats
          ON chats.workspace_id = guest_sessions.workspace_id
          AND chats.id = guest_sessions.chat_id
        WHERE guest_sessions.credential_digest = $1
        LIMIT 1
      `,
      [credentialDigest],
    )) as unknown as GuestSessionRow[];
    const row = rows[0];
    return row
      ? Object.freeze({ workspaceId: row.workspace_id, conversationId: row.chat_id })
      : null;
  },

  async create(credentialDigest) {
    const workspaceId = randomUUID();
    const conversationId = randomUUID();
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
        INSERT INTO guest_sessions (credential_digest, workspace_id, chat_id)
        VALUES (${credentialDigest}, ${workspaceId}, ${conversationId})
      `,
    ]);

    return Object.freeze({ workspaceId, conversationId });
  },
};

export async function resolveGuestCredential(
  presentedCredential: string | undefined,
  repository: GuestSessionRepository = databaseGuestSessions,
): Promise<GuestResolution> {
  if (isGuestCredential(presentedCredential)) {
    const existing = await repository.findByDigest(
      digestGuestCredential(presentedCredential),
    );
    if (existing) return { workspace: existing, credentialToSet: null };
  }

  const credential = generateGuestCredential();
  const workspace = await repository.create(digestGuestCredential(credential));
  return { workspace, credentialToSet: credential };
}

export async function resolveGuestWorkspace() {
  const cookieStore = await cookies();
  const resolution = await resolveGuestCredential(
    cookieStore.get(GUEST_COOKIE_NAME)?.value,
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
