# A decline is a Review Run

A Review Run was defined as "one *evaluation* of a Review against one specific head commit," and the pipeline honoured that definition literally: the two exits that decline to evaluate — a pull request that links no Issue, and an Installation with no Provider Key — returned before any Run was created. The definition is now widened. **A Review Run is the record of one delivery's outcome against one specific head commit, and a Run may conclude without evaluating anything.**

The old definition was internally consistent and produced a system that could not explain itself. An Installation that has never had a Provider Key posts a declining comment on every pull request it sees and accumulates no rows at all, so the customer most in need of an explanation is the one with nothing to read. The comment on the pull request is the only record, which works exactly as long as someone was watching that pull request. Declining to evaluate is a thing the reviewer *did*, and a system that records only its successes cannot account for its silences.

## Consequences

- Every delivery that resolves to a Review owns exactly one Run, created before the first exit, and every exit path transitions it. A future exit path inherits a row rather than owing one.
- The unique constraint on `(reviewId, headSha)` keeps its job — stopping a redelivery from charging a Provider Key twice — but its meaning narrows to *do not evaluate the same commit twice*. A Run that only declined does not block a later attempt at that commit, which is what lets a pull request declined as Unlinked be reviewed once its link is added. Adding the link and reopening fires against the same head commit, because editing a pull request body is not a subscribed action.
- `Review.declinedAt` is gone. The fact it held is derived from the Runs, and must be read before a Run is started, since starting one supersedes the declined row that answers the question.
- A Run carries *why* it ended as it did, so a refused Provider Key is distinguishable from an unreachable provider and from a bug. That distinction is what makes it possible to tell a customer their credential has stopped working without accusing one that is merely unlucky.
- `countRuns` and the since-last-push comparison already filtered to completed Runs, so the rendered comment is unchanged. That was verified, not assumed.
- Runs now accumulate for pull requests that are never reviewed. The volume is bounded by distinct head commits per pull request, so no retention policy is introduced.
- The pull request comment remains the authoritative report. This ADR is about the record of *execution*; it says nothing about where results are read.
- **Verified live, because the suite structurally cannot see any of this.** Every column this decision adds is a database row, and the suite asserts only on what leaves the system. One pull request on a real repository produced one Review with three Runs, one per head commit, each ending differently. Opened Unlinked, it recorded `declined`/`unlinked` — a row that would not have existed at all before this change. Its description was then edited to link the Issue and the pull request closed and reopened, which fires against the *same* head commit: that same row transitioned to `completed` at a real cost, with both Acceptance Criteria satisfied and cited. **One row, not two** — the decline was superseded in place. The comment was revised rather than replaced, and its footer read "Reviewed once", confirming `countRuns` still excludes declines and the rendered report is unchanged. A deliberately invalid Provider Key, written straight to the database because `setProviderKey` refuses to store one, produced `failed`/`provider_auth` with `costUsd` null rather than zero, and stamped `lastAuthFailureAt`; saving a working key cleared it. Removing the key produced `declined`/`no_provider_key`. `Review.title` populated from the webhook payload, while Runs predating the column stayed null and the interface fell back to the pull request number.
- **A Run abandoned by a dead worker does not block either** — added by the amendment below, and belonging with the two statuses above rather than apart from them.
- **The dead end this decision had to avoid was not where the design predicted.** The specification blamed the unique constraint on `(reviewId, headSha)`, and that constraint was innocent. The real cause was already in production: the queue passed the head commit as a BullMQ job id, so the first delivery claimed a commit for as long as the completed job was retained, and a reopen was discarded before reaching the pipeline at all. Recording declines would have made a second, independent barrier at the same point. It was found by a test at the webhook seam asserting on the comment that left the system — not by reasoning about the schema, and not by any test that could have asserted on rows.

## Amendment: a Run whose worker died does not block its own recovery

The rule above lists the statuses that must not block a new attempt at a head commit — `failed`,
because a transient error must not become permanent, and `declined`, because the fix for an Unlinked
pull request fires at the same commit. It omitted the case where the worker dies mid-Run, which
leaves the row at `running`. Nothing moves it afterwards, so the commit was claimed forever: the
queue's own retry, a redelivery from the GitHub App settings, and a reopen were all discarded before
any work began, and only a fresh commit escaped — which sidesteps the stuck Run rather than clearing
it. No error was raised anywhere, and from the pull request author's side the reviewer simply never
responded.

That case was not excluded on purpose; it was not imagined. The comment on the guard already argued,
correctly and at length, why `failed` and `declined` must not block, and both arguments apply to an
abandoned Run verbatim. **A guard's comment sounding exhaustive is not evidence that it is.**

**A `running` Run is now taken over by the next delivery at that commit, on either of two signals**,
the stronger first:

1. **Evidence** — the queue reports that it has handed this job out before and the previous attempt
   never finished. That is not an inference; it is the reason the job came back.
2. **Elapsed time** — failing that, the Run has been running past the threshold the Review Run feed
   already uses to call a Run interrupted. This covers jobs that were lost rather than re-delivered:
   Redis flushed, a queue drained during a deploy, a human redelivering weeks later.

### Consequences

- **The threshold is a shared predicate, not a shared constant.** The Review Store and the feed ask
  the same function, so "interrupted" on the screen means exactly what the pipeline acts on. Two call
  sites comparing against one number are one refactor away from disagreeing about the comparison, and
  the disagreement would be invisible in both places.
- **Elapsed time alone would not have worked**, which an earlier form of this design assumed it
  would. A stalled job returns in about a minute, when the Run is seconds old, so any threshold long
  enough to be safe is far too long to catch the case it exists for — and any threshold short enough
  to catch it would evict Runs that are alive, mid-Producer, after they had already been paid for.
- **`attemptsStarted`, not `attemptsMade`, is the signal BullMQ actually offers.** `attemptsMade`
  counts attempts that failed *loudly*. A killed worker never reaches the failure path: the
  stalled-job recovery increments a separate stalled counter and re-queues, leaving `attemptsMade` at
  zero. Reading it would have missed every case this amendment is about and caught only the retries
  that were never stuck. This was found by reading BullMQ's Lua, not by reasoning about its API.
- **The row is reused, and `completed` is still absolute.** One Run per head commit however many
  attempts it took; an evaluation that finished is never re-run, which is the duplicate-charge guard
  intact. No attempts counter was added: a crash loop is already bounded by the queue's three
  attempts and already visible in worker logs, and the outcome columns are untested by construction.
- **We may charge a Provider Key twice and can only ever show one charge.** Cost is accumulated in
  memory and written once, so a worker killed after the Producer billed recorded nothing; the
  takeover re-runs, charges again, and the surviving row shows only the second charge. Written down
  here rather than left to be discovered, because a customer should not be the first to notice it.
  The alternative — writing cost incrementally — adds writes inside every review to buy partial
  accuracy on a rare path, and a partially-written cost is worse than an honest null: it renders as a
  number, and readers trust numbers.
- **Split-brain is accepted, and has a designated first response.** A queue can be wrong about a dead
  worker, and then two workers run one Run. It is bounded by the stalled-attempt limit, the comment
  is written by marker and converges rather than duplicating, and nothing in the pipeline blocks the
  event loop, so lock renewal keeps running. If it is ever observed the answer is to raise the lock
  duration — not to add an attempt token to the Run row, which would be a new column, a new write,
  and a new way to refuse a legitimate attempt at the end of a review it had already paid for.
- **No sweeper, no heartbeat, no re-run button.** A sweeper heals on a clock whether or not anyone is
  waiting and fails silently when it stops; a heartbeat is the refinement to reach for only if a
  fixed threshold proves too blunt; a re-run control is a new mutation, a new authorization surface,
  and a button that spends the customer's credential on a click, duplicating one GitHub already
  ships.
- **Nothing needed to be built to make retries arrive.** BullMQ was already configured for three
  attempts with exponential backoff and already re-delivers stalled jobs. They arrived today and were
  thrown away by one condition. The change is a decision, not a mechanism.
- **This is the second instance of one failure shape**: a durable row claiming a commit forever, with
  no error anywhere, presenting to everyone as the reviewer having nothing to say. The first was the
  queue's job-id de-duplication, removed above. Both were invisible to reasoning about the schema and
  visible immediately from the webhook seam. If a third appears, look wherever a durable row answers
  "has this already been handled".
