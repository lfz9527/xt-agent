# Loop v1

Loop is the generic, stateful control layer for autonomous software tasks. The Agent performs work; Loop controls lifecycle, state transitions, permissions, Trust Level, safety limits, approval gates, and evidence.

## Project configuration

Each project has exactly one project-level `.loop` file at its root.

```text
<project-root>
├── .loop                 # 唯一项目级 Loop 配置
├── .loop-state.yaml      # 当前 Loop Runtime 状态
└── .loop-evidence/       # Runtime Evidence
```

The important boundary is:

```text
Project .loop
   │
   ├── Trust Level
   └── Project Permission
          ↓
   Permission Resolver
          ↓
   Effective Permission
          ↓
      Loop Runtime
```

**Trust Level belongs to the project. It does not belong to a Loop run.**

`loop/config.yaml` is the generic Loop default/policy definition. It defines what `low`, `medium`, `high`, and `full` mean, but it does not select a project's Trust Level.

## Trust Level

The project selects its Trust Level in `.loop`:

```yaml
version: 1
trust: high
```

Supported levels:

| Level | Before execution | Before finalize | High-risk actions |
|---|---|---|---|
| `low` | User approval | User approval | Independent confirmation |
| `medium` | Automatic | User approval | Independent confirmation |
| `high` | Automatic | Automatic | Independent confirmation |
| `full` | Automatic | Automatic | Still subject to hard safety boundaries |

Project permissions can use `inherit` to follow the selected Trust Level. Explicit project permissions may tighten the policy, but cannot weaken hard safety boundaries or turn a denied capability into an allowed one.

Trust does not replace capability permissions:

- filesystem: read/write
- shell: execute/dangerous
- Git: read/commit/push
- network: request

High-risk and protected capabilities remain independently governed even at `high` or `full`.

## Runtime state

Runtime state must not contain a second project Trust configuration. It may contain a permission snapshot used for deterministic resume and audit:

```yaml
permission:
  snapshot:
    trustLevel: high
    approval:
      beforeExecution: automatic
      beforeFinalize: automatic
```

The snapshot describes what this run resolved and used. The authoritative Trust Level remains the project's `.loop` file.

If the project Trust changes during an active run, future approval gates use the newly resolved policy. Already completed approvals are not retroactively undone. If the persisted snapshot and project policy are inconsistent in a way that makes safe continuation unclear, the run enters `BLOCKED` rather than guessing.

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
VERIFY / REVIEW / READY_FOR_CONFIRMATION
                  ↓
                 FIX
                  ↓
              IMPLEMENT
```

Loop starts only from an explicit `/loop` invocation. Normal conversation MUST NOT start, resume, or authorize repository modifications through Loop.

## Layer boundaries

```text
skills/loop/SKILL.md
    ↓ Agent execution contract
loop/config.yaml
    ↓ generic Loop defaults and Trust behavior
loop/policies/default.yaml
    ↓ completion, confirmation, evidence, and security defaults
loop/schemas/state.yaml
    ↓ Runtime state model and legal transitions
loop/schemas/evidence.yaml
    ↓ Evidence model
<project>/.loop
    ↓ project Trust and Permission
<project>/.loop-state.yaml
    ↓ current Loop Runtime state
```

The generic Loop implementation MUST NOT contain project-specific business or technology rules.

## State machine

Only transitions defined by `loop/schemas/state.yaml` are valid.

Normal path:

`INIT → GOAL_REVIEW → WAITING_FOR_GOAL_CONFIRMATION → PLAN → IMPLEMENT → VERIFY → REVIEW → READY_FOR_CONFIRMATION → DONE`

Failure paths:

- `VERIFY → FIX → IMPLEMENT`
- `REVIEW → FIX → IMPLEMENT`
- `READY_FOR_CONFIRMATION → FIX → IMPLEMENT`

Any active state may enter `BLOCKED` when safe continuation is impossible, a required permission is denied, or a configured limit is reached.

Approval gates are evaluated through the effective Permission/Trust Policy. A gate may be automatic only when the resolved policy explicitly allows it.

## Project `.loop`

The `.loop` file is the single project-level configuration entry point for Loop. It should contain project-specific Trust and permission overrides rather than a copy of the generic Loop implementation.

Example:

```yaml
# 项目级 Loop 配置。
version: 1

# Trust 是项目属性，不是单次 Loop 运行属性。
trust: low

permissions:
  approval:
    # 跟随项目 Trust Level。
    beforeExecution: inherit
    beforeFinalize: inherit
```

A project should not create another Trust configuration under its Loop runtime state.

## Verification and Evidence

Verification is mandatory; automated testing is optional when inappropriate. Evidence connects Acceptance Criteria to Verification/Review and the completion decision.

An Agent's claim that something works is not sufficient Evidence.

## Git

Capture branch and baseline commit at `INIT`. Before `DONE`, inspect the diff from the baseline. Loop does not automatically commit or push unless explicit project policy and user authorization permit it. Git capability permissions remain independent from Trust Level.

## Safety

Higher Trust reduces interactive approval only where the policy permits it. It does not bypass capability-specific denials, dangerous-operation confirmation, or hard safety boundaries.
