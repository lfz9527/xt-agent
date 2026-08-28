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

- The Loop implementation (`Loop/` and `skills/loop/`) contains generic workflow and policy.
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
├── plans/
├── tasks/
├── specs/
└── evidence/
```

Only create the workspace directories required by the current run. If the project already defines a `.loop/` structure, follow it instead of replacing it.

Existing `.loop/` artifacts are persistent Loop context and should be inspected before creating conflicting work.

### Artifact responsibilities

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

## Test-first rule

For every new feature, feature change, or bug fix:

1. Confirm the Goal first.
2. Design the tests and acceptance criteria.
3. Create or modify test files (`*.spec.ts`, `*.e2e-spec.ts`, etc.) **before** implementation files when the Loop policy requires test-first work.
4. During the test phase, implementation files must not be created or modified.
5. After the test phase is complete, implementation files may be created or modified.
6. Run the tests and make the implementation pass.

Loop v1 does not require artificially creating an executable RED state when the implementation file does not exist. Do not create temporary Stub/Mock implementations merely to manufacture RED.

## Completion

Agent claims are never sufficient for completion. Technical completion requires valid evidence for all required acceptance criteria, verification, and review. Final `DONE` additionally requires explicit user acceptance when required by policy.

## Business agnostic

Loop is business-agnostic: business requirements belong to the current project/task, not to this directory.
