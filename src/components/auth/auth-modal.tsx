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
"use client";

import { AlertCircle, Lock, Mail, X } from "lucide-react";
import { FormEvent, useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AuthModal({ isOpen, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = tab === "signin" ? "/api/auth/signin" : "/api/auth/signup";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: unknown;
      };

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-sm rounded-2xl border bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-subtle)] focus-visible:outline-2"
        >
          <X aria-hidden="true" className="size-4" />
        </button>

        <div className="flex gap-2 border-b pb-3">
          <button
            type="button"
            onClick={() => {
              setTab("signin");
              setError(null);
            }}
            className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
              tab === "signin"
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--muted)] hover:text-[#20302c]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("signup");
              setError(null);
            }}
            className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
              tab === "signup"
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--muted)] hover:text-[#20302c]"
            }`}
          >
            Sign Up
          </button>
        </div>

        <h2 id="auth-modal-title" className="mt-4 text-lg font-semibold text-[#20302c]">
          {tab === "signin" ? "Sign in to save your work" : "Create a member account"}
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {tab === "signin"
            ? "Your temporary conversation will be claimed into your account."
            : "Sign up to keep your documents and chats permanently."}
        </p>

        {error ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--danger-soft)] p-2.5 text-xs text-[var(--danger)]">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#31413d]">Email address</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--muted)]">
                <Mail aria-hidden="true" className="size-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm focus:outline-2 focus:outline-[var(--primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#31413d]">Password</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--muted)]">
                <Lock aria-hidden="true" className="size-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm focus:outline-2 focus:outline-[var(--primary)]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] disabled:opacity-50"
          >
            {loading ? (
              <span>Please wait…</span>
            ) : tab === "signin" ? (
              <span>Sign In & Claim</span>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
