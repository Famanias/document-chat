# Workflow: Bug Fix & UI Quality Loop

A deterministic, fully autonomous workflow for diagnosing, patching, and verifying runtime, UI, and model integration defects in the Document Chat application.

## Trigger
- **Event**: Bug report, user defect observation, or runtime error identified in UI components, session state, or API endpoints.

## Execution Policy
- **Autonomy**: Fully autonomous — executes diagnosis, code modifications, and quality verification gates (`vitest`, `eslint`, `next build`) without intermediate pauses, committing and merging when all gates pass.

---

## Workflow Steps

### Step 1: Root Cause & Specification Analysis
1. Inspect the affected UI components, client hooks (`useChat`), API route handlers, and database interactions.
2. Formulate a 2-axis breakdown:
   - **Standards**: UI interaction dead-ends, state leaks, error reporting integrity.
   - **Spec**: Acceptance criteria for workspace isolation, guest lifecycles, member persistence, and AI model orchestration.

### Step 2: Authentication Modal & Guest Claiming Implementation
1. **Component**: Create `src/components/auth/auth-modal.tsx`.
   - In-place modal dialog with accessible tab switching between **Sign In** (`/api/auth/signin`) and **Sign Up** (`/api/auth/signup`).
   - Fields: Email, Password.
   - Submissions automatically claim the active guest conversation into the member account.
   - On success: triggers `loadConversation()`, closing modal, updating UI to member mode, and displaying the member's email badge.
2. **Trigger**: Wire the `"Temporary — sign in to save."` element in `src/components/chat/chat-conversation.tsx` as an accessible `<button>` opening `AuthModal`.

### Step 3: Session Lifecycle & Reset State Machine
1. **Guest vs Member Branching** in `src/components/chat/chat-app.tsx`:
   - **Guest 'New conversation'**: Invokes `DELETE /api/chats?action=reset`, refreshing the single guest conversation.
   - **Member 'New conversation'**: Invokes `POST /api/chats`, creating and navigating to a new conversation in the member's workspace.
   - **'End session'**: Invokes `DELETE /api/chats?action=end`, clears session storage/cookies, and renders an explicit **Session Ended** state with a *"Start New Session"* button.

### Step 4: Robust AI Streaming & Multi-Conversation Support
1. In `src/app/api/chat/route.ts`:
   - Replace strict single-conversation equality (`parsed.id !== workspace.conversationId`) with workspace ownership validation (`chatExists(workspace, parsed.id)`).
   - Implement graceful error-recovery during `streamText`: if upstream model rejects `showEvidence` tool calling, fall back to direct answer synthesis grounded in retrieved evidence.

### Step 5: Quality Gate & Automated Verification
Execute all quality checks:
```bash
npm test         # All Vitest unit and integration suites must pass
npm run lint     # Zero ESLint warnings or errors
npm run build    # Next.js production build and TypeScript check must pass
```

### Step 6: Git & Release Delivery
1. Create a dedicated feature branch: `Famanias/fix-<feature-name>`.
2. Commit with descriptive conventional commit messages.
3. Push to `origin` and open a GitHub Pull Request via `gh pr create`.
4. Merge into `master` via `gh pr merge --merge --delete-branch`.
