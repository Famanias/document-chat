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
