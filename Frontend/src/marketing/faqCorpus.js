/** Deduped public FAQ drawn from the home, solution, and technology pages. */
export function faqCorpus(messages) {
  const groups = [
    messages?.home?.faq,
    messages?.solutions?.egypt?.faq,
    messages?.solutions?.whatsapp?.faq,
    messages?.solutions?.multiBranch?.faq,
    messages?.technology?.faq,
  ];
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      if (!item?.q || seen.has(item.q)) continue;
      seen.add(item.q);
      out.push(item);
    }
  }
  return out;
}
