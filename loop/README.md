# Loop v1

Loop is the generic, stateful control layer for autonomous software tasks.

The Agent performs work. Loop controls lifecycle, state transitions, permissions, safety limits, confirmation gates, and evidence. The current project supplies technical and domain context. The project's `.loop/` workspace persists the run state and project-specific artifacts.

## Principle

Loop is reusable across projects and does not contain business or technology-specific rules. Project requirements, architecture, technology choices, coding conventions, test conventions, and verification methods come from the current project.

## Trigger

Loop starts **only** when the user explicitly invokes `/loop`.

Normal conversation MUST NOT start, resume, or authorize repository modifications through Loop.

## Flow

```text
/loop
  ↓
INIT
  ↓
GOAL_REVIEW
  ↓
WAITING_FOR_GOAL_CONFIRMATION
  ↓
PLAN
  ↓
IMPLEMENT
  ↓
VERIFY
  ↓
REVIEW
  ↓
READY_FOR_CONFIRMATION
  ↓
DONE
```

Failure paths:

```text
VERIFY / REVIEW
       ↓
      FIX
       ↓
  IMPLEMENT
```

If execution cannot safely continue, the run enters `BLOCKED`.

Test-first is a project/policy-controlled behavior inside the execution flow; it is not a mandatory global phase.

## Permission and trust

Confirmation is an **approval permission**, not a separate execution mode.

Loop defaults to a low-trust policy. Users can explicitly raise the trust level when they want less interactive approval.

```text
Trust Level
    ↓
Permission Policy
    ↓
Approval Required?
    ↓
State Machine
```

Default configuration:

```yaml
trust:
  level: low
```

The default `low` trust level requires approval before implementation and before final completion.

Supported trust levels:

| Level | Before execution | Before finalize | High-risk actions |
|---|---|---|---|
| `low` | User approval | User approval | Independent confirmation |
| `medium` | Automatic | User approval | Independent confirmation |
| `high` | Automatic | Automatic | Independent confirmation |
| `full` | Automatic | Automatic | Still subject to hard safety boundaries |

Trust is a **default authorization policy**, not an override for safety. High-risk operations such as dangerous shell commands, production-impacting actions, or other explicitly protected capabilities remain governed by their own permissions.

Permission categories may include filesystem, shell, Git, network, and other Agent capabilities. The approval policy determines whether a confirmation gate pauses execution; capability-specific policies determine whether an action is allowed at all.

## Runtime model

Loop is state-driven. The Agent must inspect the current persisted state before taking action.

```text
load state
  ↓
validate state + project context + permissions
  ↓
execute current phase
  ↓
check exit conditions
  ↓
record artifacts/evidence
  ↓
validate transition + approval policy
  ↓
persist state
```

Every phase has:

- Entry conditions
- Allowed actions
- Required artifacts/evidence
- Exit conditions
- Allowed transitions
- Applicable permission/approval checks

The Agent MUST NOT perform actions belonging to a later phase early merely because they seem useful.

## Layer boundaries

```text
skills/loop/SKILL.md
    ↓ Agent execution contract
loop/config.yaml
    ↓ generic policy, permissions, trust, and safety limits
loop/schemas/state.yaml
    ↓ state + permission state model and legal transitions
loop/schemas/evidence.yaml
    ↓ default evidence model
<project>/.loop/
    ↓ actual run state and artifacts
```

The generic Loop implementation lives in `loop/` and `skills/loop/`. It MUST NOT contain project-specific plans, tasks, specs, or evidence.

## Project context

At `INIT`, the Agent identifies the current project root and loads applicable project instructions, relevant skills, source code, tests, documentation, and existing `.loop/` artifacts.

Project context is authoritative for technical and domain decisions. Loop does not assume a language, framework, test runner, file naming convention, architecture, or verification tool.

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

### Artifact responsibilities

- `state.yaml`: machine-readable current run state, phase, task, counters, Acceptance Criteria, permission/trust state, verification/review status, and Git baseline.
- `plans/`: Goal, Acceptance Criteria, plan, and relevant project context.
- `tasks/`: actionable task breakdown and progress when persistent task records are useful.
- `specs/`: detailed design/specification artifacts when needed.
- `evidence/`: verification and review evidence associated with Acceptance Criteria.

## Phase contract

The detailed phase execution contract is defined by `skills/loop/SKILL.md`.

### INIT

Load project context, inspect existing `.loop/` state, establish the Git baseline, and create or resume a valid run state and permission context.

### GOAL_REVIEW

Define Goal, Acceptance Criteria, verification strategy, and high-level plan. Persist the plan when needed.

### WAITING_FOR_GOAL_CONFIRMATION

Evaluate the `beforeExecution` approval permission. At `low` trust, wait for explicit user approval. At a trust level that grants automatic approval, pass the gate without interactive confirmation. No implementation-file modifications are allowed in this phase.

### PLAN

Turn the confirmed Goal into actionable tasks, select relevant project skills, and finalize the verification approach.

### IMPLEMENT

Execute the current task according to project context and applicable skills. Respect project-specific test-first rules and capability permissions.

### VERIFY

Run the project's appropriate verification methods and persist meaningful Evidence. Testing is one possible verification method, not a universal requirement.

### REVIEW

Review Acceptance Criteria, Evidence, project rules, implementation quality, and the Git diff from the baseline.

### READY_FOR_CONFIRMATION

Evaluate the `beforeFinalize` approval permission. At `low` or `medium` trust, wait for the configured user acceptance. At `high` or `full` trust, the gate may be automatically accepted when all completion conditions pass. User rejection always sends the run to `FIX` with actionable feedback.

### DONE

Terminal state. It requires all required Acceptance Criteria, passing applicable verification, passing Review, and the applicable final approval policy.

### BLOCKED

Terminal state for unsafe continuation, invalid state/context, denied permissions, or configured safety limits. Preserve the state and evidence so a later explicit `/loop` can diagnose the reason.

## State transitions

Only transitions defined by `loop/schemas/state.yaml` are valid. The normal path is:

`INIT → GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION → DONE`

Failure paths are:

- `VERIFY → FIX → IMPLEMENT`
- `REVIEW → FIX → IMPLEMENT`
- `READY_FOR_CONFIRMATION → FIX → IMPLEMENT` after user rejection with actionable feedback

Any active state may transition to `BLOCKED` when safe continuation is impossible, a required permission is denied, or a configured limit is reached.

Confirmation gates must be evaluated through the permission policy. A gate may be automatically passed only when the configured trust/approval policy explicitly allows it.

## Resume

If `.loop/state.yaml` contains a non-terminal active run:

1. Load and validate the state.
2. Validate the current project root and Git branch against recorded context.
3. Validate persisted trust and approval state against the applicable Loop policy.
4. Read referenced plan/task/spec/evidence artifacts.
5. Resume only from the persisted phase.
6. Preserve run identity and counters.
7. Enter `BLOCKED` instead of guessing when state, permission, or repository context is inconsistent.

Chat history is not a substitute for persisted Loop state.

## Git baseline

Capture branch and baseline commit at `INIT`. A dirty baseline does not automatically block a run; it is recorded so pre-existing changes can be distinguished from Loop changes.

Before completion, inspect the diff against the baseline. Loop does not automatically commit or push unless explicit project policy and user authorization permit it.

## Verification and Evidence

Verification is mandatory; automated testing is optional when inappropriate.

Follow project-native verification conventions. Possible methods include tests, builds, type checks, lint/static analysis, documentation checks, configuration validation, manual checks, or other project-defined validation.

Evidence should connect:

```text
Acceptance Criterion
        ↓
Verification / Review
        ↓
Evidence
        ↓
Completion decision
```

An Agent's claim that something works is not sufficient Evidence. Failed Evidence should be preserved when relevant to later FIX iterations.

## Safety

Honor `loop/config.yaml` limits for iterations, fix attempts, repeated failures, permissions, and high-risk actions. When a limit is reached or a required permission is denied, preserve the latest evidence and enter `BLOCKED` rather than continuing indefinitely.

## Business agnostic

Business requirements and project-specific implementation details belong to the current project/task, not to the generic Loop implementation.
