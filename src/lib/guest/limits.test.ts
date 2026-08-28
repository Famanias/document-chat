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
