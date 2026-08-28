# A pull request with no linked Issue is declined, not reviewed

The product judges a pull request against acceptance criteria extracted from the GitHub Issue it links, so a pull request that links no Issue has nothing to be judged against. Rather than falling back to the pull request's own description, we post a single comment saying the review was skipped and why. Falling back would silently change what a Criterion Result means — the author's description drifts along with their own diff, so it can never catch scope creep or a missed obligation, which is the entire value being sold.

## Consequences

- Declining is a product behaviour, not a limitation. It nudges teams toward linking issues, which is the habit the product depends on.
- Findings stay attributable: every reported item is grounded in a document a human wrote before the code existed.
- Jira and Linear are deliberately out of scope until a customer asks for them by name. Each is a separate OAuth flow and sync problem; GitHub Issues need neither, because the App installation token already reaches them.
