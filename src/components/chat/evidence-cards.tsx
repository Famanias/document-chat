import { ChevronDown, FileText } from "lucide-react";

type EvidenceCard = {
  id: string;
  filename: string;
  pageNumber: number | null;
  section: string | null;
  chunkIndex: number;
  excerpt: string;
  similarity: number;
};

function locationLabel(evidence: EvidenceCard) {
  if (evidence.pageNumber) return `Page ${evidence.pageNumber}`;
  if (evidence.section) return evidence.section;
  return `Passage ${evidence.chunkIndex + 1}`;
}

export function EvidenceCards({ evidence }: { evidence: EvidenceCard[] }) {
  if (evidence.length === 0) return null;

  return (
    <section className="mt-5" aria-label="Supporting evidence">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">
          Evidence used
        </h3>
        <span className="text-xs text-[var(--muted)]">
          {evidence.length} {evidence.length === 1 ? "source" : "sources"}
        </span>
      </div>
      <div className="space-y-2">
        {evidence.map((item) => {
          const relevance = Math.round(Math.max(0, Math.min(1, item.similarity)) * 100);
          return (
            <details
              key={item.id}
              className="group overflow-hidden rounded-xl border bg-[var(--surface)] transition-colors open:border-[#b7d7cf]"
            >
              <summary className="flex min-h-12 list-none items-center gap-3 px-3.5 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary-strong)]">
                  {item.id}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium text-[#23312e]">
                    <FileText aria-hidden="true" className="size-3.5 shrink-0 text-[var(--muted)]" />
                    <span className="truncate">{item.filename}</span>
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">
                    {locationLabel(item)} · {relevance}% semantic match
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[var(--muted)] transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="border-t bg-[#fbfcfc] px-4 py-3.5">
                <p className="text-sm leading-6 text-[#42514d]">“{item.excerpt}”</p>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
