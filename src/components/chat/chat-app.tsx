"use client";

import { AlertCircle, RefreshCw, ScanText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  ChatConversation,
  type GuestClientLimits,
  type UploadState,
} from "@/components/chat/chat-conversation";
import type { ChatDetail } from "@/lib/chat/types";

type ChatResponse = {
  mode: "guest";
  chat: ChatDetail;
  limits: GuestClientLimits;
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
  const [limits, setLimits] = useState<GuestClientLimits>({
    maxUploadBytes: 4 * 1024 * 1024,
    maxMessageCharacters: 12_000,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const loadConversation = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setAppError(null);
    try {
      const response = await requestJson<ChatResponse>("/api/chats");
      setActiveChat(response.chat);
      setLimits(response.limits);
    } catch (error) {
      setActiveChat(null);
      setAppError(
        error instanceof ClientApiError
          ? error.message
          : "Grounded could not open the temporary conversation. Check the app configuration and try again.",
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
      const response = await requestJson<ChatResponse>("/api/chats?action=reset", {
        method: "DELETE",
      });
      setActiveChat(response.chat);
      setLimits(response.limits);
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
      await loadConversation(true);
    } catch (error) {
      setAppError(
        error instanceof ClientApiError ? error.message : "Failed to end session.",
      );
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

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#173f39] text-white">
            <ScanText aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-4 text-sm text-[var(--muted)]">Opening your temporary conversation…</p>
        </div>
      </div>
    );
  }

  if (!activeChat) {
    return (
      <main className="flex h-dvh items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
            <AlertCircle aria-hidden="true" className="size-6" />
          </span>
          <h1 className="mt-5 text-xl font-semibold text-[#20302c]">Temporary conversation unavailable</h1>
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
        onConversationChanged={() => void loadConversation()}
        onResetConversation={resetConversation}
        onEndSession={endSession}
      />
    </div>
  );
}
