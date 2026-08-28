/**
 * Models wrap JSON in prose and fences no matter how firmly the prompt asks
 * them not to. Every parse of model output goes through here so that a
 * malformed response degrades to "nothing proposed" rather than throwing
 * somewhere deep in the pipeline.
 */
export function parseJsonArrayFromModel(text: string): unknown[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();

  // Fall back to the outermost bracketed span if there is still prose around it.
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];

  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
