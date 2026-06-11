import { groupByTheme } from "./rank.mjs";

export function buildProofPlan({
  candidates,
  recommended,
  lens,
  existingUrls = [],
}) {
  const newItems = recommended.filter((item) => !existingUrls.includes(item.sourceUrl));
  const sections = groupByTheme(recommended);

  const summary = {
    lens,
    candidateCount: candidates.length,
    recommendedCount: recommended.length,
    newCount: newItems.length,
    existingCount: recommended.length - newItems.length,
    sections: Object.fromEntries(
      Object.entries(sections).map(([theme, items]) => [theme, items.length]),
    ),
    featured: recommended[0]
      ? {
          sourceUrl: recommended[0].sourceUrl,
          rationale: recommended[0].rationale,
          proofTypes: recommended[0].lensTags,
        }
      : null,
    items: recommended.map((item, index) => ({
      rank: index + 1,
      sourceUrl: item.sourceUrl,
      proofTypes: item.lensTags,
      rationale: item.rationale,
      scores: item.scores,
      thread: item.thread,
      textPreview: item.text.slice(0, 140),
      badge: item.badge ?? null,
    })),
    message: buildHumanMessage({
      candidates,
      recommended,
      lens,
      existingUrls,
      sections,
    }),
    requiresApproval: true,
    publish: false,
  };

  return summary;
}

function buildHumanMessage({ candidates, recommended, lens, existingUrls, sections }) {
  const lines = [];
  lines.push(`I found ${candidates.length} candidates and recommend ${recommended.length}.`);

  if (recommended[0]) {
    lines.push("");
    lines.push("Featured:");
    lines.push(
      `1. ${recommended[0].lensTags.join(" / ")} — ${recommended[0].rationale}`,
    );
  }

  if (lens === "theme_clusters") {
    lines.push("");
    lines.push("Sections:");
    for (const [theme, count] of Object.entries(
      Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.length])),
    )) {
      lines.push(`- ${capitalize(theme)}: ${count} cards`);
    }
    lines.push("");
    lines.push("I would lead with Authority, then Demand, then Recent momentum.");
  } else if (Object.keys(sections).length) {
    lines.push("");
    lines.push("Sections:");
    for (const [theme, items] of Object.entries(sections)) {
      lines.push(`- ${capitalize(theme)}: ${items.length} cards`);
    }
  }

  const netNew = recommended.filter((item) => !existingUrls.includes(item.sourceUrl)).length;
  if (existingUrls.length && netNew === 0) {
    lines.push("");
    lines.push("No new URLs to import; existing cards already cover these picks.");
  } else if (lens === "maintain" && netNew > 0) {
    lines.push("");
    lines.push(`I found ${netNew} new candidate${netNew === 1 ? "" : "s"} since last run.`);
    lines.push("Approve before I import or reorder anything.");
  } else {
    lines.push("");
    lines.push("I can import these to Ikiro now. Approve before I write.");
  }

  return lines.join("\n");
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
