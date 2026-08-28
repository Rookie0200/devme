/**
 * Stylistic proposals are dropped outright, regardless of how well grounded
 * they are. A reviewer that mixes "a third of the ticket is unimplemented"
 * with "consider renaming this variable" trains developers to skim past both.
 *
 * This is a deterministic classifier rather than another model call, so the
 * suppression cannot itself drift between runs.
 */

const STYLISTIC_MARKERS: RegExp[] = [
  /\bnit(pick)?\b/i,
  /\b(re)?nam(e|ing)\b/i,
  /\bstyl(e|istic)\b/i,
  /\bformat(ting)?\b/i,
  /\bindent(ation)?\b/i,
  /\bwhitespace\b/i,
  /\bprettier\b/i,
  /\beslint\b/i,
  /\breadab(le|ility)\b/i,
  /\bidiomatic\b/i,
  /\bmore concise\b/i,
  /\bcleaner\b/i,
  /\btidier\b/i,
  /\btypo\b/i,
  /\bconsider (using|extracting|renaming|moving)\b/i,
  /\b(would|might) be (nicer|better|cleaner)\b/i,
  /\bprefer(ably)?\b/i,
  /\bmagic (number|string)\b/i,
  /\bcode smell\b/i,
];

export function isStylistic(text: string): boolean {
  return STYLISTIC_MARKERS.some((marker) => marker.test(text));
}
