# GitHub App with authorization delegated to GitHub

Repository access comes from a GitHub App installation rather than a user's OAuth token or a stored personal access token, because a reviewer must post as a bot identity, receive webhooks, write check runs, and keep working after the employee who connected the account leaves. Because GitHub already knows which installations a user can reach, we ask GitHub that question instead of answering it ourselves: this application stores no membership table, no roles, and no invites.

## Consequences

- There is no `UserToProject`, no owner/admin/member/viewer enum, and no invite tokens — their absence is deliberate, not an oversight. The roles workstream specified in `PROJECT_GUIDE.md` is cancelled outright. (That guide, and the UI that had already been built against it, were deleted in `docs/adr/0004`; both are in git history.)
- We inherit the customer's own GitHub org permissions, which are the permissions their admins already understand and administer.
- We cannot grant access to anyone outside the GitHub organisation. This is accepted; the previous unbounded `/join/<projectId>` link was a security defect, not a feature worth preserving.
- Installation-list lookups hit the GitHub API, so they must be cached per session.
- GitHub OAuth remains, but only to establish *who is looking at the dashboard*. It grants no repository access.
