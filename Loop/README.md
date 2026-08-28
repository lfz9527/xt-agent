# Loop v1

Loop is the project-level control layer for autonomous software tasks.

Loop does not contain or depend on business-specific task definitions. It defines only the execution protocol, state machine, confirmation gates, evidence rules, and failure/retry policy.

## Principle

The Agent performs work; verification and review provide evidence; the user remains in control of the goal and final acceptance.

## Trigger

Loop may start **only** when the user explicitly invokes `/loop`.

Normal conversation MUST NOT start Loop or authorize repository modifications through Loop.

## Flow

`/loop → Goal Review → User Confirmation → Test Design → Write Tests → Implement → Verify → Review → Result Review → User Confirmation → Done`

Verification or review failures enter `Fix → Implement → Verify`.

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
3. Create or modify test files (`*.spec.ts`, `*.e2e-spec.ts`, etc.) **before** implementation files.
4. During the test phase, implementation files must not be created or modified.
5. After the test phase is complete, implementation files may be created or modified.
6. Run the tests and make the implementation pass.

Loop v1 does not require artificially creating an executable RED state when the implementation file does not exist. Do not create temporary Stub/Mock implementations merely to manufacture RED.

## Completion

Agent claims are never sufficient for completion. Technical completion requires valid evidence for all required acceptance criteria, verification, and review. Final `DONE` additionally requires explicit user acceptance.

## ZCode integration

ZCode is treated as an Agent Executor. Loop owns goal confirmation, state, acceptance criteria, evidence, retry policy, and completion decisions.

Loop is business-agnostic: business requirements belong to the caller/task, not to this directory.