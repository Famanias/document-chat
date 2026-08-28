"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  FilePlus2,
  FileText,
  Hourglass,
  Paperclip,
  Plus,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { Message } from "@/components/chat/message";
import type { ChatDetail, ChatMessage } from "@/lib/chat/types";

export type GuestClientLimits = Readonly<{
  maxUploadBytes: number;
  maxMessageCharacters: number;
}>;

export type UploadState =
  | { status: "idle" }
  | { status: "uploading"; filename: string }
  | { status: "error"; message: string };

type Props = {
  chat: ChatDetail;
  limits: GuestClientLimits;
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
  onConversationChanged: () => void;
  onResetConversation?: () => Promise<void>;
  onEndSession?: () => Promise<void>;
  mode?: "guest" | "member";
  user?: { id: string; email: string } | null;
  onOpenAuth?: () => void;
  onSignOut?: () => Promise<void>;
};

const suggestions = [
  "Summarize the key points.",
  "What are the main conclusions?",
  "Which details deserve closer attention?",
];

function documentMeta(pageCount: number | null, chunkCount: number) {
  const parts = [];
  if (pageCount) parts.push(`${pageCount} ${pageCount === 1 ? "page" : "pages"}`);
  parts.push(`${chunkCount} ${chunkCount === 1 ? "passage" : "passages"}`);
  return parts.join(" · ");
}

function uploadLimitLabel(maxUploadBytes: number) {
  if (maxUploadBytes < 1024 * 1024) return `${Math.ceil(maxUploadBytes / 1024)} KB`;
  const megabytes = maxUploadBytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

export function ChatConversation({
  chat,
  limits,
  uploadState,
  onUpload,
  onConversationChanged,
  onResetConversation,
  onEndSession,
  mode = "guest",
  user,
  onOpenAuth,
  onSignOut,
}: Props) {
  const [input, setInput] = useState("");
  const [dismissedError, setDismissedError] = useState(false);
  const [sendLocked, setSendLocked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendLockRef = useRef(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (!response.ok) {
            const body = (await response.clone().json().catch(() => null)) as
              | { error?: unknown }
              | null;
            if (body && typeof body.error === "string") throw new Error(body.error);
          }
          return response;
        },
        prepareSendMessagesRequest({ messages, id, trigger }) {
          return {
            body: {
              id,
              message: messages.at(-1),
              retry: trigger === "regenerate-message",
            },
          };
        },
      }),
    [],
  );
  const { messages, sendMessage, status, error, stop, regenerate } = useChat<ChatMessage>({
    id: chat.id,
    messages: chat.messages,
    transport,
    onFinish: onConversationChanged,
    onError: () => setDismissedError(false),
  });

  const hasDocument = chat.documents.some((document) => document.status === "ready");
  const isGenerating = status === "submitted" || status === "streaming" || sendLocked;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || !hasDocument || isGenerating || sendLockRef.current) return;
    sendLockRef.current = true;
    setSendLocked(true);
    setDismissedError(false);
    void sendMessage({ text }).finally(() => {
      sendLockRef.current = false;
      setSendLocked(false);
    });
    setInput("");
  };

  const retryLastQuestion = () => {
    if (isGenerating || sendLockRef.current) return;
    sendLockRef.current = true;
    setSendLocked(true);
    setDismissedError(false);
    void regenerate().finally(() => {
      sendLockRef.current = false;
      setSendLocked(false);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-dvh min-w-0 flex-1 flex-col bg-[var(--surface)]">
      <a href="#chat-content" className="sr-only z-50 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[var(--primary)] focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:outline-2">
        Skip to chat
      </a>
      <header className="flex min-h-[calc(4rem+env(safe-area-inset-top))] items-center gap-3 border-b px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#173f39] text-white">
          <FileText aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-[#20302c]">
            {chat.title || "New conversation"}
          </h1>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {chat.documents.length > 0
              ? `${chat.documents.length} ${chat.documents.length === 1 ? "document" : "documents"} indexed`
              : "No document attached"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onResetConversation ? (
            <button
              type="button"
              onClick={() => void onResetConversation()}
              title={mode === "member" ? "Start a new conversation" : "Start a fresh temporary conversation"}
              aria-label={mode === "member" ? "New conversation" : "New temporary conversation"}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-xs font-medium text-[#31413d] hover:bg-[var(--surface-subtle)] focus-visible:outline-2"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              <span className="hidden sm:inline">New conversation</span>
            </button>
          ) : null}
          {mode !== "member" && onEndSession ? (
            <button
              type="button"
              onClick={() => void onEndSession()}
              title="Delete temporary session"
              aria-label="End temporary session"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#f1c0ba] bg-white px-2.5 py-1 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)] focus-visible:outline-2"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              <span className="hidden sm:inline">End session</span>
            </button>
          ) : null}
          {mode === "member" && user ? (
            <div className="flex items-center gap-2">
              <span
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c9ddd8] bg-[#f2f8f6] px-3 py-1.5 text-xs font-semibold text-[#315e56]"
              >
                <span>{user.email}</span>
              </span>
              {onSignOut ? (
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  title="Sign out of your account"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-xs font-medium text-[#31413d] hover:bg-[var(--surface-subtle)] focus-visible:outline-2"
                >
                  <span>Sign out</span>
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c9ddd8] bg-[#f2f8f6] px-3 py-1.5 text-xs font-semibold text-[#315e56] hover:bg-[#e4f1ed] transition-colors focus-visible:outline-2 cursor-pointer"
              aria-label="Temporary conversation"
            >
              <Hourglass aria-hidden="true" className="size-3.5" />
              <span>Temporary — sign in to save.</span>
            </button>
          )}
        </div>
      </header>

      {chat.documents.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto border-b bg-[#fbfcfc] px-4 py-2.5 sm:px-6" aria-label="Attached documents">
          {chat.documents.map((document) => (
            <div key={document.id} className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg border bg-white px-3 py-2">
              <FileText aria-hidden="true" className="size-4 shrink-0 text-[var(--primary)]" />
              <span className="max-w-44 truncate text-xs font-medium text-[#31413d]">{document.filename}</span>
              <span className="text-[11px] text-[var(--muted)]">{documentMeta(document.pageCount, document.chunkCount)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <main id="chat-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-8 sm:px-8 sm:py-10">
          {messages.length === 0 && !hasDocument ? (
            <div className="m-auto max-w-md py-10 text-center">
              <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                <FilePlus2 aria-hidden="true" className="size-6" />
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#20302c]">Add a document to begin</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                Upload a PDF, TXT, or Markdown file. Grounded will index it and keep every answer tied to inspectable evidence.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Paperclip aria-hidden="true" className="size-4" />
                Choose a document
              </button>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Up to {uploadLimitLabel(limits.maxUploadBytes)} · PDFs up to 150 pages
              </p>
            </div>
          ) : null}

          {messages.length === 0 && hasDocument ? (
            <div className="m-auto w-full max-w-xl py-10 text-center">
              <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                <FileCheck2 aria-hidden="true" className="size-6" />
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#20302c]">Your document is ready</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Ask a focused question, or start with one of these.</p>
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="min-h-16 rounded-xl border bg-white px-3.5 py-3 text-sm leading-5 text-[#3a4945] transition-colors hover:border-[#b7d7cf] hover:bg-[#f8fbfa] focus-visible:outline-2"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.length > 0 ? (
            <div className="space-y-8 pb-4">
              {messages.map((message) => <Message key={message.id} message={message} />)}
              {status === "submitted" ? (
                <div className="flex items-center gap-3 text-sm text-[var(--muted)]" aria-label="Assistant is thinking">
                  <div className="flex size-8 items-center justify-center gap-1 rounded-full border bg-white">
                    {[0, 1, 2].map((dot) => <span key={dot} className="size-1 rounded-full bg-[var(--primary)] thinking-dot" />)}
                  </div>
                  Retrieving the best evidence…
                </div>
              ) : null}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </main>

      <div className="border-t bg-[rgba(255,255,255,0.96)] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5 sm:pt-4">
        <div className="mx-auto max-w-4xl">
          {uploadState.status === "uploading" ? (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-[#b7d7cf] bg-[var(--primary-soft)] px-3.5 py-3 text-sm text-[#245d55]">
              <span className="size-2 shrink-0 rounded-full bg-[var(--primary)] thinking-dot" />
              <span className="min-w-0 truncate"><strong>Indexing {uploadState.filename}</strong> — extracting, chunking, and embedding</span>
            </div>
          ) : null}
          {uploadState.status === "error" ? (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#f1c0ba] bg-[var(--danger-soft)] px-3.5 py-3 text-sm text-[var(--danger)]" role="alert">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{uploadState.message}</span>
            </div>
          ) : null}
          {error && !dismissedError ? (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#f1c0ba] bg-[var(--danger-soft)] px-3.5 py-3 text-sm text-[var(--danger)]" role="alert">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{error.message || "The answer could not be generated. Retry the last question."}</span>
              <button type="button" onClick={retryLastQuestion} className="min-h-11 rounded-lg px-2 text-xs font-semibold hover:bg-[#fee4e2] focus-visible:outline-2">
                Retry
              </button>
              <button type="button" onClick={() => setDismissedError(true)} aria-label="Dismiss error" className="flex size-11 items-center justify-center rounded-lg hover:bg-[#fee4e2] focus-visible:outline-2">
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          ) : null}
          <form onSubmit={submit} className="rounded-2xl border bg-white p-2 shadow-[0_8px_30px_rgba(29,56,50,0.08)] focus-within:border-[#87bdb1] focus-within:ring-2 focus-within:ring-[#d5eee8]">
            <label htmlFor="question" className="sr-only">Ask a question about the document</label>
            <textarea
              id="question"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={limits.maxMessageCharacters}
              disabled={!hasDocument || isGenerating}
              placeholder={hasDocument ? "Ask a question about your document…" : "Upload a document to ask questions"}
              className="max-h-40 min-h-14 w-full resize-none rounded-xl border-0 bg-transparent px-3 py-2.5 text-base leading-6 placeholder:text-[#8b9894] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-[15px]"
            />
            <div className="flex items-center justify-between gap-3 px-1 pb-1">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadState.status === "uploading"} className="flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50">
                <Paperclip aria-hidden="true" className="size-4" />
                Attach
              </button>
              {isGenerating ? (
                <button type="button" onClick={() => void stop()} className="flex size-11 items-center justify-center rounded-xl bg-[#20302c] text-white transition-colors hover:bg-[#31413d] focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="Stop generating">
                  <Square aria-hidden="true" className="size-3.5 fill-current" />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim() || !hasDocument} className="flex size-11 items-center justify-center rounded-xl bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-[#b8c5c1]" aria-label="Send question">
                  <Send aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>
          </form>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[var(--muted)]">
            <CheckCircle2 aria-hidden="true" className="size-3" />
            Answers are limited to retrieved document evidence
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        aria-label="Choose a document"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUpload(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
