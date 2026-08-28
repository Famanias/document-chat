import "server-only";

import { db } from "@/lib/db";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export async function deleteWorkspace(workspace: WorkspaceContext) {
  const [rows] = (await db().transaction((transaction) => [
    transaction`
      DELETE FROM workspaces
      WHERE id = ${workspace.workspaceId}
      RETURNING id
    `,
  ])) as unknown as [Array<{ id: string }>];

  return rows.length === 1;
}
