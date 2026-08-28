/**
 * document-chat
 * Copyright (C) 2026 Famanias
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import type { MemberAccount } from "@/lib/auth/types";

type MemberRow = {
  id: string;
  provider_subject: string;
  email: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
};

function mapMemberRow(row: MemberRow): MemberAccount {
  return Object.freeze({
    id: row.id,
    providerSubject: row.provider_subject,
    email: row.email,
    workspaceId: row.workspace_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function findMemberBySubject(
  providerSubject: string,
): Promise<MemberAccount | null> {
  const rows = (await db().query(
    `
      SELECT id, provider_subject, email, workspace_id, created_at, updated_at
      FROM member_accounts
      WHERE provider_subject = $1
      LIMIT 1
    `,
    [providerSubject],
  )) as unknown as MemberRow[];

  const row = rows[0];
  return row ? mapMemberRow(row) : null;
}

export async function findMemberByEmail(
  email: string,
): Promise<MemberAccount | null> {
  const rows = (await db().query(
    `
      SELECT id, provider_subject, email, workspace_id, created_at, updated_at
      FROM member_accounts
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email],
  )) as unknown as MemberRow[];

  const row = rows[0];
  return row ? mapMemberRow(row) : null;
}

export async function getOrCreateMemberWorkspace(
  providerSubject: string,
  email: string,
): Promise<MemberAccount> {
  const existing = await findMemberBySubject(providerSubject);
  if (existing) return existing;

  const memberId = randomUUID();
  const workspaceId = randomUUID();
  const conversationId = randomUUID();
  const sql = db();

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO workspaces (id)
      VALUES (${workspaceId})
      ON CONFLICT DO NOTHING
    `,
    transaction`
      INSERT INTO chats (id, workspace_id, title)
      VALUES (${conversationId}, ${workspaceId}, 'New conversation')
      ON CONFLICT DO NOTHING
    `,
    transaction`
      INSERT INTO member_accounts (id, provider_subject, email, workspace_id)
      VALUES (${memberId}, ${providerSubject}, ${email}, ${workspaceId})
      ON CONFLICT (provider_subject) DO NOTHING
    `,
  ]);

  const member = await findMemberBySubject(providerSubject);
  if (!member) throw new Error("Failed to load or provision member account.");
  return member;
}
