# Code Review Skill

Review code at two complementary scopes: **Change Review** for the current change set and directly affected code, and **Global Review** for repository-level structural health.

## Lifecycle

```text
Detect project -> Review profile -> Change Review -> Verify -> Global Review -> Commit Gate
```

Before a commit or merge, run both Change Review and Global Review. Periodically, run a deeper repository review.

## Project detection

Inspect language/version, runtime, framework, dependency manifests, test/lint/typecheck/build configuration, and repository rules such as `AGENTS.md`, `.agents/`, `CLAUDE.md`, `.cursor/rules`, README, and docs. Build a review profile and load only rules relevant to the detected stack and affected code.

## Change Review

Start from the diff, then expand to directly affected symbols and callers/callees when necessary. Check correctness, edge cases, error handling, async/concurrency, security/authorization, API compatibility, data consistency/transactions, performance, tests, maintainability, and project rules.

Do not report speculation as fact. Prefer evidence from code, tests, static checks, or a minimal reproduction.

## Global Review

Global Review is not a second pass over the diff. It asks whether the resulting repository has structural problems introduced or exposed by the change.

Prioritize:

- **Duplication:** semantic duplication among components, hooks/composables, utilities/helpers, types/models, services, business logic, API clients/endpoints, validation, and configuration.
- **Architecture:** module/package boundaries, dependency direction, circular dependencies, inappropriate layer access, duplicated abstractions, inconsistent patterns, coupling, and architectural drift.
- **Dependency fragmentation:** multiple libraries/mechanisms serving the same purpose, such as HTTP clients, state managers, date libraries, validation, or logging.
- **Dead/obsolete code:** orphaned code, stale compatibility layers, unused exports, unreachable paths, and obsolete abstractions.

Similarity must be supported by concrete evidence; do not automatically require consolidation merely because code looks similar.

## Language and framework awareness

Use layered rules:

```text
Universal + Language + Framework/Runtime + Project
```

Examples: TypeScript should emphasize type safety, `any`, narrowing, promises and modules; Python should emphasize mutable defaults, exceptions, context managers, typing, generators and asyncio; Go should emphasize goroutine lifecycle, context cancellation, errors, races, mutexes and package boundaries; Rust should emphasize ownership, borrowing, lifetimes, `unsafe` and concurrency. Framework rules must reflect framework semantics, e.g. React Hooks/rendering versus NestJS modules/DI/controllers/providers/guards/pipes.

## Verification

When practical, validate findings with commands discovered from project configuration: tests, lint, typecheck, build, and static analysis. Do not invent commands.

## Severity

- `BLOCKER`: unsafe integration or severe production/data/security impact.
- `CRITICAL`: severe confirmed defect/security issue.
- `HIGH`: important confirmed bug, regression, authorization, consistency, or architectural violation.
- `MEDIUM`: meaningful risk or maintainability/performance issue.
- `LOW`: minor quality issue.
- `INFO`: non-blocking improvement.

## Finding format

```text
[SEVERITY] Title
Location: file:line
Problem: what is wrong
Impact: why it matters
Evidence: how it was established
Recommendation: concrete fix
Confidence: 0.00-1.00
```

## Commit gate

```text
Change Review -> fix blockers -> verify -> Global Review -> fix structural blockers -> verify -> commit
```

When Global Review finds a duplicate component, utility, or business abstraction, prefer reusing/consolidating an existing asset rather than creating another equivalent implementation.

## Deep Review

A periodic deep review may inspect the whole repository and maintain an inventory of components, utilities, services, dependencies, packages, and reusable assets. Use it to detect semantic duplication and long-term architecture drift.

## Output

Return review scope and detected stack, findings by severity, verification results, Global Review findings, and a final verdict: `PASS`, `PASS_WITH_WARNINGS`, or `REQUEST_CHANGES`.
