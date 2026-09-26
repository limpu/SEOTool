/**
 * Phase 29 — versioned, typed prompt templates. Kept centralized (rather
 * than inline string concatenation at call sites) so every prompt's wording
 * can be reviewed/changed/tested in one place, and so `promptVersion` can be
 * persisted alongside each AI result for auditability (which exact wording
 * produced this score, if the prompt is later revised).
 */

export const PAGE_ASSESSMENT_PROMPT_VERSION = "v1";
export const CONTENT_GAP_PROMPT_VERSION = "v1";

const PAGE_ASSESSMENT_SYSTEM = `You are an SEO content analyst. You read a single web page's extracted text content and headings, and assess four specific dimensions on a 0-100 scale. You have NO access to any other page, site, or the web at large — you must judge only from the text given to you. Be honest and conservative: if the content is thin or off-topic, score low. Respond with ONLY a single JSON object, no markdown, no commentary, matching exactly this shape:
{
  "answerability": { "score": number, "confidence": number, "explanation": string },
  "semanticCompleteness": { "score": number, "confidence": number, "explanation": string },
  "directAnswers": { "score": number, "confidence": number, "explanation": string },
  "answerCompleteness": { "score": number, "confidence": number, "explanation": string }
}
Where:
- answerability: does this page's content plausibly answer the likely questions a reader searching this topic would have?
- semanticCompleteness: does the body content under each heading actually address what that heading promises, rather than drifting off-topic?
- directAnswers: does the text immediately following each heading/question give a direct answer, rather than burying it in preamble?
- answerCompleteness: when the page does answer a question, is the answer complete (covers the obvious follow-ups), not just a partial answer?
"score" is 0-100. "confidence" is 0-1, your own confidence in that score given how much usable text you were given (low text volume = low confidence). "explanation" is 1-3 sentences citing something concrete from the page.`;

export function buildPageAssessmentPrompt(input: { url: string; title: string | null; headings: { level: number; text: string }[]; bodyText: string }): {
  system: string;
  prompt: string;
} {
  const headingsList = input.headings.length > 0 ? input.headings.map((h) => `H${h.level}: ${h.text}`).join("\n") : "(no headings found)";
  const truncatedBody = input.bodyText.slice(0, 8000);
  return {
    system: PAGE_ASSESSMENT_SYSTEM,
    prompt: `URL: ${input.url}\nTitle: ${input.title ?? "(none)"}\n\nHeadings:\n${headingsList}\n\nBody text (may be truncated):\n${truncatedBody}`,
  };
}

const CONTENT_GAP_SYSTEM = `You are an SEO content strategist. You are given the extracted text of two competing web pages on the same general topic: "your" page and a "competitor" page. Identify specific topics, subtopics, or questions the competitor's page covers that your page does NOT cover or covers only weakly. Do not invent facts about either page — only report gaps you can point to concrete competitor text for. Respond with ONLY a single JSON object, no markdown, no commentary, matching exactly this shape:
{
  "summary": string,
  "gaps": [ { "topic": string, "description": string, "evidence": string } ]
}
"summary" is 1-3 sentences on the overall gap picture. Each gap's "evidence" must quote or closely paraphrase the specific competitor text that shows this topic is covered there. If you find no meaningful gaps, return an empty "gaps" array and say so in "summary". Return at most 15 gaps, ordered by how significant the gap is (most significant first).`;

export function buildContentGapPrompt(input: {
  yourUrl: string;
  yourBodyText: string;
  competitorUrl: string;
  competitorBodyText: string;
}): { system: string; prompt: string } {
  return {
    system: CONTENT_GAP_SYSTEM,
    prompt: `YOUR PAGE (${input.yourUrl}):\n${input.yourBodyText.slice(0, 6000)}\n\n---\n\nCOMPETITOR PAGE (${input.competitorUrl}):\n${input.competitorBodyText.slice(0, 6000)}`,
  };
}
