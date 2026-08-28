---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start Loop, modify files, or continue a Loop run from an ordinary message.
---

# Loop v1

## Trigger rule

**The only trigger is an explicit `/loop` invocation from the user.**

Examples that start Loop:

- `/loop 实现 Bookmark Tag 系统`
- `/loop 修复登录接口的这个问题`

Examples that MUST NOT start Loop:

- `帮我看看这个功能`
- `分析一下代码`
- `这个测试为什么失败`
- `继续刚才的工作`

If `/loop` has not been explicitly invoked, do not modify repository files as part of Loop.

## Core boundary

Loop is a generic execution protocol. It does not define business requirements, project architecture, technology choices, coding conventions, test conventions, or domain-specific output content.

The current project is the source of truth for those concerns. Before planning or implementation, discover and read the current project's applicable instructions, skills, existing code, and documentation.

Loop has two distinct locations:

- `xt-agent`'s Loop implementation defines the generic workflow and policies.
- The current project's `.loop/` is the persistent workspace for this Loop run and its project-specific artifacts.

Never write project task artifacts into the Loop implementation directory in `xt-agent`.

## Project workspace

All Loop artifacts belong to the current project and MUST be stored under `<project-root>/.loop/`.

Use this default structure when the project does not already define a more specific `.loop/` convention:

```text
.loop/
├── plans/
├── tasks/
├── specs/
└── evidence/
```

Create `.loop/` and only the required subdirectories when they do not exist. Do not create unrelated project files merely to initialize the workspace.

Existing `.loop/` files are part of the Loop context. Before starting a new run, inspect relevant existing plans, tasks, specs, and evidence so the run can continue existing work instead of creating conflicting artifacts.

If the project already defines a `.loop/` structure or artifact convention, follow the project's convention rather than replacing it with the default structure.

## Project context

Before implementation:

1. Identify the project root and current working repository.
2. Read applicable `AGENTS.md` and other project-level instructions.
3. Discover relevant project skills under the project's agent/skill directories and read the ones applicable to the task.
4. Read the relevant existing code, tests, and project documentation.
5. Inspect relevant existing `.loop/` artifacts.
6. Convert the user's request into a Task and explicit Acceptance Criteria using the project's terminology and constraints.
7. Establish the current Git state as the Loop baseline.

Project context determines the contents of plans, tasks, specs, and evidence. Do not copy unrelated project rules into artifacts merely for completeness.

## Execution contract

Once `/loop` is explicitly invoked, run the following state machine:

`INIT → PLAN → IMPLEMENT → VERIFY → REVIEW → COMPLETE`

When verification or review fails:

`VERIFY/REVIEW → FIX → IMPLEMENT → VERIFY`

Terminate as `BLOCKED` when the configured safety limits are reached.

## Goal and result confirmation

Before implementation, present the Goal, proposed plan, and Acceptance Criteria and obtain explicit user confirmation when required by the Loop policy.

Do not modify implementation files before the goal confirmation gate has passed.

After all required acceptance criteria have passing evidence and review succeeds, stop at the result confirmation gate when required. User rejection with feedback returns the run to `FIX`.

## Test-first rule

For new features, feature changes, and bug fixes, follow the project's testing conventions and the Loop test-first policy. When the policy requires test-first work:

1. Confirm the Goal.
2. Design tests and Acceptance Criteria.
3. Create or modify test files before implementation files.
4. During the test phase, do not create or modify implementation files.
5. Complete the test phase before implementation changes.
6. Run the tests and make the implementation pass.

Do not manufacture an executable RED state with temporary implementations merely to satisfy the workflow.

## Completion rule

Never treat the Agent's claim of completion as sufficient evidence.

`DONE` requires:

1. Every required acceptance criterion has passing evidence.
2. Required verification passes.
3. Review passes.
4. No configured Loop safety limit has been exceeded.
5. Required final user confirmation has been received.

Use the Loop policy files as the source of truth for state, safety, evidence, and completion rules.

## Artifact rules

During a run, persist project-specific artifacts under the current project's `.loop/` workspace:

- `plans/` — the run-level plan, Goal, Acceptance Criteria, and project-relevant context.
- `tasks/` — actionable task breakdown and task progress when the run needs persistent task records.
- `specs/` — detailed design/specification artifacts when the task requires them.
- `evidence/` — verification and review evidence associated with Acceptance Criteria.

Artifacts should contain only information useful to the current project and task. Project-specific technical details are allowed because they come from the current project's context; they must not be promoted into the generic Loop implementation.

## Verification and evidence

During verification, prefer project-native commands and conventions. Do not assume a particular framework or package manager when the project defines another one.

Record each meaningful verification result as Evidence associated with an Acceptance Criterion. Preserve failed verification output when it is relevant to later FIX iterations.

## Failure handling

When a verifier fails:

1. Preserve the failure output in the current project's `.loop/evidence/` when persistent evidence is appropriate.
2. Associate it with the relevant criterion when possible.
3. Pass the failure and relevant context into the next FIX iteration.
4. Do not discard previous failed attempts.
5. Stop with `BLOCKED` after the configured repeated-failure or iteration limit.

## User cancellation

If the user explicitly asks to stop/cancel the current Loop run, stop the Loop immediately and report the current state and unresolved criteria.
