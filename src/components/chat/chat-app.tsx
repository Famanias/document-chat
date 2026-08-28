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

import { AlertCircle, RefreshCw, ScanText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AuthModal } from "@/components/auth/auth-modal";
import {
  ChatConversation,
  type GuestClientLimits,
  type UploadState,
} from "@/components/chat/chat-conversation";
import type { ChatDetail, ChatSummary, DocumentSummary } from "@/lib/chat/types";

type ChatResponse = {
  mode: "guest" | "member";
  chat: ChatDetail;
  chats?: ChatSummary[];
  user?: { id: string; email: string };
  limits?: GuestClientLimits;
};

class ClientApiError extends Error {}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json().catch(() => null)) as { error?: unknown } | T | null;
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "The request could not be completed.";
    throw new ClientApiError(message);
  }
  return data as T;
}

function uploadLimitLabel(maxUploadBytes: number) {
  if (maxUploadBytes < 1024 * 1024) return `${Math.ceil(maxUploadBytes / 1024)} KB`;
  const megabytes = maxUploadBytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

export function ChatApp() {
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [mode, setMode] = useState<"guest" | "member">("guest");
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [limits, setLimits] = useState<GuestClientLimits>({
    maxUploadBytes: 4 * 1024 * 1024,
    maxMessageCharacters: 12_000,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const loadConversation = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setAppError(null);
    try {
      const response = await requestJson<ChatResponse>("/api/chats");
      setActiveChat(response.chat);
      setMode(response.mode);
      setUser(response.user ?? null);
      if (response.limits) {
        setLimits(response.limits);
      }
    } catch (error) {
      setActiveChat(null);
      setAppError(
        error instanceof ClientApiError
          ? error.message
          : "Grounded could not open the conversation. Check the app configuration and try again.",
      );
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadConversation(true), 0);
    return () => window.clearTimeout(timeout);
  }, [loadConversation]);

  const resetConversation = async () => {
    setIsLoading(true);
    setAppError(null);
    try {
      if (mode === "member") {
        const response = await requestJson<{ chat: ChatDetail }>("/api/chats", {
          method: "POST",
        });
        setActiveChat(response.chat);
      } else {
        const response = await requestJson<ChatResponse>("/api/chats?action=reset", {
          method: "DELETE",
        });
        setActiveChat(response.chat);
        if (response.limits) setLimits(response.limits);
      }
      setUploadState({ status: "idle" });
    } catch (error) {
      setAppError(
        error instanceof ClientApiError ? error.message : "Failed to reset conversation.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const endSession = async () => {
    setIsLoading(true);
    setAppError(null);
    try {
      await requestJson<{ ok: boolean }>("/api/chats?action=end", {
        method: "DELETE",
      });
      setActiveChat(null);
      setIsSessionEnded(true);
    } catch (error) {
      setAppError(
        error instanceof ClientApiError ? error.message : "Failed to end session.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      await requestJson("/api/auth/signout", { method: "POST" });
      await loadConversation(true);
    } catch (error) {
      setAppError(error instanceof ClientApiError ? error.message : "Failed to sign out.");
    } finally {
      setIsLoading(false);
    }
  };

  const uploadDocument = async (file: File) => {
    if (!activeChat) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "txt", "md"].includes(extension)) {
      setUploadState({ status: "error", message: "Upload a PDF, TXT, or Markdown (.md) file." });
      return;
    }
    if (file.size > limits.maxUploadBytes) {
      setUploadState({
        status: "error",
        message: `Temporary uploads are limited to ${uploadLimitLabel(limits.maxUploadBytes)}. Choose a smaller document.`,
      });
      return;
    }

    setUploadState({ status: "uploading", filename: file.name });
    const formData = new FormData();
    formData.set("chatId", activeChat.id);
    formData.set("file", file);

    try {
      await requestJson("/api/documents", { method: "POST", body: formData });
      await loadConversation();
      setUploadState({ status: "idle" });
    } catch (error) {
      setUploadState({
        status: "error",
        message:
          error instanceof ClientApiError
            ? error.message
            : "The document could not be indexed. Please try again.",
      });
    }
  };

  const retryDocument = async (document: DocumentSummary) => {
    if (!activeChat) return;

    setUploadState({ status: "uploading", filename: document.filename });
    try {
      const result = await requestJson<{ success: boolean; error?: string }>(
        `/api/documents/${document.id}/reindex`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: activeChat.id }),
        },
      );
      if (!result.success) {
        throw new ClientApiError(result.error ?? "The document could not be indexed.");
      }
      await loadConversation();
      setUploadState({ status: "idle" });
    } catch (error) {
      setUploadState({
        status: "error",
        message:
          error instanceof ClientApiError
            ? error.message
            : "The document could not be indexed. Please try again.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#173f39] text-white">
            <ScanText aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-4 text-sm text-[var(--muted)]">Opening your conversation…</p>
        </div>
      </div>
    );
  }

  if (isSessionEnded) {
    return (
      <main className="flex h-dvh items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <ScanText aria-hidden="true" className="size-6" />
          </span>
          <h1 className="mt-5 text-xl font-semibold text-[#20302c]">Temporary session ended</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Your temporary documents and chat data have been deleted.
          </p>
          <button
            type="button"
            onClick={() => {
              setIsSessionEnded(false);
              void loadConversation(true);
            }}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] focus-visible:outline-2"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Start new session
          </button>
        </div>
      </main>
    );
  }

  if (!activeChat) {
    return (
      <main className="flex h-dvh items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
            <AlertCircle aria-hidden="true" className="size-6" />
          </span>
          <h1 className="mt-5 text-xl font-semibold text-[#20302c]">Conversation unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{appError}</p>
          <button
            type="button"
            onClick={() => void loadConversation(true)}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold text-[#31413d] hover:bg-[var(--surface-subtle)] focus-visible:outline-2"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--background)]">
      <ChatConversation
        key={activeChat.id}
        chat={activeChat}
        limits={limits}
        uploadState={uploadState}
        onUpload={uploadDocument}
        onRetryDocument={retryDocument}
        onConversationChanged={() => void loadConversation()}
        onResetConversation={resetConversation}
        onEndSession={endSession}
        mode={mode}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={signOut}
      />
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => void loadConversation(true)}
      />
    </div>
  );
}
