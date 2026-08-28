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
