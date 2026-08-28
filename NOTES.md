# World Notes

## Context & Domain
- **Project**: Document Chat (Next.js 16, React 19, TypeScript, PostgreSQL via Neon Serverless, pgvector, OpenRouter AI models).
- **Primary Loop**: Bug Fix & UI Quality Loop (`workflows/bug-fix-and-ui-quality.md`).
- **Operating Model**: Fully autonomous — end-to-end diagnosis, patch application, regression verification (`vitest`, `eslint`, `next build`), and merge/commit upon green gate.

## Key Terminology
- **Auth Modal**: Lightweight dialog attached to `"Temporary — sign in to save."` allowing guest claiming via `/api/auth/signin` and `/api/auth/signup`.
- **Session Lifecycle**: Differentiating guest `DELETE /api/chats?action=reset` from member `POST /api/chats`, and showing clear confirmation on `endSession`.
- **Chat Tool-Calling**: Ensuring the active chat model natively supports `showEvidence` tool invocation (`google/gemini-2.5-flash` instead of untargeted `openrouter/free`).
