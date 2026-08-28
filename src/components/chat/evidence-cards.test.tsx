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
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidenceCards } from "@/components/chat/evidence-cards";

describe("EvidenceCards", () => {
  it("renders actual citation metadata and an expandable excerpt", () => {
    render(
      <EvidenceCards
        evidence={[
          {
            id: "E1",
            filename: "policy.pdf",
            pageNumber: 4,
            section: null,
            chunkIndex: 2,
            excerpt: "Quarterly reviews are required.",
          },
        ]}
      />,
    );

    expect(screen.getByText("policy.pdf")).toBeInTheDocument();
    expect(screen.getByText("Page 4")).toBeInTheDocument();
    expect(screen.queryByText(/semantic match/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Quarterly reviews are required/)).toBeInTheDocument();
  });
});
