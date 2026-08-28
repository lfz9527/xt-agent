# Loop v1

Loop is the generic control layer for autonomous software tasks.

Loop does not contain or depend on business-specific task definitions. It defines only the execution protocol, state machine, confirmation gates, evidence rules, and failure/retry policy.

## Principle

The Agent performs work; verification and review provide evidence; the user remains in control of the goal and final acceptance.

Loop is reusable across projects. Project requirements, architecture, technology choices, coding conventions, test conventions, and domain-specific content come from the current project.

## Trigger

Loop may start **only** when the user explicitly invokes `/loop`.

Normal conversation MUST NOT start Loop or authorize repository modifications through Loop.

## Flow

`/loop → Goal Review → User Confirmation → Test Design → Write Tests → Implement → Verify → Review → Result Review → User Confirmation → Done`

Verification or review failures enter `Fix → Implement → Verify`.

## Project boundary

Loop has two distinct locations:

- The Loop implementation (`loop/` and `skills/loop/`) contains generic workflow and policy.
- The current project's `.loop/` is the persistent workspace for Loop state and project-specific artifacts.

Loop MUST NOT write project plans, tasks, specs, or evidence into its own implementation directory.

## Project context

At `INIT`, the Agent identifies the current project root and loads the applicable project context, including project instructions, relevant skills, existing code, tests, documentation, and existing `.loop/` artifacts.

Project context is authoritative for the task's technical and domain content. Loop does not copy unrelated project rules into its generic implementation.

## Project workspace

All Loop artifacts belong to the current project and MUST be stored under `<project-root>/.loop/`.

If the project does not define its own `.loop/` convention, the default workspace is:

```text
.loop/
├── state.yaml
├── plans/
├── tasks/
├── specs/
└── evidence/
```

Only create the workspace directories required by the current run. If the project already defines a `.loop/` structure, follow it instead of replacing it.

Existing `.loop/` artifacts are persistent Loop context and should be inspected before creating conflicting work.

### Artifact responsibilities

- `state.yaml`: machine-readable current run state, active task, iteration, acceptance-criteria status, and Git baseline.
- `plans/`: run-level Goal, Acceptance Criteria, plan, and relevant project context.
- `tasks/`: actionable task breakdown and progress when persistent task records are needed.
- `specs/`: detailed design/specification artifacts when needed.
- `evidence/`: verification and review evidence associated with Acceptance Criteria.

Artifact content is project-specific. A plan for a NestJS project may contain NestJS details because those details come from the project; they are not part of the generic Loop protocol.

## Two confirmation gates

### Goal Review

Before any code modification, Loop presents its understanding of the goal, proposed plan, and acceptance criteria. The user must explicitly confirm before implementation starts.

Until confirmation, Loop has no authorization to modify implementation files.

### Result Review

After all required acceptance criteria have passing evidence and review succeeds, Loop enters `READY_FOR_CONFIRMATION`. It must stop and ask the user whether to accept the result.

- Confirm → `DONE`
- Reject with feedback → `FIX → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION`

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

Loop v1 does not require artificially creating an executable RED state when the implementation file does not exist. Do not create temporary Stub/Mock implementations merely to manufacture RED.

## Completion

Agent claims are never sufficient for completion. Technical completion requires valid evidence for all required acceptance criteria, applicable verification, and review. Final `DONE` additionally requires explicit user acceptance when required by policy.

## Business agnostic

Loop is business-agnostic: business requirements belong to the current project/task, not to this directory.
