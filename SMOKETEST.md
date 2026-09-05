# Reboot-recovery smoke test

Not a feature — closes Issue #28. This pull request exists to prove that the production App
(`claimcheck-app`, installed on this repository) reviews a pull request after the OVHcloud box has
been rebooted, with no manual step beyond the reboot itself — gate condition 2 of
`.scratch/deploy-single-vm/spec.md`.

Acceptance criterion, from the Issue: `CLAUDE.md`'s Commands section lists `bun run typecheck` as a
standalone script. It does — see the `Commands` section at the top of the file. This diff does not
touch that line; the criterion is checkable against the repository as it already stands, which is
what makes it a cheap, deterministic thing for the reviewer to verify.

This PR should be closed without merging once the review comment has been read.
