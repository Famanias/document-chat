import { describe, expect, it } from "vitest";

import {
  CHUNK_OVERLAP_CHARACTERS,
  CHUNK_TARGET_CHARACTERS,
  chunkSegments,
} from "@/lib/documents/chunk";

describe("chunkSegments", () => {
  it("keeps source metadata attached and adds bounded overlap", () => {
    const content = Array.from({ length: 900 }, (_, index) => `Sentence ${index}.`).join(" ");
    const chunks = chunkSegments([
      { content, pageNumber: 7, section: "Findings" },
    ]);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.pageNumber === 7)).toBe(true);
    expect(chunks.every((chunk) => chunk.section === "Findings")).toBe(true);
    expect(chunks.every((chunk) => chunk.content.length <= CHUNK_TARGET_CHARACTERS + 1)).toBe(true);

    const tail = chunks[0].content.slice(-CHUNK_OVERLAP_CHARACTERS / 2);
    expect(chunks[1].content).toContain(tail.trim());
  });

  it("never merges separate pages", () => {
    const chunks = chunkSegments([
      { content: "Page one fact.", pageNumber: 1, section: null },
      { content: "Page two fact.", pageNumber: 2, section: null },
    ]);

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.pageNumber)).toEqual([1, 2]);
  });

  it("splits dense formatted text into chunks respecting target character limit", () => {
    const lines = [
      "whatsapp integration",
      "need to communicate with customers,",
      "check invoice, check bookings, etc.",
      "we wanted to have a limited dashboard",
      "we might remove a lot of elements from the dashboard",
      "need to think what to include in the dashboard",
      "see the panel in action, <--- change this",
      "see how the AI bot will respond to the DMs.",
      "IN THE SEE THE PANEL ACTION.",
      "already sent the thingy. dont respond where users have to answer again.",
      "REPLIES ONLY A SOLUTION.",
      "MAKE IT STRONGER, NOT CONVINCING, EVERY RESPONSE NEEDS TO WIN THE INFLUENCER OVER.",
      "Now, put myself in the shoes of the influencers",
      "In the forms section",
      "Get your Thousands of DMs attended to immediately.",
      "IN A VIDEO PRESENTATION, SHOULD BE HOW THE DASHBOARD WORKS.",
      "GOTTA LOOK THROUGH YOUTUBE ON HOW TO HANDLE DMs,",
      "find yt videos, send to arly for reference",
      "SMART FILTER MEANS ACTIVELY BLOCKING MESSAGES IN THE DMs",
      "PREVIEW FEATURES SHOULD BE AN IMAGE CAROUSEL",
      "AI LEAD CAPTURE FORMS:",
      "NEED TO BE THE ACTUAL DASHBOARD.",
      "AUTOMATED AI CHAT:",
      "SECOND NEED TO BE A VIDEO OF AI CHAT",
      "CHECK THE RECURRING PAYMENTS. NEED BETTER PRICING EX. YEARLY IS CHEAPER",
      "NEED QUARTERLY AND ANNUAL PRICING.",
      "PROVEN RESULTS NEED TO BE REMOVED",
      "DOUBLE CHECK THE FAQs",
      "KNOWLEDGE BASE FOR FAQs in GHL, then rebrand it into WIBIZ",
      "9. Video First Approaches",
      "Mandatory Additions:",
      "✔ Intro Video: How the dashboard works",
      "✔ Use-Case Clips: Auto-reply walkthroughs",
      "✔ Success Stories: Influencer testimonials",
      "Video Presentation",
      "Purpose: Explain how the dashboard works",
      "Not a promo but a walkthrough",
      "Main video content:",
      "Intro Video: How the dashboard works",
      "Use-Case Clips: Auto-reply walkthroughs",
      "Task for John:",
      "Look up YouTube videos on how creators handle DMs",
      "Compile references then send to Arly",
    ];
    const text = lines.join("\n\n");
    const chunks = chunkSegments([{ content: text, pageNumber: 1, section: "Roadmap" }]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARACTERS + 1);
    }
  });
});
