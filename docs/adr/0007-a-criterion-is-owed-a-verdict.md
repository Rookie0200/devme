# A criterion is owed a verdict; a finding is not

The Verifier capped the report at ten items, and applied that cap to Acceptance Criteria and Findings **together**, ranked against each other. The cap is now split: **Criteria are not capped at all, and the cap of five applies to Findings alone.** A report that still omits criteria states how many.

One budget shared by two things that answer different questions makes the number of Acceptance Criteria reaching the pull request depend on how many Findings the model happened to raise. Observed live on 2026-08-30 against Issue #19, which produced nine criteria: one Run reported six criteria and four findings, the next reported five and five. Three criteria went unjudged, then four — and which ones was decided by a priority ordering the reader cannot see. A spec-adherence reviewer whose central claim is "here is how this diff measures against the spec" omitted a third of the spec and said nothing about having done so. The comment looked complete because it renders what it was handed; nothing counted what was dropped.

The cap's reasoning was sound and is kept, for Findings. A report of forty items is not a report, and forcing the reviewer to rank rather than exhaustively list is the point. What was wrong is applying it to both kinds. **A criterion with no verdict is a gap in the contract the pull request is being judged against. A Finding that did not make the cut is an opinion withheld.** They are not interchangeable, and ranking them against each other treats them as if they were. How many criteria exist is the Issue author's choice; how many Findings exist is the model's.

Raising the shared cap was rejected — it moves the arbitrary line without addressing which of two incomparable things gets truncated, and ranking criteria above all findings makes Findings the thing that silently vanishes instead, which is the same defect with the victim swapped.

## Consequences

- Report length now scales with the Issue. A twenty-criterion Issue produces a twenty-row table. That is the author's decision to have written twenty criteria, and the reviewer has no business editing it down.
- `MAX_REPORTED_ITEMS` becomes `MAX_REPORTED_FINDINGS = 5`. Ten was calibrated for a shared budget and would not have bound at all on either observed Run; inheriting it for Findings alone would loosen the cap by accident. Five sits just above observed volume, so it binds on an unusually chatty Run and not otherwise.
- **The ranking machinery is gone.** `PRIORITY` and the two-phase sort existed only to decide who survived the shared cap. Criteria no longer compete, and Findings have no verdict to rank them by, so both lists now come out in Producer order — which is what the second sort restored anyway.
- **A report that omitted criteria says so**, in one line stating the count. This is the part that made the original defect dangerous: not that criteria were dropped, but that nothing said any had been.
- The count is undifferentiated. A criterion goes unjudged because the Producer never proposed on it or because the Verifier could not ground the proposal it made; the distinction is real to us and useless to a reader, whose position is the same either way. Rendering a fourth "no verdict" symbol in the table was rejected for asserting that we considered a criterion we may never have looked at.
- The comment and the Check Run summary compute the count from **one shared helper**. Two surfaces disagreeing about how much of the spec went unjudged would be worse than either staying silent.
- **No `CriterionResult` row is written for an unjudged criterion.** Nothing is lost that could have been kept: a proposal the Verifier discarded and a proposal never made both fail to produce a verified result. Persisting ungrounded proposals was considered and rejected — under `docs/adr/0006` no reader exists for one, and the row would sit in the database looking exactly like a published verdict.
- This does not touch the grounding asymmetry in `docs/adr/0003`. That governs how hard a verdict is checked before it may be published. This governs how many published verdicts fit in the report. The two were conflated once already, while deciding which of two contradictory proposals wins.

## Status of the evidence

The change is covered from the webhook seam, including a negative control: a Run carrying twelve criteria *and* eight findings. Criteria alone cannot distinguish separate budgets from a large shared one, so the both-kinds case is the only one that fails if the budgets are ever re-merged. That was verified by simulating the regression, not assumed.

Everything here is rendering, which the suite can see. Unlike `docs/adr/0005`, no part of this decision is invisible to it.
