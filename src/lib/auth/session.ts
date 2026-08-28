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

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import type { MemberSession } from "@/lib/auth/types";

export const MEMBER_COOKIE_NAME = "grounded_member";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getAuthSecret(): string {
  return process.env.MEMBER_AUTH_SECRET || process.env.DATABASE_URL || "grounded-member-secret-key-32bytes-min";
}

type SessionPayload = {
  sub: string;
  email: string;
  ws: string;
  iat: number;
  exp: number;
};

export function signMemberSession(session: MemberSession): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: session.userId,
    email: session.email,
    ws: session.workspaceId,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getAuthSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

export function verifyMemberSessionToken(token: string): MemberSession | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSignature = createHmac("sha256", getAuthSecret()).update(payloadB64).digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expBuffer.length || !timingSafeEqual(sigBuffer, expBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;

    return Object.freeze({
      userId: payload.sub,
      email: payload.email,
      workspaceId: payload.ws,
    });
  } catch {
    return null;
  }
}

export function memberCookieOptions(isProduction = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high" as const,
  };
}

export async function resolveMemberSession(): Promise<MemberSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(MEMBER_COOKIE_NAME)?.value;
  if (!token) return null;

  return verifyMemberSessionToken(token);
}

export async function setMemberSessionCookie(session: MemberSession): Promise<void> {
  const cookieStore = await cookies();
  const token = signMemberSession(session);
  cookieStore.set(MEMBER_COOKIE_NAME, token, memberCookieOptions());
}

export async function clearMemberSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(MEMBER_COOKIE_NAME);
}
