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

Loop is a generic execution protocol. It does not define business requirements, project architecture, technology choices, coding conventions, test conventions, verification tools, or domain-specific output content.

The current project is the source of truth for those concerns. Before planning or implementation, discover and read the current project's applicable instructions, skills, existing code, tests, and documentation.

Loop has two distinct locations:

- `xt-agent`'s `loop/` implementation defines the generic workflow and policies.
- The current project's `.loop/` is the persistent workspace for this Loop run and its project-specific artifacts.

Never write project task artifacts into the Loop implementation directory in `xt-agent`.

## Project workspace

All Loop artifacts belong to the current project and MUST be stored under `<project-root>/.loop/`.

Use this default structure when the project does not already define a more specific `.loop/` convention:

```text
.loop/
├── state.yaml
├── plans/
├── tasks/
├── specs/
└── evidence/
```

Create `.loop/` and only the required subdirectories when they do not exist. Do not create unrelated project files merely to initialize the workspace.

Existing `.loop/` files are part of the Loop context. Before starting a new run, inspect relevant existing state, plans, tasks, specs, and evidence so the run can continue existing work instead of creating conflicting artifacts.

If the project already defines a `.loop/` structure or artifact convention, follow the project's convention rather than replacing it with the default structure.

## Persistent state

At `INIT`, create or update `<project-root>/.loop/state.yaml` according to the default schema in `loop/schemas/state.yaml` unless the current project defines another state convention.

The state is the machine-readable source for resuming the active run. It MUST track, at minimum:

- current Loop status/phase;
- iteration, fix-attempt, and repeated-failure counters;
- Goal and Acceptance Criteria;
- active task;
- verification and review status;
- Git baseline commit and branch.

### State transition rules

The active state MUST move only through transitions allowed by the state schema. The normal lifecycle is:

`INIT → GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION → DONE`

Failure paths are:

`VERIFY → FIX → IMPLEMENT`

`REVIEW → FIX → IMPLEMENT`

`READY_FOR_CONFIRMATION → FIX → IMPLEMENT` when the user rejects the result with actionable feedback.

Any active state may transition to `BLOCKED` when the Loop cannot safely continue. `DONE` and `BLOCKED` are terminal states.

Do not skip a required confirmation gate. Do not resume by inference from chat history when `.loop/state.yaml` contains a valid active run.

At resume, inspect the persisted state and its referenced artifacts/evidence, validate that the current repository still matches the recorded project and branch context, then continue from the persisted phase or stop as `BLOCKED` if safe continuation cannot be established.

Update state atomically at meaningful phase boundaries. A state update MUST preserve the previous run identity and increment counters rather than silently resetting them during a resume.

## Git baseline

At `INIT`, capture the current Git branch and baseline commit before implementation. A dirty working tree does not automatically block Loop; preserve the baseline so pre-existing changes can be distinguished from changes produced by the run.

Before completion, inspect the Git diff against the recorded baseline. Review must use this diff, together with the project's verification evidence, to determine what the Loop run changed.

Loop MUST NOT automatically commit or push unless an explicit project policy and user authorization allow it.

## Project context

Before implementation:

1. Identify the project root and current working repository.
2. Read applicable `AGENTS.md` and other project-level instructions.
3. Discover relevant project skills under the project's agent/skill directories and read the ones applicable to the task.
4. Read the relevant existing code, tests, and project documentation.
5. Inspect relevant existing `.loop/` artifacts, especially `state.yaml` when present.
6. Convert the user's request into a Task and explicit Acceptance Criteria using the project's terminology and constraints.
7. Establish the current Git state as the Loop baseline.

Project context determines the contents of plans, tasks, specs, and evidence. Do not copy unrelated project rules into artifacts merely for completeness.

## Execution contract

Once `/loop` is explicitly invoked, run the following state machine:

`INIT → GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION → DONE`

When verification or review fails:

`VERIFY/REVIEW → FIX → IMPLEMENT → VERIFY`

When the user rejects the result:

`READY_FOR_CONFIRMATION → FIX → IMPLEMENT → VERIFY`

Terminate as `BLOCKED` when the configured safety limits are reached or safe continuation cannot be established.

## Goal and result confirmation

Before implementation, present the Goal, proposed plan, and Acceptance Criteria and obtain explicit user confirmation when required by the Loop policy.

Do not modify implementation files before the goal confirmation gate has passed.

After all required acceptance criteria have passing evidence and review succeeds, stop at the result confirmation gate when required. User rejection with feedback returns the run to `FIX`.

## Verification and test strategy

Verification is required, but testing is only one possible verification method.

For new features, feature changes, and bug fixes, follow the current project's verification conventions and the Loop test-first policy when it applies:

1. Confirm the Goal.
2. Define Acceptance Criteria and the appropriate verification strategy.
3. If the project's conventions and Loop policy require test-first work, create or modify the appropriate test artifacts before implementation files.
4. During a test-first phase, do not create or modify implementation files.
5. Complete the test-first phase before implementation changes.
6. Run the project's applicable verification commands and make the implementation satisfy the Acceptance Criteria.

Loop MUST NOT assume a specific test framework, test file naming convention, test directory, language, or test type. These are determined by the current project.

Not every task requires automated tests. For documentation, configuration, tooling, design, or other tasks where tests are not applicable, use the project's appropriate verification method instead.

Do not manufacture an executable RED state with temporary implementations merely to satisfy a workflow. If test-first work is required but the project does not define how the required test artifacts should be created, inspect project conventions and relevant skills before proceeding.

## Completion rule

Never treat the Agent's claim of completion as sufficient evidence.

`DONE` requires:

1. Every required acceptance criterion has passing evidence.
2. Applicable verification passes.
3. Review passes.
4. No configured Loop safety limit has been exceeded.
5. Required final user confirmation has been received.

Use the Loop policy files as the source of truth for state, safety, evidence, and completion rules.

## Artifact rules

During a run, persist project-specific artifacts under the current project's `.loop/` workspace:

- `state.yaml` — machine-readable resumable run state.
- `plans/` — the run-level plan, Goal, Acceptance Criteria, and project-relevant context.
- `tasks/` — actionable task breakdown and task progress when the run needs persistent task records.
- `specs/` — detailed design/specification artifacts when the task requires them.
- `evidence/` — verification and review evidence associated with Acceptance Criteria.

Artifacts should contain only information useful to the current project and task. Project-specific technical details are allowed because they come from the current project's context; they must not be promoted into the generic Loop implementation.

## Verification and evidence

During verification, prefer project-native commands and conventions. Do not assume a particular framework, package manager, test runner, or verification tool when the project defines another one.

Record each meaningful verification or review result as structured Evidence associated with an Acceptance Criterion when applicable. Use `loop/schemas/evidence.yaml` as the default schema when the project does not define its own evidence format.

Evidence MUST record at minimum the criterion association when applicable, evidence type, status, confidence, and a concise summary. Include the command/output or referenced artifact when available.

Preserve failed verification evidence when it is relevant to later FIX iterations. Do not overwrite previous failed attempts.

## Failure handling

When a verifier fails:

1. Preserve the failure output in the current project's `.loop/evidence/` when persistent evidence is appropriate.
2. Associate it with the relevant criterion when possible.
3. Update `.loop/state.yaml` with the failure and current FIX iteration/counters.
4. Pass the failure and relevant context into the next FIX iteration.
5. Do not discard previous failed attempts.
6. Stop with `BLOCKED` after the configured repeated-failure or iteration limit.

## User cancellation

If the user explicitly asks to stop/cancel the current Loop run, stop the Loop immediately and report the current state and unresolved criteria.
