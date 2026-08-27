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
