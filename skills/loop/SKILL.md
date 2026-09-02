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
- `loop/config.yaml`: generic policies, limits, permissions, Trust Level, confirmation requirements, and defaults.
- `loop/policies/default.yaml`: default completion, evidence, confirmation, failure, and security rules.
- `loop/schemas/state.yaml`: state data model, persisted permission/trust state, and legal transitions.
- `loop/schemas/evidence.yaml`: default evidence data model.
- `<project>/.loop/`: persistent state and project-specific artifacts.

Loop is business- and technology-agnostic. Do not encode framework, language, test framework, file naming, architecture, or domain rules into the generic Loop implementation.

## Trust Level and Permission

Confirmation is an **approval permission**, not a separate execution mode.

Loop defaults to `low` trust. Users may explicitly raise the Trust Level when they want less interactive approval. Trust Level changes the default approval behavior across the entire Loop lifecycle; it must not be implemented as a single special case in one phase.

```text
Trust Level
    ↓
Permission Policy
    ↓
Effective Approval Policy
    ↓
State Machine + Completion Policy
```

### Trust resolution

1. Read the persisted `permission.trust.level` when resuming a run; otherwise initialize from `loop/config.yaml`.
2. Resolve `permissions.approval.beforeExecution` and `permissions.approval.beforeFinalize`.
3. When the permission value is `inherit`, use the corresponding policy from the selected Trust Level.
4. Persist the **effective** approval result in `permission.approval.*` so resume behavior is deterministic.
5. Capability-specific permissions and hard safety boundaries always remain authoritative. Trust Level MUST NOT turn a denied or protected high-risk action into an allowed action.
6. If Trust Level or permission state is invalid or inconsistent, enter `BLOCKED` instead of guessing.

Supported defaults:

| Trust Level | Before execution | Before finalize | High-risk actions |
|---|---|---|---|
| `low` | User approval | User approval | Independent confirmation |
| `medium` | Automatic | User approval | Independent confirmation |
| `high` | Automatic | Automatic | Independent confirmation |
| `full` | Automatic | Automatic | Still subject to hard safety boundaries |

### Changing Trust Level

A Trust Level change affects **all approval gates governed by Trust**, not only the current phase. The Agent MUST re-resolve the effective approval policy before evaluating the next approval gate.

A persisted run must retain the Trust Level and effective approval state used for that run. If the user explicitly changes Trust Level during a run, record the new level and re-resolve future gates according to the new policy; do not retroactively treat an already completed approval event as undone.

## Runtime contract

When `/loop` starts or resumes, treat the persisted project state as the runtime source of truth:

```text
load state
  ↓
validate state + Trust/Permission
  ↓
validate current project/Git context
  ↓
execute current phase
  ↓
check exit condition
  ↓
record artifacts/evidence
  ↓
resolve effective approval policy
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
6. Resolve the Trust Level and approval policy from configuration and permissions.
7. Create/update `.loop/state.yaml` using `loop/schemas/state.yaml` when no project-specific state convention exists.

### Exit

Project context is sufficient to perform Goal Review and state contains a valid run identity, Git baseline, and permission/trust context.

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

The user has been shown the Goal, plan, and Acceptance Criteria and the run is ready for the execution approval policy.

### Transition

`GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION` or `BLOCKED`.

## WAITING_FOR_GOAL_CONFIRMATION

### Entry

Goal Review is complete and the effective `beforeExecution` approval policy has been resolved.

### Actions

- If `beforeExecution: required`, wait for explicit user confirmation. Do not modify implementation files.
- If `beforeExecution: automatic`, pass the gate without interactive confirmation and continue.
- If the policy denies the required capability or is invalid, enter `BLOCKED`.

### Exit

The execution approval gate has passed according to the effective Permission/Trust Policy.

### Transition

`WAITING_FOR_GOAL_CONFIRMATION → PLAN` or `BLOCKED`.

## PLAN

### Entry

The execution approval policy has passed.

### Actions

Turn the confirmed Goal into actionable tasks using project conventions. Select relevant project skills and define the verification approach. If test-first is required by project policy, identify the appropriate project-native test artifacts before implementation.

Persist task/spec artifacts when needed.

### Exit

Tasks are actionable, required skills are known, and the verification strategy is defined.

### Transition

`PLAN → IMPLEMENT` or `BLOCKED`.

## IMPLEMENT

### Entry

Goal approval and planning are complete.

### Actions

Execute only the current task using project context and relevant skills. Respect the project's coding conventions and capability permissions.

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

All required Acceptance Criteria have passing evidence and Review has passed. The effective `beforeFinalize` approval policy has been resolved.

### Actions

Present the result and evidence summary.

- If `beforeFinalize: required`, wait for explicit user acceptance.
- If `beforeFinalize: automatic`, pass the final approval gate automatically when all other completion conditions pass.
- Never treat the Agent's own claim as user acceptance evidence.
- User rejection always sends the run to `FIX` with actionable feedback.

### Exit

The final approval gate has passed according to the effective Permission/Trust Policy, or the user has rejected the result with actionable feedback.

### Transition

- accepted/automatic approval → `DONE`
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

`DONE` is terminal. It requires all required Acceptance Criteria, passing applicable Verification, passing Review, and satisfaction of the applicable final approval policy. The policy may be automatic at a higher Trust Level; it must not be interpreted as mandatory human confirmation.

`BLOCKED` is terminal for the current run. Use it when safe continuation cannot be established or configured iteration/failure limits are reached. Preserve the state and relevant evidence so a later explicit `/loop` can inspect the reason rather than guessing.

## Resume protocol

If `.loop/state.yaml` contains a non-terminal active run:

1. Load the persisted state.
2. Validate its schema and current phase.
3. Validate the persisted Trust Level and effective approval state.
4. Confirm the project root and Git branch are compatible with the recorded context.
5. Read the referenced plan/task/spec/evidence artifacts.
6. Re-resolve future approval gates using the current applicable policy.
7. Resume only from the persisted phase.
8. Preserve run identity and counters.
9. If state, Trust Level, permission, or repository context is inconsistent, stop as `BLOCKED` rather than guessing.

Never use chat history as a substitute for persisted state.

## State transition enforcement

Before every transition, verify:

```text
current state
+ event/result
+ required artifacts/evidence
+ effective Trust/Permission policy
+ configured limits
→ allowed next state
```

A transition not listed by `loop/schemas/state.yaml` is invalid. Do not skip a required approval gate or jump directly to `DONE`.

Persist state after each meaningful phase boundary and before entering a terminal state. Preserve the same run ID throughout a run.

## Git contract

Capture branch and baseline commit at `INIT`. A dirty baseline does not automatically block the run. Before `DONE`, inspect the diff from that baseline and use it during Review.

Loop does not automatically commit or push unless explicit project policy and user authorization permit it. Capability-specific Git permissions remain independent from Trust Level.

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
        ↓
Effective final approval policy
```

An Agent's statement that something works is not Evidence. Use actual project-native results or clearly documented manual verification.

## Safety limits

Honor `loop/config.yaml` limits for iterations, fix attempts, repeated failures, permissions, Trust Level, and high-risk actions. Trust Level may reduce interactive approval but MUST NOT bypass hard safety boundaries or capability-specific denials. When a limit is reached, preserve the latest evidence and transition to `BLOCKED` rather than continuing indefinitely.

## Cancellation

If the user explicitly cancels the current Loop run, stop immediately, persist the current state, Trust Level, effective approval state, and unresolved criteria, and do not continue execution.
