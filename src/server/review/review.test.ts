import { describe, expect, test } from "bun:test";
import {
  createHarness,
  criterionRows,
  OWNER,
  REPO,
} from "./testing/harness";
import {
  citation,
  criterionProposal,
  DIFF,
  extractScript,
  findingProposal,
  GOOD_CITATION,
  ISSUE_142_BODY,
  ISSUE_143_BODY,
  produceScript,
  RATE_LIMIT_FILE,
  RATE_LIMIT_PATH,
  RETRY_AFTER_CITATION,
} from "./testing/fixtures";
import type { FakeGitHubClient } from "./testing/fakeGitHub";

/**
 * Every test here enters at the webhook and asserts on what left the system:
 * the markdown of the comment posted or edited on the fake GitHub client, the
 * conclusion of the Check Run, and the HTTP status returned to the caller.
 *
 * Nothing asserts on prompt text, on a Producer's intermediate proposal, on
 * call counts of internal functions, or on database rows. Those are
 * implementation and will change.
 */

const CRITERIA_142 = [
  "Requests limited to 100/min per API key",
  "Returns 429 with Retry-After",
];

function seedRepository(github: FakeGitHubClient) {
  github.diff = DIFF;
  github.files.set(RATE_LIMIT_PATH, RATE_LIMIT_FILE);
  github.issues.set(`${OWNER}/${REPO}#142`, {
    number: 142,
    title: "Add rate limiting to the public API",
    body: ISSUE_142_BODY,
  });
}

/** Both criteria satisfied, both grounded. The happy path for most tests. */
const BOTH_SATISFIED = produceScript([
  criterionProposal("142:0", "satisfied", GOOD_CITATION),
  criterionProposal("142:1", "satisfied", RETRY_AFTER_CITATION),
]);

describe("a pull request linking an issue", () => {
  test("produces a comment whose rows match the acceptance criteria", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [BOTH_SATISFIED],
      },
    });
    seedRepository(harness.github);

    const response = await harness.deliverPullRequest();
    expect(response.status).toBe(202);

    const body = harness.github.soleCommentBody;
    expect(body).toContain(
      "**Reviewing against #142** — Add rate limiting to the public API",
    );

    const rows = criterionRows(body);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain(CRITERIA_142[0]);
    expect(rows[0]).toContain("✅");
    expect(rows[1]).toContain(CRITERIA_142[1]);
    expect(body).toContain(`\`${RATE_LIMIT_PATH}:3\``);
  });

  test("is reported in one comment that is revised, not a second comment", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [BOTH_SATISFIED, BOTH_SATISFIED],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest({ headSha: "a".repeat(40) });
    await harness.deliverPullRequest({
      action: "synchronize",
      headSha: "b".repeat(40),
    });

    expect(harness.github.created).toHaveLength(1);
    expect(harness.github.edits.length).toBeGreaterThanOrEqual(1);
    expect(harness.github.soleCommentBody).toContain("Reviewed 2 times");
  });

  test("annotates a criterion that became satisfied since the last push", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [
          produceScript([
            criterionProposal("142:0", "satisfied", GOOD_CITATION),
            criterionProposal("142:1", "unsatisfied", {
              missing: "configureRetryAfter",
              statement: "No Retry-After header is set anywhere.",
            }),
          ]),
          BOTH_SATISFIED,
        ],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest({ headSha: "a".repeat(40) });
    expect(harness.github.soleCommentBody).toContain("⚠️");

    await harness.deliverPullRequest({
      action: "synchronize",
      headSha: "b".repeat(40),
    });

    const body = harness.github.soleCommentBody;
    expect(body).toContain("*satisfied since last push*");
    // The criterion that was already satisfied is not annotated.
    expect(criterionRows(body)[0]).not.toContain("since last push");
  });

  test("is judged against every issue it links, grouped by issue", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [
          extractScript(CRITERIA_142),
          extractScript(["Emit a metric when a request is rejected"]),
        ],
        produce: [
          produceScript([
            criterionProposal("142:0", "satisfied", GOOD_CITATION),
            criterionProposal("142:1", "satisfied", RETRY_AFTER_CITATION),
            criterionProposal("143:0", "unclear", {
              missing: "emitMetric",
              statement: "Cannot determine — no metrics client is in scope.",
            }),
          ]),
        ],
      },
    });
    seedRepository(harness.github);
    harness.github.issues.set(`${OWNER}/${REPO}#143`, {
      number: 143,
      title: "Observe rate limit rejections",
      body: ISSUE_143_BODY,
    });

    await harness.deliverPullRequest({ body: "Closes #142\nCloses #143" });

    const body = harness.github.soleCommentBody;
    expect(body).toContain("**Reviewing against #142**");
    expect(body).toContain("**Reviewing against #143**");
    expect(criterionRows(body)).toHaveLength(3);
    expect(body).toContain("❔");
  });

  test("re-extracts criteria only when the issue body has changed", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [
          extractScript(CRITERIA_142),
          extractScript([...CRITERIA_142, "Limits are configurable per key"]),
        ],
        produce: [
          BOTH_SATISFIED,
          BOTH_SATISFIED,
          // Only reachable if the third criterion was extracted: the Producer
          // drops verdicts on criteria that were never put to it.
          produceScript([
            criterionProposal("142:0", "satisfied", GOOD_CITATION),
            criterionProposal("142:1", "satisfied", RETRY_AFTER_CITATION),
            criterionProposal("142:2", "unsatisfied", {
              missing: "rateLimitOptions",
              statement: "The limit is hardcoded; there is no configuration path.",
            }),
          ]),
        ],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest({ headSha: "a".repeat(40) });
    expect(criterionRows(harness.github.soleCommentBody)).toHaveLength(2);

    // An unedited issue is not re-extracted: had it been, the second scripted
    // extraction would have been consumed here and the third delivery would
    // exhaust the script.
    await harness.deliverPullRequest({
      action: "synchronize",
      headSha: "b".repeat(40),
    });
    expect(criterionRows(harness.github.soleCommentBody)).toHaveLength(2);

    harness.github.issues.set(`${OWNER}/${REPO}#142`, {
      number: 142,
      title: "Add rate limiting to the public API",
      body: ISSUE_142_BODY + "\n- Limits must be configurable per key.",
    });

    await harness.deliverPullRequest({
      action: "synchronize",
      headSha: "c".repeat(40),
    });

    const body = harness.github.soleCommentBody;
    expect(body).toContain("Limits are configurable per key");
    expect(criterionRows(body)).toHaveLength(3);
    expect(body).toContain("⚠️");
  });
});

describe("the verifier", () => {
  test("discards a proposal whose cited evidence cannot be located", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [
          produceScript([
            criterionProposal("142:0", "satisfied", {
              file: "src/does/not/exist.ts",
              startLine: 1,
              endLine: 2,
              quote: "whatever",
            }),
            criterionProposal(
              "142:1",
              "unsatisfied",
              // The file exists, but says nothing of the kind at those lines.
              citation(1, 2, "the limit is enforced per API key"),
            ),
          ]),
        ],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest();

    const body = harness.github.soleCommentBody;
    expect(criterionRows(body)).toHaveLength(0);
    expect(body).not.toContain(CRITERIA_142[0]!);
    expect(body).not.toContain("the limit is enforced per API key");
  });

  test("discards an absence claim that the diff refutes", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [
          produceScript([
            criterionProposal("142:0", "satisfied", GOOD_CITATION),
            // "Retry-After" is right there in the diff, so this accusation is
            // refuted rather than reported. A false "unsatisfied" costs more
            // trust than a miss.
            criterionProposal("142:1", "unsatisfied", {
              missing: "Retry-After",
              statement: "No Retry-After header is ever set.",
            }),
          ]),
        ],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest();

    const body = harness.github.soleCommentBody;
    expect(body).not.toContain("No Retry-After header is ever set");
    expect(criterionRows(body)).toHaveLength(1);
  });

  test("keeps a verdict whose cited source merely contains stylistic words", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [
          produceScript([
            // The quote is source the Producer copied out of the file. Real
            // code is full of words like `name` and `format`; quoting it must
            // not be mistaken for the Producer making a naming remark.
            criterionProposal(
              "142:0",
              "satisfied",
              citation(3, 3, "limits keyed on apiKey.name"),
            ),
            criterionProposal(
              "142:1",
              "satisfied",
              citation(7, 7, "res.format({ retryAfter })"),
            ),
          ]),
        ],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest();

    expect(criterionRows(harness.github.soleCommentBody)).toHaveLength(2);
  });

  test("discards a stylistic proposal regardless of its evidence", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [
          produceScript([
            criterionProposal("142:0", "satisfied", GOOD_CITATION),
            criterionProposal("142:1", "satisfied", RETRY_AFTER_CITATION),
            findingProposal(
              "Consider renaming LIMIT to MAX_REQUESTS_PER_MINUTE for readability.",
              GOOD_CITATION,
            ),
          ]),
        ],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest();

    const body = harness.github.soleCommentBody;
    expect(body).not.toContain("Also noticed");
    expect(body).not.toContain("renaming");
    expect(criterionRows(body)).toHaveLength(2);
  });

  test("truncates to ten items so the reviewer has to prioritise", async () => {
    const many = Array.from({ length: 12 }, (_, i) => `Criterion number ${i}`);
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(many)],
        produce: [
          produceScript(
            many.map((_, i) =>
              criterionProposal(`142:${i}`, "satisfied", GOOD_CITATION),
            ),
          ),
        ],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest();

    expect(criterionRows(harness.github.soleCommentBody)).toHaveLength(10);
  });
});

describe("states that are reported instead of reviewed", () => {
  test("an unlinked pull request is declined exactly once", async () => {
    const harness = await createHarness({ scripts: {} });
    seedRepository(harness.github);

    await harness.deliverPullRequest({
      body: "Refactors the limiter. No issue for this one.",
      headSha: "a".repeat(40),
    });

    expect(harness.github.created).toHaveLength(1);
    expect(harness.github.soleCommentBody).toContain(
      "does not link an issue",
    );

    await harness.deliverPullRequest({
      action: "synchronize",
      body: "Refactors the limiter. No issue for this one.",
      headSha: "b".repeat(40),
    });

    // A long-running branch is not nagged on every push...
    expect(harness.github.created).toHaveLength(1);
    expect(harness.github.edits).toHaveLength(0);

    // ...but each commit still gets its own Check Run, or the second push
    // would show no check at all against its head.
    expect(harness.github.checkRuns).toHaveLength(2);
    expect(harness.github.checkRuns.map((run) => run.headSha)).toEqual([
      "a".repeat(40),
      "b".repeat(40),
    ]);
  });

  test("a pull request declined as unlinked is reviewed once its link is added", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [BOTH_SATISFIED],
      },
    });
    seedRepository(harness.github);

    // The same head commit throughout. Editing a pull request body is not a
    // subscribed action, so the only way back from a decline without pushing
    // is to reopen — and that fires against the commit that was declined.
    const sha = "a".repeat(40);

    await harness.deliverPullRequest({
      body: "Refactors the limiter. No issue for this one.",
      headSha: sha,
    });
    expect(harness.github.soleCommentBody).toContain("does not link an issue");

    await harness.deliverPullRequest({
      action: "reopened",
      body: "Closes #142",
      headSha: sha,
    });

    // A decline is not an evaluation, so it must not occupy the commit and
    // block this. Getting that wrong exits silently: no review, no comment,
    // no error, until someone happens to push again.
    const body = harness.github.soleCommentBody;
    expect(body).toContain("**Reviewing against #142**");
    expect(criterionRows(body)).toHaveLength(2);
  });

  test("an installation with no provider key is told so, and nothing is reviewed", async () => {
    const harness = await createHarness({
      hasProviderKey: false,
      scripts: {},
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest();

    const body = harness.github.soleCommentBody;
    expect(body).toContain("no model provider key configured");
    expect(criterionRows(body)).toHaveLength(0);
    // No Review Run was recorded — the Check Run says so rather than
    // reporting verdict counts.
    expect(harness.github.checkRuns[0]!.summary).toContain("No provider key");
  });

  test("an unindexed repository is told indexing is under way, then revised", async () => {
    const harness = await createHarness({
      unindexed: true,
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [BOTH_SATISFIED],
      },
    });
    seedRepository(harness.github);

    await harness.deliverPullRequest();

    // Posted immediately, so silence is not mistaken for failure...
    expect(harness.github.created).toHaveLength(1);
    expect(harness.github.created[0]!.body).toContain("Indexing this repository");

    // ...then revised in place with the review itself.
    expect(harness.github.soleCommentBody).toContain(
      "**Reviewing against #142**",
    );
    expect(criterionRows(harness.github.soleCommentBody)).toHaveLength(2);
  });

  test("a repository whose index failed to build is indexed again next push", async () => {
    const harness = await createHarness({
      unindexed: true,
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142), extractScript(CRITERIA_142)],
        produce: [BOTH_SATISFIED, BOTH_SATISFIED],
      },
    });
    seedRepository(harness.github);

    // The indexing provider is unreachable, so nothing is embedded.
    harness.index.buildsSuccessfully = false;
    await harness.deliverPullRequest();

    // The review still runs — the Codebase Index is context, not a
    // precondition — so the developer gets a report either way.
    expect(harness.github.soleCommentBody).toContain(
      "**Reviewing against #142**",
    );

    // The provider recovers before the next push.
    harness.index.buildsSuccessfully = true;
    await harness.deliverPullRequest({ headSha: "b2b2b2b2" });

    // Indexing is attempted again rather than skipped for good. A repository
    // marked indexed on a failed build would search an empty index forever.
    expect(harness.index.indexedRepositories).toHaveLength(2);
  });
});

describe("webhook ingress", () => {
  test("rejects a payload whose signature does not verify, with no side effects", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [BOTH_SATISFIED],
      },
    });
    seedRepository(harness.github);

    const response = await harness.deliver(
      "pull_request",
      {
        action: "opened",
        installation: { id: 42 },
        repository: { id: 7, name: REPO, owner: { login: OWNER } },
        pull_request: {
          number: 1,
          body: "Closes #142",
          head: { sha: "a".repeat(40) },
        },
      },
      { signature: "sha256=" + "0".repeat(64) },
    );

    expect(response.status).toBe(401);
    // Nothing left the system: no comment, no Check Run. Had the pipeline run
    // at all it would have posted one of the two.
    expect(harness.github.created).toHaveLength(0);
    expect(harness.github.edits).toHaveLength(0);
    expect(harness.github.checkRuns).toHaveLength(0);
  });

  test("a redelivered webhook for the same head commit produces no second run", async () => {
    const harness = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [BOTH_SATISFIED],
      },
    });
    seedRepository(harness.github);

    const sha = "a4f9c21".padEnd(40, "0");
    await harness.deliverPullRequest({ headSha: sha });
    await harness.deliverPullRequest({ action: "synchronize", headSha: sha });

    expect(harness.github.created).toHaveLength(1);
    expect(harness.github.edits).toHaveLength(0);
    // "Reviewed once" after two deliveries is the externally visible proof
    // that only one Review Run completed — and so that the customer's
    // provider key was charged once. (Only one `produce` response is
    // scripted, so a second Run would also exhaust the script and throw.)
    expect(harness.github.soleCommentBody).toContain("Reviewed once");
  });
});

describe("the check run", () => {
  test("is always created, and is always neutral", async () => {
    const reviewed = await createHarness({
      scripts: {
        "extract-criteria": [extractScript(CRITERIA_142)],
        produce: [BOTH_SATISFIED],
      },
    });
    seedRepository(reviewed.github);
    await reviewed.deliverPullRequest();

    const unlinked = await createHarness({ scripts: {} });
    seedRepository(unlinked.github);
    await unlinked.deliverPullRequest({ body: "No issue here." });

    const keyless = await createHarness({
      hasProviderKey: false,
      scripts: {},
    });
    seedRepository(keyless.github);
    await keyless.deliverPullRequest();

    for (const harness of [reviewed, unlinked, keyless]) {
      expect(harness.github.checkRuns).toHaveLength(1);
      expect(harness.github.checkRuns[0]!.conclusion).toBe("neutral");
      expect(harness.github.checkRuns[0]!.title).toBe("Spec adherence");
    }

    expect(reviewed.github.checkRuns[0]!.summary).toContain("2 satisfied");
  });
});
