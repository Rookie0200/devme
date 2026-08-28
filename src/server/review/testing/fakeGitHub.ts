import type { CheckRunInput, GitHubClient, IssueRef } from "../ports";

/**
 * A GitHub client that records what was sent to it.
 *
 * Tests assert on what left the system — the markdown of the comment posted or
 * edited here, and the conclusion of the Check Run — rather than on how the
 * pipeline got there.
 */
export class FakeGitHubClient implements GitHubClient {
  /** Every comment ever created, in order. Length is the "one comment" check. */
  readonly created: Array<{ id: number; number: number; body: string }> = [];
  /** Every edit, in order. */
  readonly edits: Array<{ commentId: number; body: string }> = [];
  readonly checkRuns: CheckRunInput[] = [];

  /** Seeded by the test. Key: `owner/repo#number`. */
  readonly issues = new Map<string, IssueRef>();
  /** Seeded by the test. Key: file path. Contents are ref-independent. */
  readonly files = new Map<string, string>();
  diff = "";

  private nextCommentId = 1000;
  private readonly bodies = new Map<number, string>();

  /** The current text of a comment, after any edits. */
  bodyOf(commentId: number): string {
    return this.bodies.get(commentId) ?? "";
  }

  /**
   * The current text of the Review's single comment. Throws if the pipeline
   * posted more than one, which is itself the failure a test is looking for.
   */
  get soleCommentBody(): string {
    if (this.created.length !== 1) {
      throw new Error(
        `expected exactly one comment, found ${this.created.length}`,
      );
    }
    return this.bodyOf(this.created[0]!.id);
  }

  getIssue(input: {
    owner: string;
    repo: string;
    number: number;
  }): Promise<IssueRef | null> {
    const key = `${input.owner}/${input.repo}#${input.number}`;
    return Promise.resolve(this.issues.get(key) ?? null);
  }

  getPullRequestDiff(): Promise<string> {
    return Promise.resolve(this.diff);
  }

  getFileAtRef(input: { path: string }): Promise<string | null> {
    return Promise.resolve(this.files.get(input.path) ?? null);
  }

  createComment(input: {
    number: number;
    body: string;
  }): Promise<{ id: number }> {
    const id = this.nextCommentId++;
    this.created.push({ id, number: input.number, body: input.body });
    this.bodies.set(id, input.body);
    return Promise.resolve({ id });
  }

  updateComment(input: { commentId: number; body: string }): Promise<void> {
    this.edits.push({ commentId: input.commentId, body: input.body });
    this.bodies.set(input.commentId, input.body);
    return Promise.resolve();
  }

  createCheckRun(input: CheckRunInput): Promise<void> {
    this.checkRuns.push(input);
    return Promise.resolve();
  }
}
