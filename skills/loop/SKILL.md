---
name: loop
description: Run the project Loop v1 workflow. This skill is ONLY activated by an explicit user `/loop` invocation. Never start Loop, modify files, or continue a Loop run from an ordinary message.
---

# Loop v1

Loop is a generic, stateful execution protocol. The Agent performs work; Loop controls lifecycle and safety; project context supplies technical/domain rules.

## Project configuration boundary

Each project has exactly one project-level `.loop` file at its root. `.loop` is the authoritative source for that project's Trust Level and project-specific Loop permissions.

```text
<project-root>/.loop
        │
        ├── trust
        └── permissions
              ↓
       Permission Resolver
              ↓
       Effective Permission
              ↓
         Loop Runtime
```

Trust belongs to the project, not to a Loop run. Do not create or maintain a second project Trust configuration under Loop Runtime.

`loop/config.yaml` contains generic Trust Level behavior and Loop defaults; it does not select the Trust Level for a project.

## Trigger

Loop starts **only** from an explicit `/loop` invocation. Normal conversation MUST NOT start, resume, or authorize repository modifications through Loop.

## Trust Level and Permission

Confirmation is an **approval permission**, not a separate execution mode.

The project `.loop` file selects the Trust Level. Supported levels are:

| Trust Level | Before execution | Before finalize | High-risk actions |
|---|---|---|---|
| `low` | User approval | User approval | Independent confirmation |
| `medium` | Automatic | User approval | Independent confirmation |
| `high` | Automatic | Automatic | Independent confirmation |
| `full` | Automatic | Automatic | Still subject to hard safety boundaries |

Resolution order:

```text
Project .loop Trust
      ↓
Project Permission Policy
      ↓
Generic Loop Trust Policy
      ↓
Effective Permission
      ↓
State Machine + Completion Policy
```

`inherit` means the project permission follows the selected Trust Level. An explicit project approval policy may require additional confirmation, but it MUST NOT weaken hard safety boundaries or turn a denied capability into an allowed one.

Capability permissions remain independent of Trust:

- filesystem: read/write
- shell: execute/dangerous
- Git: read/commit/push
- network: request

High-risk or explicitly protected capabilities remain governed by their own policies even at `high` or `full` Trust Level.

## Runtime contract

Runtime state records a **permission snapshot**, not a second Trust configuration:

```yaml
permission:
  snapshot:
    trustLevel: high
    approval:
      beforeExecution: automatic
      beforeFinalize: automatic
```

`permission.snapshot.trustLevel` is historical/audit state for this run. The authoritative project Trust remains `.loop`.

When `/loop` starts:

1. Locate the project root.
2. Load the single project `.loop` file.
3. Resolve its Trust Level and project permissions against generic Loop policy.
4. Persist the resulting permission snapshot in runtime state.
5. Continue through the state machine.

When resuming, validate the persisted snapshot and current project configuration. If they are inconsistent in a way that affects safe execution, enter `BLOCKED` rather than guessing.

If the user explicitly changes the project Trust Level during an active run, record the new project configuration and re-resolve future approval gates. Already completed approval events are not retroactively undone.

## State machine

Normal path:

`INIT → GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION → DONE`

Failure paths:

- `VERIFY → FIX → IMPLEMENT`
- `REVIEW → FIX → IMPLEMENT`
- `READY_FOR_CONFIRMATION → FIX → IMPLEMENT`

Any active state may enter `BLOCKED` when safe continuation is impossible or a configured limit/permission prevents continuation.

Every transition MUST be validated against `loop/schemas/state.yaml`.

## Phase rules

### INIT

- Require an explicit `/loop` invocation.
- Identify project root and load `AGENTS.md`, relevant skills, source, tests, documentation, and the single project `.loop` file.
- Inspect existing runtime state and resume when an active run exists.
- Capture Git branch and baseline commit.
- Resolve project Trust and Permission and create the runtime permission snapshot.

### GOAL_REVIEW

Define Goal, Acceptance Criteria, verification strategy, and high-level plan. Persist required plan artifacts.

### WAITING_FOR_GOAL_CONFIRMATION

Evaluate `beforeExecution` from the effective Permission/Trust Policy.

- `required`: wait for explicit user confirmation; do not modify implementation files.
- `automatic`: pass the gate without interactive confirmation.

### PLAN

Turn the confirmed Goal into actionable tasks and finalize verification strategy using project conventions.

### IMPLEMENT

Execute only the current task. Respect project rules, capability permissions, and applicable Test First policies.

### VERIFY

Run project-native verification. Testing is optional when inappropriate; verification is not optional. Persist meaningful Evidence and preserve failures for FIX.

### REVIEW

Review Acceptance Criteria, Evidence, project rules, implementation quality, scope, and Git diff.

### READY_FOR_CONFIRMATION

Evaluate `beforeFinalize` from the effective Permission/Trust Policy.

- `required`: wait for explicit user acceptance.
- `automatic`: pass when all other completion conditions are satisfied.
- User rejection sends the run to `FIX` with actionable feedback.

### DONE

Terminal state. Requires required Acceptance Criteria, applicable Verification, Review, and the applicable final approval policy. Final approval may be automatic at a higher Trust Level; human confirmation is not universally mandatory.

### BLOCKED

Terminal state for unsafe continuation, invalid state/context, denied permissions, or configured safety limits. Preserve state and evidence.

## Resume protocol

1. Load `.loop-state.yaml` and validate its schema.
2. Validate the project root and Git context.
3. Load the project's single `.loop` file.
4. Validate the persisted permission snapshot against the applicable project policy.
5. Re-resolve future approval gates.
6. Read referenced artifacts and resume only from the persisted phase.
7. Preserve run identity and counters.
8. Enter `BLOCKED` instead of guessing when state, project Trust/Permission, or repository context is inconsistent.

Never use chat history as a substitute for persisted state.

## Safety

Trust Level only reduces interactive approval where policy permits it. It MUST NOT bypass capability-specific denials, dangerous-operation confirmation, or hard safety boundaries.

Loop does not automatically commit or push unless explicit project policy and user authorization permit it. Capability-specific Git permissions remain independent from Trust Level.

## Cancellation

If the user explicitly cancels the current Loop run, stop immediately, persist runtime state and the current permission snapshot, and do not continue execution.
