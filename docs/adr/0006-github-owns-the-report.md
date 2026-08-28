# GitHub owns the report; the dashboard owns execution

The pull request comment is the single authoritative presentation of what a review concluded — every Criterion Result, verdict, Finding, and piece of Evidence, rendered with its citations and revised in place as the pull request is pushed to. **The dashboard does not reproduce any of it.** What the dashboard reports is whether the reviewer ran: the status of each Review Run, why it declined or failed, what it cost, and when. Those are facts that never reach the pull request comment at all.

The alternative — a run detail view rendering Criterion Results and Findings in the browser — was rejected on maintenance rather than effort. It means a second rendering of the same data in a second medium, guaranteed to drift from the markdown one, shown to a reader who is one click away from the authoritative version on the pull request they were already looking at. The same argument rules out putting a verdict summary on a feed row: "3 satisfied · 1 unsatisfied" is a number a reader will trust as *the* answer, and it can disagree with the comment the moment the renderer changes how it counts unreported criteria.

## Consequences

- The feed row carries pull request, repository, Installation, status, reason, cost, and time — and links out. It carries no verdicts.
- History is **navigational, not informational**. It helps you find a Run; GitHub tells you what that Run concluded. An earlier framing of this feature promised browsable verdicts as a free by-product, and that was narrowed deliberately rather than left half-built.
- This is the standing answer to "why doesn't the dashboard show review results?", which is the question every future dashboard request will circle. The test for whether something belongs on that screen is whether it answers *did the reviewer run* rather than *what did the reviewer conclude*.
- The comment renderer stays the only place review output is formatted, so changing how a verdict reads is a one-file change.
- A consequence worth accepting openly: if GitHub is unreachable, the report is unreachable. The dashboard will say a Run completed and offer a link that does not load. That is preferable to two sources of truth about the same judgement.
- Nothing here constrains the *record* of execution, which `docs/adr/0005` decides.
