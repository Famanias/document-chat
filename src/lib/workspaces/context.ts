import "server-only";

export type WorkspaceContext = Readonly<{
  workspaceId: string;
  conversationId: string;
}>;

export const PRE_AUTH_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Resolve the browser-session guest on the server for every data operation.
 * The raw credential never leaves the cookie boundary and client-provided IDs
 * never establish workspace ownership.
 */
export async function resolveWorkspace(): Promise<WorkspaceContext> {
  const { resolveGuestWorkspace } = await import("@/lib/workspaces/guest-session");
  return resolveGuestWorkspace();
}
