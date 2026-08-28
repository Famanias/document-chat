"use client";

import clsx from "clsx";
import {
  AlertCircle,
  FileText,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  ScanText,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatConversation, type UploadState } from "@/components/chat/chat-conversation";
import type { ChatDetail, ChatSummary } from "@/lib/chat/types";

type ChatsResponse = { chats: ChatSummary[] };
type ChatResponse = { chat: ChatDetail };

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

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function ChatApp() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const selectedIdRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);

  const toggleSidebar = () => {
    setIsSidebarMinimized((prev) => {
      const next = !prev;
      window.localStorage.setItem("grounded:sidebar-minimized", String(next));
      return next;
    });
  };

  const loadChats = useCallback(async (chooseChat = false) => {
    const response = await requestJson<ChatsResponse>("/api/chats");
    setChats(response.chats);
    if (chooseChat && response.chats.length > 0) {
      const saved = window.localStorage.getItem("grounded:last-chat");
      const nextId = response.chats.some((chat) => chat.id === saved)
        ? saved
        : response.chats[0].id;
      selectedIdRef.current = nextId;
      setSelectedId(nextId);
    }
  }, []);

  const loadChat = useCallback(async (chatId: string) => {
    const requestId = ++loadRequestRef.current;
    setIsLoadingChat(true);
    setAppError(null);
    try {
      const response = await requestJson<ChatResponse>(`/api/chats?id=${encodeURIComponent(chatId)}`);
      if (requestId !== loadRequestRef.current || selectedIdRef.current !== chatId) return;
      setActiveChat(response.chat);
      window.localStorage.setItem("grounded:last-chat", chatId);
    } catch (error) {
      if (requestId !== loadRequestRef.current || selectedIdRef.current !== chatId) return;
      setActiveChat(null);
      setAppError(error instanceof ClientApiError ? error.message : "The conversation could not be loaded.");
    } finally {
      if (requestId === loadRequestRef.current) setIsLoadingChat(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setAppError(null);
    try {
      const savedSidebar = window.localStorage.getItem("grounded:sidebar-minimized");
      if (savedSidebar === "true") {
        setIsSidebarMinimized(true);
      }
      await loadChats(true);
    } catch {
      setAppError("Grounded could not connect to its workspace. Check the app configuration and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [loadChats]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void initialize(), 0);
    return () => window.clearTimeout(timeout);
  }, [initialize]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (selectedId) void loadChat(selectedId);
      else setActiveChat(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadChat, selectedId]);

  const createNewChat = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setAppError(null);
    try {
      const response = await requestJson<{ chat: Pick<ChatDetail, "id"> }>("/api/chats", { method: "POST" });
      await loadChats();
      selectedIdRef.current = response.chat.id;
      setSelectedId(response.chat.id);
      setMobileMenuOpen(false);
      setUploadState({ status: "idle" });
    } catch (error) {
      setAppError(error instanceof ClientApiError ? error.message : "A new conversation could not be created.");
    } finally {
      setIsCreating(false);
    }
  };

  const selectChat = (id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    setMobileMenuOpen(false);
    setUploadState({ status: "idle" });
  };

  const uploadDocument = async (file: File) => {
    if (!activeChat) return;
    const chatId = activeChat.id;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "txt", "md"].includes(extension)) {
      setUploadState({ status: "error", message: "Upload a PDF, TXT, or Markdown (.md) file." });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setUploadState({ status: "error", message: "Documents are limited to 4 MB for this demo." });
      return;
    }

    setUploadState({ status: "uploading", filename: file.name });
    const formData = new FormData();
    formData.set("chatId", chatId);
    formData.set("file", file);

    try {
      await requestJson("/api/documents", { method: "POST", body: formData });
      await Promise.all([
        selectedIdRef.current === chatId ? loadChat(chatId) : Promise.resolve(),
        loadChats(),
      ]);
      setUploadState({ status: "idle" });
    } catch (error) {
      setUploadState({
        status: "error",
        message: error instanceof ClientApiError ? error.message : "The document could not be indexed. Please try again.",
      });
    }
  };

  const sidebar = (
    <aside className="flex h-full w-[286px] flex-col border-r bg-[#f2f6f4]">
      <div className="flex min-h-16 items-center justify-between gap-3 border-b px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#173f39] text-white">
            <ScanText aria-hidden="true" className="size-4.5" />
          </span>
          <div>
            <div className="text-sm font-bold tracking-[-0.02em] text-[#20302c]">Grounded</div>
            <div className="text-[11px] text-[var(--muted)]">Document intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden size-11 items-center justify-center rounded-xl text-[var(--muted)] transition-colors hover:bg-white focus-visible:outline-2 lg:flex"
            aria-label="Minimize sidebar"
            title="Minimize sidebar"
          >
            <PanelLeftClose aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="flex size-11 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-white focus-visible:outline-2 lg:hidden"
            aria-label="Close conversations"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      <div className="p-3">
        <button type="button" onClick={() => void createNewChat()} disabled={isCreating} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
          <Plus aria-hidden="true" className="size-4" />
          {isCreating ? "Starting…" : "New conversation"}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
        <div className="px-2 pb-2 pt-1 text-[11px] font-semibold tracking-[0.08em] text-[#74827e] uppercase">Recent</div>
        {chats.length === 0 ? (
          <div className="mx-2 rounded-xl border border-dashed bg-[rgba(255,255,255,0.5)] px-3 py-5 text-center text-xs leading-5 text-[var(--muted)]">No conversations yet</div>
        ) : (
          <div className="space-y-1">
            {chats.map((chat) => (
              <button key={chat.id} type="button" onClick={() => selectChat(chat.id)} className={clsx("group flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-2", selectedId === chat.id ? "bg-white shadow-[0_1px_2px_rgba(24,54,47,0.08)]" : "hover:bg-[rgba(255,255,255,0.65)]")}>
                <MessageSquareText aria-hidden="true" className={clsx("size-4 shrink-0", selectedId === chat.id ? "text-[var(--primary)]" : "text-[#83918d]")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#31413d]">{chat.title || "New conversation"}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--muted)]">{chat.documentCount} {chat.documentCount === 1 ? "document" : "documents"}</span>
                </span>
                <span className="self-start pt-0.5 text-[10px] text-[#8b9894]">{formatUpdatedAt(chat.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </nav>
      <div className="border-t px-4 py-3 text-[11px] leading-4 text-[var(--muted)]">Answers cite retrieved passages — always inspect important claims.</div>
    </aside>
  );

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#173f39] text-white"><ScanText aria-hidden="true" className="size-5" /></span>
          <p className="mt-4 text-sm text-[var(--muted)]">Opening your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--background)]">
      <div className={clsx("h-full", isSidebarMinimized ? "hidden" : "hidden lg:block")}>{sidebar}</div>
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 cursor-default bg-[#12201d]/35 backdrop-blur-[1px]" onClick={() => setMobileMenuOpen(false)} aria-label="Close conversations" />
          <div className="relative h-full w-[286px] shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      {isLoadingChat ? (
        <div className="flex min-w-0 flex-1 items-center justify-center bg-white">
          <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><RefreshCw aria-hidden="true" className="size-4 animate-spin" /> Loading conversation…</p>
        </div>
      ) : activeChat ? (
        <ChatConversation
          key={activeChat.id}
          chat={activeChat}
          uploadState={uploadState}
          onUpload={uploadDocument}
          onMenu={() => setMobileMenuOpen(true)}
          onConversationChanged={() => void loadChats()}
          isSidebarMinimized={isSidebarMinimized}
          onToggleSidebar={toggleSidebar}
        />
      ) : (
        <main className="relative flex min-w-0 flex-1 items-center justify-center bg-white px-6">
          <button type="button" onClick={() => setMobileMenuOpen(true)} className="absolute left-3 top-3 flex size-11 items-center justify-center rounded-xl border text-[var(--muted)] focus-visible:outline-2 lg:hidden" aria-label="Open conversations">
            <MessageSquareText aria-hidden="true" className="size-5" />
          </button>
          {isSidebarMinimized ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="absolute left-3 top-3 hidden size-11 items-center justify-center rounded-xl border bg-white text-[var(--muted)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-2 lg:flex"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen aria-hidden="true" className="size-5" />
            </button>
          ) : null}
          <div className="max-w-md text-center">
            {appError ? (
              <>
                <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]"><AlertCircle aria-hidden="true" className="size-6" /></span>
                <h1 className="mt-5 text-xl font-semibold text-[#20302c]">Workspace unavailable</h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{appError}</p>
                <button type="button" onClick={() => void initialize()} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold text-[#31413d] hover:bg-[var(--surface-subtle)] focus-visible:outline-2"><RefreshCw aria-hidden="true" className="size-4" />Try again</button>
              </>
            ) : (
              <>
                <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><FileText aria-hidden="true" className="size-7" /></span>
                <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-[#20302c]">Chat with your documents</h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Start a conversation, add a file, and get answers backed by expandable source evidence.</p>
                <button type="button" onClick={() => void createNewChat()} disabled={isCreating} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"><Plus aria-hidden="true" className="size-4" />{isCreating ? "Starting…" : "Start a conversation"}</button>
              </>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
