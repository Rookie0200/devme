# Getting started with devme

devme reviews a pull request against the acceptance criteria in the issue it closes — not against
the diff's own merits. It checks each obligation the linked issue states, against the changed code
and an index of the repository, and posts one comment with a verdict and a citation per criterion.

## What this is, plainly

This is a single-operator, pre-commercial project. There is no SLA, no uptime guarantee, and no
on-call. It runs on one small box. Your Anthropic API key is encrypted at rest (AES-256-GCM) and
only its last four characters are ever shown again, in the dashboard, to anyone — but it still sits
on infrastructure administered by one person, not a company with a security team. Install it on a
repository you're comfortable with under those terms, not on anything where a review going missing
for a day would be a problem.

## Prerequisites

- A GitHub account with admin access on the repository you want reviewed.
- Your own Anthropic API key. Reviews run on it directly (BYOK) — Anthropic bills you at their
  rates, devme adds no markup and never sees your usage beyond what it takes to run the review.

## 1. Install the App

The App is private — it has no public GitHub Marketplace listing, so you can't find it by searching.
Ask the maintainer for the install link, then install it on the repository (or repositories) you
want reviewed.

## 2. Sign in to the dashboard

Go to [app.claimcheck.dev/dashboard](https://app.claimcheck.dev/dashboard) and sign in with GitHub
OAuth. This is a separate step from installing the App:
OAuth only proves who you are for the dashboard, it grants no repository access on its own. Which
Installations you can see there is asked of GitHub against your own account, live, every time —
nothing about your GitHub org membership is stored.

## 3. Add your Provider Key

On `/dashboard`, find the Installation you just created and give it your Anthropic API key. If the
key is ever refused by Anthropic during a real review (revoked, out of quota), the dashboard will
warn you against that Installation — check there first if reviews stop appearing.

## 4. Open a pull request that links an issue

devme reviews against an issue, not a diff in isolation, so:

- File an issue stating what the change should do. Write each obligation as its own sentence —
  "the endpoint returns 404 for a missing record and 200 otherwise" extracts as two checkable
  criteria; a vague issue extracts vague criteria, and an issue with no discrete obligations at all
  extracts none. There's no required template or heading — plain prose works.
- In the pull request, link that issue with a closing keyword: `Closes #123`, `Fixes #123`, or
  similar. A pull request that links no issue is **declined** rather than reviewed — you'll get a
  comment asking you to link one, not a review.

## What happens next

A comment appears on the pull request, listing every criterion the linked issue implied, each marked
satisfied, unsatisfied, or unclear with a file-and-line citation. It's revised in place on every
push to the same pull request — never a second comment appended below it. Below the criteria, up to
five additional observations ("Also noticed") may appear for correctness or security problems not
tied to any specific criterion.

The GitHub Check Run is always **neutral**. devme does not block merges — it reports, you decide.

## What this isn't

- Not a general code-quality reviewer. It doesn't comment on style, naming, or idiom — anything like
  that is dropped before it ever reaches you.
- Not a security scanner. It has no SAST, dependency, or license analysis.
- Not inline comments. One summary comment per pull request, no line-by-line annotations, no
  suggested-fix buttons.
- Not configurable per repository yet. There's no settings file to opt criteria in or out.

## If something looks wrong

Ask the maintainer directly (`@Rookie0200` on GitHub). There's no support queue or status page —
you're talking to the person who runs it.
