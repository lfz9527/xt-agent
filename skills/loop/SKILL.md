---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start Loop, modify files, or continue a Loop run from an ordinary message.
---

# Loop v1

Loop is a generic, stateful execution protocol. The Agent performs work; Loop controls lifecycle and safety; project context supplies technical/domain rules; the project `.loop/` workspace persists run state and artifacts.

## Trigger

Loop starts **only** from an explicit `/loop` invocation. Normal conversation MUST NOT start, resume, or authorize repository modifications through Loop.

## Layer boundaries

- `skills/loop/SKILL.md`: executable Agent behavior and phase contract.
- `loop/config.yaml`: generic policies, limits, confirmation requirements, and defaults.
- `loop/schemas/state.yaml`: state data model and legal transitions.
- `loop/schemas/evidence.yaml`: default evidence data model.
- `<project>/.loop/`: persistent state and project-specific artifacts.

Loop is business- and technology-agnostic. Do not encode framework, language, test framework, file naming, architecture, or domain rules into the generic Loop implementation.

## Runtime contract

When `/loop` starts or resumes, treat the persisted project state as the runtime source of truth:

```text
load state
  ↓
validate state
  ↓
validate current project/Git context
  ↓
execute current phase
  ↓
check exit condition
  ↓
record artifacts/evidence
  ↓
transition state
  ↓
persist state
```

Every phase has five contracts:

1. **Entry conditions** — what must already be true.
2. **Allowed actions** — what the Agent may do in that phase.
3. **Required artifacts/evidence** — what must be persisted before leaving it.
4. **Exit conditions** — what must be true to leave it.
5. **Allowed transitions** — which next states are legal.

The Agent MUST evaluate the current state before acting. It MUST NOT perform actions belonging to a later phase early merely because they seem useful.

## Project workspace

All run-specific artifacts belong under `<project-root>/.loop/`.

Default structure when the project has no existing convention:

```text
.loop/
├── state.yaml
├── plans/
├── tasks/
├── specs/
└── evidence/
```

Follow an existing project `.loop/` convention when one exists. Create only directories required by the current run.

## INIT

### Entry

An explicit `/loop` invocation exists.

### Actions

1. Identify the project root.
2. Load applicable project instructions, including `AGENTS.md` and relevant project skills.
3. Inspect relevant source, tests, documentation, and existing `.loop/` artifacts.
4. If `.loop/state.yaml` contains an active run, validate it and prepare to resume rather than silently creating a new run.
5. Capture the current Git branch and baseline commit before implementation.
6. Create/update `.loop/state.yaml` using `loop/schemas/state.yaml` when no project-specific state convention exists.

### Exit

Project context is sufficient to perform Goal Review and state contains a valid run identity and Git baseline.

### Transition

`INIT → GOAL_REVIEW` or `BLOCKED`.

## GOAL_REVIEW

### Entry

Project context is loaded and the run state is valid.

### Actions

Produce the proposed:

- Goal
- Acceptance Criteria
- verification strategy
- high-level plan

Persist the plan under `.loop/plans/` when persistent plan artifacts are required.

### Exit

The user has been shown the Goal, plan, and Acceptance Criteria and the run is ready for confirmation.

### Transition

`GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION` or `BLOCKED`.

## WAITING_FOR_GOAL_CONFIRMATION

### Entry

Goal Review is complete.

### Actions

Wait for explicit user confirmation. Do not modify implementation files.

### Exit

The user explicitly approves the Goal/plan.

### Transition

`WAITING_FOR_GOAL_CONFIRMATION → PLAN` or `BLOCKED`.

## PLAN

### Entry

Goal confirmation has passed.

### Actions

Turn the confirmed Goal into actionable tasks using project conventions. Select relevant project skills and define the verification approach. If test-first is required by project policy, identify the appropriate project-native test artifacts before implementation.

Persist task/spec artifacts when needed.

### Exit

Tasks are actionable, required skills are known, and the verification strategy is defined.

### Transition

`PLAN → IMPLEMENT` or `BLOCKED`.

## IMPLEMENT

### Entry

Goal confirmation and planning are complete.

### Actions

Execute only the current task using project context and relevant skills. Respect the project's coding conventions and any test-first requirements.

If test-first applies, implementation-file modification is prohibited until the required test-artifact phase is complete. Loop does not assume any particular test framework or file naming convention.

Update the active task and iteration state as work progresses.

### Exit

The current implementation task is ready for project-native verification.

### Transition

`IMPLEMENT → VERIFY` or `BLOCKED`.

## VERIFY

### Entry

Implementation changes for the current task are complete.

### Actions

Run the project's applicable verification methods. Testing is optional when inappropriate; Verification is not optional.

Possible verification methods include project-native tests, build/type checks, lint/static analysis, documentation checks, configuration validation, manual checks, or other project-defined validation.

For every meaningful result, create structured Evidence under `.loop/evidence/` when the project does not define another convention. Associate Evidence with an Acceptance Criterion when applicable. Preserve failures rather than overwriting prior attempts.

### Exit

Verification either passes or has a recorded actionable failure.

### Transition

- pass → `REVIEW`
- fail → `FIX`
- unsafe/blocked → `BLOCKED`

## REVIEW

### Entry

Verification has passed for the current implementation state.

### Actions

Review:

- Acceptance Criteria and Evidence
- project instructions and relevant skills
- implementation quality and scope
- Git diff against the recorded baseline
- regressions or obvious omissions

Record meaningful review evidence.

### Exit

Review either passes or identifies actionable changes.

### Transition

- pass → `READY_FOR_CONFIRMATION`
- fail → `FIX`
- unsafe/blocked → `BLOCKED`

## READY_FOR_CONFIRMATION

### Entry

All required Acceptance Criteria have passing evidence and Review has passed.

### Actions

Present the result and evidence summary. Do not mark `DONE` until required user acceptance is received.

### Exit

The user accepts or rejects the result.

### Transition

- accepted → `DONE`
- rejected with actionable feedback → `FIX`
- cannot safely continue → `BLOCKED`

## FIX

### Entry

Verification, Review, or final user feedback identified an actionable failure.

### Actions

1. Preserve the failure/review evidence.
2. Increment fix/iteration counters.
3. Identify the root cause and smallest appropriate correction.
4. Update the active task and state.
5. Do not discard previous attempts.

### Exit

A corrective implementation step is ready.

### Transition

`FIX → IMPLEMENT` or `BLOCKED` when configured limits are reached.

## DONE / BLOCKED

`DONE` is terminal. It requires all required Acceptance Criteria, passing applicable Verification, passing Review, and required final user acceptance.

`BLOCKED` is terminal for the current run. Use it when safe continuation cannot be established or configured iteration/failure limits are reached. Preserve the state and relevant evidence so a later explicit `/loop` can inspect the reason rather than guessing.

## Resume protocol

If `.loop/state.yaml` contains a non-terminal active run:

1. Load the persisted state.
2. Validate its schema and current phase.
3. Confirm the project root and Git branch are compatible with the recorded context.
4. Read the referenced plan/task/spec/evidence artifacts.
5. Resume only from the persisted phase.
6. Preserve run identity and counters.
7. If state or repository context is inconsistent, stop as `BLOCKED` rather than guessing.

Never use chat history as a substitute for persisted state.

## State transition enforcement

Before every transition, verify:

```text
current state
+ event/result
+ required artifacts/evidence
+ configured limits
→ allowed next state
```

A transition not listed by `loop/schemas/state.yaml` is invalid. Do not skip confirmation gates or jump directly to `DONE`.

Persist state after each meaningful phase boundary and before entering a terminal state. Preserve the same run ID throughout a run.

## Git contract

Capture branch and baseline commit at `INIT`. A dirty baseline does not automatically block the run. Before `DONE`, inspect the diff from that baseline and use it during Review.

Loop does not automatically commit or push unless explicit project policy and user authorization permit it.

## Evidence contract

Evidence is the bridge between work and completion:

```text
Acceptance Criterion
        ↓
Verification / Review
        ↓
Evidence
        ↓
Completion decision
```

An Agent's statement that something works is not Evidence. Use actual project-native results or clearly documented manual verification.

## Safety limits

Honor `loop/config.yaml` limits for iterations, fix attempts, and repeated failures. When a limit is reached, preserve the latest evidence and transition to `BLOCKED` rather than continuing indefinitely.

## Cancellation

If the user explicitly cancels the current Loop run, stop immediately, persist the current state and unresolved criteria, and do not continue execution.
