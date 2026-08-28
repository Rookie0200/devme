# Pull Request Review

An automated reviewer that judges whether a pull request actually delivers what its linked issue asked for. It reads the issue as a specification, evaluates the diff against it, and reports back on the pull request itself.

## Language

### Ownership and scope

**Installation**:
A grant of access from a GitHub account — a user or an organisation — to this application. It is the unit of tenancy: settings, provider keys, and usage all belong to an Installation.
_Avoid_: Tenant, workspace, team, organisation, account

**Repository**:
A GitHub repository reachable through an Installation. Repositories are discovered from GitHub, never created by a person inside this application.
_Avoid_: Project, repo connection

**Provider Key**:
An API credential belonging to an Installation, used to pay for that Installation's model calls. The application never substitutes its own credential for a missing one.
_Avoid_: API key, BYOK key, token

### The specification

**Issue**:
A GitHub issue linked from a pull request's body. It is the authoritative statement of what the pull request is supposed to do.
_Avoid_: Ticket, spec, story, requirement

**Acceptance Criterion**:
A single discrete obligation extracted from an Issue. Criteria are the unit a pull request is judged against; a pull request satisfies criteria, not issues.
_Avoid_: Requirement, AC, checklist item

**Unlinked**:
The state of a pull request that names no Issue. Unlinked pull requests are declined rather than reviewed, because there is nothing to judge them against.

### The review

**Review**:
The application's ongoing assessment of one pull request. A Review persists for the life of the pull request and is expressed as a single comment that is revised in place.
_Avoid_: Review comment, report

**Review Run**:
One evaluation of a Review against one specific head commit. A Review accumulates many Runs as the pull request is pushed to; comparing consecutive Runs is what lets the Review report progress.
_Avoid_: Review pass, execution, job

**Criterion Result**:
The verdict a Review Run reaches on one Acceptance Criterion — satisfied, unsatisfied, or unclear — together with the evidence supporting it.
_Avoid_: indeterminate (the state is named `unclear` in the schema and the rendered comment; keep the prose and the code in step)
_Avoid_: Check, status, assessment

**Finding**:
An observation about a pull request that is not tied to an Acceptance Criterion, such as a security concern. Findings and Criterion Results are reported together but are judged by different rules.
_Avoid_: Issue, comment, violation, nitpick

**Evidence**:
The specific part of the diff or the codebase that justifies a Criterion Result or a Finding. A verdict without Evidence is discarded rather than reported.

### Judgement

**Producer**:
A role that examines a pull request and proposes Criterion Results or Findings. Producers never publish; they only propose.
_Avoid_: Agent, reviewer, analyst

**Verifier**:
The role that re-checks each proposal against the diff and discards anything it cannot ground in Evidence. Nothing reaches a pull request without passing the Verifier.
_Avoid_: Synthesiser, filter, judge

### Context

**Codebase Index**:
A searchable, semantic representation of a Repository's source, built when the Repository is first seen. It supplies a Review with surrounding context that the diff alone does not contain.
_Avoid_: Embeddings, vector store, knowledge base

## Retired terms

These appear in git history and older documents. They no longer describe anything in the system —
the code and the schema were removed in `docs/adr/0004`, so these are absent rather than deprecated.

- **Project** — replaced by Repository. Repositories now arrive from an Installation instead of being created by hand.
- **Member / Role** — access is decided by GitHub's own permissions on the Installation. This application stores no membership or roles of its own.
- **Meeting / Meeting Issue** — an abandoned meeting-transcription feature. "Issue" now only ever means a GitHub issue.
