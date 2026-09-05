# devme

A GitHub App that reviews a pull request against the acceptance criteria in the issue it closes —
not against the diff's own merits. It reads the linked issue, extracts the discrete obligations it
places on the implementation, and checks each one against the changed code, posting a single comment
with a verdict and a citation per criterion. Reviews run on your own Anthropic API key.

Single-operator, pre-commercial — see [`docs/getting-started.md`](docs/getting-started.md) for what
that means and how to try it on your own repository.

## For engineering work on this repo

Start with [`CLAUDE.md`](CLAUDE.md) — commands, architecture, and the constraints that shape the
review pipeline. Domain vocabulary is in [`CONTEXT.md`](CONTEXT.md); decisions that constrain the
design are in [`docs/adr/`](docs/adr/).

Stack: Next.js 15 App Router, tRPC v11, Prisma, Tailwind v4, shadcn/ui, PostgreSQL with pgvector,
BullMQ/Redis. Package manager is `bun`.
