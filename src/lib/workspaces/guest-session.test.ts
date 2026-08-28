// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  digestGuestCredential,
  generateGuestCredential,
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
    ...overrides,
  };
}

describe("guest credentials", () => {
  it("generates a 256-bit opaque credential and a one-way digest", () => {
    const credential = generateGuestCredential();
    const digest = digestGuestCredential(credential);

    expect(isGuestCredential(credential)).toBe(true);
    expect(credential).toHaveLength(43);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(credential);
  });

  it("resumes the same workspace and conversation for a valid session", async () => {
    const credential = generateGuestCredential();
    const store = repository({ findByDigest: vi.fn(async () => workspace) });

    await expect(resolveGuestCredential(credential, store)).resolves.toEqual({
      workspace,
      credentialToSet: null,
    });
    expect(store.findByDigest).toHaveBeenCalledWith(digestGuestCredential(credential));
    expect(store.create).not.toHaveBeenCalled();
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
