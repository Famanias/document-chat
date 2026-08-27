import "server-only";

export type WorkspaceContext = Readonly<{
  workspaceId: string;
}>;

export const PRE_AUTH_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

const preAuthWorkspace = Object.freeze<WorkspaceContext>({
  workspaceId: PRE_AUTH_WORKSPACE_ID,
});

/**
 * Temporary identity adapter for the existing unauthenticated demo.
 * Guest and member identity tickets can replace this resolver without changing
 * the workspace-aware persistence interfaces downstream.
 */
export async function resolveWorkspace(): Promise<WorkspaceContext> {
  return preAuthWorkspace;
}
