// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import { GuestRateLimiter, guestLimits } from "@/lib/guest/limits";

const originalEnv = {
  GUEST_MAX_UPLOAD_BYTES: process.env.GUEST_MAX_UPLOAD_BYTES,
  GUEST_MAX_MESSAGE_CHARACTERS: process.env.GUEST_MAX_MESSAGE_CHARACTERS,
  GUEST_REQUESTS_PER_MINUTE: process.env.GUEST_REQUESTS_PER_MINUTE,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("guest limits", () => {
  it("loads positive configurable upload, message, and rate limits", () => {
    process.env.GUEST_MAX_UPLOAD_BYTES = "2048";
    process.env.GUEST_MAX_MESSAGE_CHARACTERS = "900";
    process.env.GUEST_REQUESTS_PER_MINUTE = "3";

    expect(guestLimits()).toEqual({
      maxUploadBytes: 2048,
      maxMessageCharacters: 900,
      requestsPerMinute: 3,
    });
  });

  it("fails closed for invalid configuration", () => {
    process.env.GUEST_REQUESTS_PER_MINUTE = "0";
    expect(() => guestLimits()).toThrow("GUEST_REQUESTS_PER_MINUTE must be a positive integer");
  });

  it("isolates fixed request windows per guest and permits requests after reset", () => {
    const limiter = new GuestRateLimiter();

    expect(limiter.consume("guest-a", 2, 1_000).allowed).toBe(true);
    expect(limiter.consume("guest-a", 2, 2_000).allowed).toBe(true);
    expect(limiter.consume("guest-a", 2, 3_000)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 58,
    });
    expect(limiter.consume("guest-b", 2, 3_000).allowed).toBe(true);
    expect(limiter.consume("guest-a", 2, 61_000).allowed).toBe(true);
  });
});
