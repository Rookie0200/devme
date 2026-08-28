import { createHash } from "node:crypto";
import type { IssueRef, ModelProvider, ReviewStore } from "../ports";
import type { Criterion } from "../types";
import { parseJsonArrayFromModel } from "../model/parse";

/**
 * Extraction is keyed to a hash of the Issue body, so editing an Issue causes
 * re-extraction while an unedited Issue is extracted once and reused across
 * every pull request that links it.
 */
export function hashIssueBody(body: string): string {
  return createHash("sha256").update(body ?? "").digest("hex");
}

const SYSTEM = `You extract acceptance criteria from a software issue.

An acceptance criterion is a single discrete obligation the issue places on an
implementation — something that can be checked as done or not done. Split
compound sentences into separate criteria. Do not invent obligations the issue
does not state. Do not include background, motivation, or restatements of the
problem.

Respond with a JSON array of strings and nothing else.`;

/**
 * The Acceptance Criteria for an Issue, extracted once and reused.
 *
 * Criteria are persisted against the Issue rather than the Review Run, which
 * is what makes a second pull request linking the same Issue free.
 */
export async function resolveAcceptanceCriteria(input: {
  store: ReviewStore;
  model: ModelProvider;
  repositoryId: string;
  issue: IssueRef;
}): Promise<Criterion[]> {
  const { store, model, repositoryId, issue } = input;
  const issueBodyHash = hashIssueBody(issue.body);

  const cached = await store.criteriaForIssue({
    repositoryId,
    issueNumber: issue.number,
    issueBodyHash,
  });
  if (cached) return cached;

  const completion = await model.complete({
    system: SYSTEM,
    purpose: "extract-criteria",
    prompt: `Issue #${issue.number}: ${issue.title}\n\n${issue.body}`,
  });

  const criteria: Criterion[] = parseJsonArrayFromModel(completion.text)
    .filter((entry): entry is string => typeof entry === "string")
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text, index) => ({
      issueNumber: issue.number,
      issueTitle: issue.title,
      ordinal: index,
      text,
    }));

  return store.recordCriteria({
    repositoryId,
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueBodyHash,
    criteria,
  });
}
