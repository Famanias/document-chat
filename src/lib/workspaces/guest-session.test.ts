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
// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  digestGuestCredential,
  generateGuestCredential,
  GUEST_INACTIVITY_LIMIT_MS,
  guestCookieOptions,
  isGuestCredential,
  resolveGuestCredential,
  type GuestSessionRepository,
} from "@/lib/workspaces/guest-session";

const workspace = Object.freeze({
  workspaceId: "10000000-0000-4000-8000-000000000001",
  conversationId: "10000000-0000-4000-8000-000000000011",
});

function repository(overrides: Partial<GuestSessionRepository> = {}): GuestSessionRepository {
  return {
    findByDigest: vi.fn(async () => null),
    create: vi.fn(async () => workspace),
    touchActivity: vi.fn(async () => {}),
    deleteByDigest: vi.fn(async () => {}),
    deleteByWorkspaceId: vi.fn(async () => {}),
    cleanupExpired: vi.fn(async () => ({ deletedCount: 0 })),
    ...overrides,
  };
}

describe("guest credentials and session lifecycle", () => {
  it("generates a 256-bit opaque credential and a one-way digest", () => {
    const credential = generateGuestCredential();
    const digest = digestGuestCredential(credential);

    expect(isGuestCredential(credential)).toBe(true);
    expect(credential).toHaveLength(43);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(credential);
  });

  it("resumes the same workspace and touches activity for a valid unexpired session", async () => {
    const credential = generateGuestCredential();
    const now = new Date("2026-08-28T12:00:00Z");
    const store = repository({ findByDigest: vi.fn(async () => workspace) });

    await expect(
      resolveGuestCredential(credential, store, () => now),
    ).resolves.toEqual({
      workspace,
      credentialToSet: null,
    });
    expect(store.findByDigest).toHaveBeenCalledWith(digestGuestCredential(credential), now);
    expect(store.touchActivity).toHaveBeenCalledWith(digestGuestCredential(credential), now);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("expires a session after 1 hour of inactivity and creates a fresh session", async () => {
    const credential = generateGuestCredential();
    const initialTime = new Date("2026-08-28T12:00:00Z");
    const expiredTime = new Date(initialTime.getTime() + GUEST_INACTIVITY_LIMIT_MS + 1000);

    const store = repository({
      findByDigest: vi.fn(async (_digest, now?: Date) => {
        if (now && now.getTime() > initialTime.getTime() + GUEST_INACTIVITY_LIMIT_MS) {
          return null; // Expired
        }
        return workspace;
      }),
    });

    const result = await resolveGuestCredential(credential, store, () => expiredTime);

    expect(result.workspace).toEqual(workspace);
    expect(result.credentialToSet).toSatisfy(isGuestCredential);
    expect(result.credentialToSet).not.toBe(credential);
    expect(store.deleteByDigest).toHaveBeenCalledWith(digestGuestCredential(credential));
    expect(store.create).toHaveBeenCalled();
  });

  it.each(["malformed", generateGuestCredential()])(
    "replaces a missing or invalid session without revealing its prior state",
    async (presentedCredential) => {
      const store = repository();
      const result = await resolveGuestCredential(presentedCredential, store);

      expect(result.workspace).toEqual(workspace);
      expect(result.credentialToSet).toSatisfy(isGuestCredential);
      expect(result.credentialToSet).not.toBe(presentedCredential);
      expect(store.create).toHaveBeenCalledWith(
        digestGuestCredential(result.credentialToSet as string),
        expect.any(Date),
      );
    },
  );

  it("uses an HTTP-only browser-session cookie with no persistent expiry", () => {
    const options = guestCookieOptions(true);

    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      priority: "high",
    });
    expect(options).not.toHaveProperty("expires");
    expect(options).not.toHaveProperty("maxAge");
  });
});
