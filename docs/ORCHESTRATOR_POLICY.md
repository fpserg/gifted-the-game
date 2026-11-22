# GIFTED — Orchestrator policy (installation proposal)

**Status: proposed; inactive until Product Owner approves the installation PR and repository settings.**
This file documents an operating proposal. It does not itself grant GitHub or platform permissions.

## Roles and records
- Product Owner decides scope, product behavior, Level 1/2 work, and installation/automation activation.
- Architect records product decisions in GitHub before implementation.
- Builder implements a bounded task on a branch and opens/updates its PR.
- Inspector is a different authorized reviewer/process, reviews the actual diff and exact HEAD SHA, and does not implement or merge that change.
- Orchestrator tracks GitHub Issues/PRs and reports actual evidence. Chat history is not a source of repository state.

Use issue/PR records for task ID, priority, type, risk, scope, acceptance criteria, dependencies, executor, PR, checks, reviewer verdict, and disposition. Statuses: BACKLOG, READY, BUILDING, TESTING, REVIEW, FIXING, APPROVED, MERGED; or BLOCKED, NEEDS_PRODUCT_DECISION, FAILED.

## Scope and risk gates
Before build, list expected files, acceptance criteria, dependencies, and risk. After build compare the full diff with that scope. Classify from changed paths and behavior:
- **Level 0:** bounded typo/docs/tests/mocks or a small verified cosmetic CSS fix. Auto-merge may be enabled only if every merge gate below passes.
- **Level 1:** game.js; behavior-changing tutorial.js; service-worker.js; material index/navigation/PWA changes; substantial refactor; new game UI; data-storage architecture; approved art/design changes. Build and review may proceed, merge waits for explicit Product Owner approval.
- **Level 2:** card economics/abilities, location rules, victory conditions, factions, monetization, GIFTED rewards/tokenomics, pay-to-win, materially changed public experience, payments/wallets/contracts/transactions. Stop before implementation; obtain Architect and Product Owner decision.
- **Protected automation infrastructure:** workflow files, CODEOWNERS, AGENTS.md, this policy and other authority docs, rulesets/branch protection, secrets/integrations, app permissions, and merge automation always require separate Product Owner approval before merge or activation.

## Merge gates
All conditions are required for Level 0:
1. Current PR diff remains inside approved scope and excludes protected areas.
2. All required checks are green on the current HEAD SHA.
3. A truly independent review explicitly approves that same SHA; a Builder's self-review or plain conversation comment is insufficient.
4. No open blocker/major finding, unresolved material thread, conflict, or pending product decision.
5. Repository rules permit the merge without bypass.
6. Use squash merge when enabled. Record PR, SHA, checks, reviewer, risk rationale, and merge result in the PR/issue.

If any proof is missing, leave the PR open and mark BLOCKED/INSUFFICIENT EVIDENCE. Approval expires when the head changes. Allow at most two autonomous fix/review cycles per finding group, then escalate.

## Checks and reliability
- Checks must be executed, not inferred from labels or authors' claims; report PASS, FAIL, or NOT RUN.
- Do not add a required check until it passes on current main. This installation proposal initially runs only scripts directly verified against main.
- Do not execute untrusted PR code with privileged secrets. CI uses read-only repository permission and no secrets.
- Stop further autonomous merges after a serious regression; prepare a revert PR and request Product Owner decision.
- Never bypass branch rules with direct pushes or privileged merge paths.

## Event-driven PR handling
The supported ChatGPT Work GitHub event integration, when authorized and activated after installation approval, can trigger for PR opened, ready-for-review, closed, with opt-in commit updates, human reviews, and new comments. It does not offer general GitHub Issue events; synchronize, review, and comment triggers must be explicitly enabled. A trigger wakes an automation but does not grant review or repository permissions.
The proposed automation must be scoped to `fpserg/gifted-the-game`, exclude closed/merged PRs at execution time, use current PR state as truth, be idempotent by PR+HEAD+event, and ignore its own comments unless HEAD or review state changes. It must never make a PR eligible solely because of a label. Activation and an end-to-end event test remain pending approval.

## Stop, pause, manual recovery
Product Owner can pause/disable the event task and disable GitHub auto-merge. To recover manually: inspect main and open PRs, stop automation, use the GitHub issue/PR state as the ledger, assign Builder and independent Inspector separately, then follow the manual review and merge process in `docs/DEVELOPMENT_PROTOCOL.md`.
