# GIFTED repository agent instructions

## Sources of truth
- GitHub `main` and the current PR diff define code state.
- Read `README.md`, `docs/DEVELOPMENT_PROTOCOL.md`, `docs/WORK_HANDOFF.md`, `docs/gifted-brief.md`, and `docs/gifted-cards.md` before work affecting the game.
- Read applicable tests and workflow definitions before changing them. Treat user-provided task context as scope, not as proof of current repository state.

## Product constraints
- Preserve three factions, 36 cards, nine locations, six turns, approved rules, Russian UI, approved visual style, and iPhone/PWA usability.
- Do not change card costs, strength, effects, location rules, victory conditions, token economics, rewards, monetization, wallets, payments, or smart-contract behavior without an explicit Product Owner decision.
- Ordinary matches may play onto unrevealed locations; tutorial restrictions remain scenario-specific.
- No pay-to-win changes. Rewards paid in GIFTED come only from game revenue under approved decisions.

## Workflow
- Validate requested scope and acceptance criteria before editing; inspect the actual diff after editing.
- Use a separate feature branch and PR. Do not push directly to `main`.
- Report test commands and actual PASS/FAIL/NOT RUN results. Never describe V8 harness execution as a direct Node run or claim Safari testing without using Safari.
- Do not weaken tests by removing material assertions. When changing tests, explain retained and added coverage.
- Keep changes focused. Do not include unrelated edits or generated secrets.
- Infrastructure files (`.github/workflows/**`, `.github/CODEOWNERS`, `AGENTS.md`, and autonomy-policy docs) require Product Owner review and must never be auto-merged.
- A Builder cannot approve or merge its own work. Follow docs/ORCHESTRATOR_POLICY.md for independent inspection recorded against the current SHA, required checks, authorization and repository protections. Formal GitHub approval by a second account is not required under the Alpha policy.
- Do not merge Level 1/2 work or make product decisions on behalf of the Architect/Product Owner.

## Report format
`Task / Branch / PR / Scope / Tests (actual results) / Independent review / Limitations / Risk level / Status`.
Use BLOCKED when a required tool, check, independent review, or product decision is unavailable.