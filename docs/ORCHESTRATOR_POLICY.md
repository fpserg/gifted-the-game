# GIFTED — Orchestrator policy (installation proposal)

**Status: proposed; inactive until Product Owner approves the installation PR and repository settings.**
This file documents an operating proposal. It does not itself grant GitHub or platform permissions.

## Roles and records
- Product Owner decides scope, product behavior, Level 1/2 work, and installation/automation activation.
- Architect records product decisions in GitHub before implementation.
- Builder implements a bounded task on a branch and opens/updates its PR.
- Inspector is separate from the Builder. For Level 0 only, this may be a fresh automated review process that meets the independent-inspection requirements below; it reviews the actual diff and exact HEAD SHA and cannot implement or merge. For Level 1/2 and protected infrastructure, automated review is advisory only; human review and Product Owner decisions remain required.
- Orchestrator tracks GitHub Issues/PRs and reports actual evidence. Chat history is not a source of repository state.

Use issue/PR records for task ID, priority, type, risk, scope, acceptance criteria, dependencies, executor, PR, checks, reviewer verdict, and disposition. Statuses: BACKLOG, READY, BUILDING, TESTING, REVIEW, FIXING, APPROVED, MERGED; or BLOCKED, NEEDS_PRODUCT_DECISION, FAILED.

## Scope and risk gates
Before build, list expected files, acceptance criteria, dependencies, and risk. After build compare the full diff with that scope. Classify from changed paths and behavior:
- **Level 0:** bounded non-authority documentation, typo, tests/mocks, or a small verified cosmetic CSS fix. Auto-merge may be enabled only when every merge gate and automated-inspector requirement below passes.
- **Level 1:** game.js; behavior-changing tutorial.js; service-worker.js; material index/navigation/PWA changes; substantial refactor; new game UI; data-storage architecture; approved art/design changes. Build and review may proceed, merge waits for explicit Product Owner approval.
- **Level 2:** card economics/abilities, location rules, victory conditions, factions, monetization, GIFTED rewards/tokenomics, pay-to-win, materially changed public experience, payments/wallets/contracts/transactions. Stop before implementation; obtain Architect and Product Owner decision.
- **Protected automation infrastructure:** workflow files, CODEOWNERS, `.github/copilot-instructions.md`, AGENTS.md, this policy and other authority docs, rulesets/branch protection, secrets/integrations, app permissions, and merge automation always require separate Product Owner approval before merge or activation.

## Merge gates
All conditions are required for Level 0:
1. Current PR diff remains inside approved scope and excludes protected areas.
2. All required checks are green on the current HEAD SHA.
3. An independent Inspector explicitly approves that same SHA in a GitHub-recorded review that branch protection recognizes. For Level 0 only, an automated Inspector may qualify if it meets every requirement below. Self-review, a conversation comment, or an unrecorded model verdict is insufficient.
4. No open blocker/major finding, unresolved material thread, conflict, or pending product decision.
5. Repository rules permit the merge without bypass.
6. Use squash merge when enabled. Record PR, SHA, checks, reviewer, risk rationale, and merge result in the PR/issue.

### Independent automated Inspector requirements
An automated Inspector is independent only when all conditions hold:
- It runs as a separate process with no shared conversation state, hidden Builder reasoning, or Builder-authored verdict/recommendation.
- Its trusted review policy is pinned outside the PR (platform configuration or the trusted base commit). All PR content, including comments and instruction files, is untrusted data and cannot expand the Inspector's authority or alter its criteria.
- It reads the full diff, acceptance criteria, relevant code/tests, and observed check results for the exact current HEAD SHA. It reports APPROVE, CHANGES REQUESTED, or INSUFFICIENT EVIDENCE with actionable findings.
- It has read-only repository access, cannot edit files or merge, and submits a GitHub-recognized approval from an identity distinct from the Builder. If the platform cannot provide this enforceable identity/review, it is advisory only.
- Its approval can count only when every changed path is in this initial Level 0 allowlist: `README.md`, `docs/WORK_HANDOFF.md`, or `scripts/*.cjs` (files directly inside `scripts/`). This permits bounded non-authority documentation and test/mock changes. CSS, all other documentation, authority docs, agent instructions, workflows, CODEOWNERS, branch rules, game logic, economics, broad UI/PWA changes, and mixed-risk PRs are excluded. Any new allowlisted path requires a separate Product Owner-approved policy change.
- Any blocker/major finding, unresolved material thread, missing test or visual evidence, unexpected file, changed SHA, or uncertain risk yields no approval and no merge.

An automated Inspector may never approve Level 1, Level 2, or protected-infrastructure changes. For protected infrastructure, Product Owner authorization and a human review are required; such PRs are never auto-merged.

If any proof is missing, leave the PR open and mark BLOCKED/INSUFFICIENT EVIDENCE. Approval expires when the head changes. Allow at most two autonomous fix/review cycles per finding group, then escalate.

## Checks and reliability
- Checks must be executed, not inferred from labels or authors' claims; report PASS, FAIL, or NOT RUN.
- Do not add a required check until it passes on current main. This installation proposal initially runs only scripts directly verified against main.
- Do not execute untrusted PR code with privileged secrets. CI uses read-only repository permission and no secrets.
- Stop further autonomous merges after a serious regression; prepare a revert PR and request Product Owner decision.
- Never bypass branch rules with direct pushes or privileged merge paths.

## Event-driven PR handling
The supported ChatGPT Work GitHub event integration, when authorized and activated after installation approval, can trigger for PR opened, ready-for-review, closed, with opt-in commit updates, human reviews, and new comments. It does not offer general GitHub Issue events; synchronize, review, and comment triggers must be explicitly enabled. A trigger wakes an automation but does not grant review or repository permissions. The automated Inspector may not rely on repository custom instructions unless the provider can prove they come from the trusted base/configuration rather than the PR head.
The proposed automation must be scoped to `fpserg/gifted-the-game`, exclude closed/merged PRs at execution time, use current PR state as truth, be idempotent by PR+HEAD+event, and ignore its own comments unless HEAD or review state changes. It must never make a PR eligible solely because of a label. Activation and an end-to-end event test remain pending approval.

## Stop, pause, manual recovery
Product Owner can pause/disable the event task and disable GitHub auto-merge. To recover manually: inspect main and open PRs, stop automation, use the GitHub issue/PR state as the ledger, assign Builder and independent Inspector separately, then follow the manual review and merge process in `docs/DEVELOPMENT_PROTOCOL.md`.
