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

## Execution contract

Once `/loop` is explicitly invoked, run the following state machine:

`INIT → PLAN → IMPLEMENT → VERIFY → REVIEW → COMPLETE`

When verification or review fails:

`VERIFY/REVIEW → FIX → IMPLEMENT → VERIFY`

Terminate as `BLOCKED` when the configured safety limits are reached.

## Completion rule

Never treat the Agent's claim of completion as sufficient evidence.

`DONE` requires:

1. Every required acceptance criterion has passing evidence.
2. Required verification passes.
3. Review passes.
4. No configured Loop safety limit has been exceeded.

Use `loop/config.yaml` and `loop/policies/default.yaml` as the v1 policy source.

## Context

Before implementation:

1. Read `AGENTS.md`.
2. Read the relevant existing code and project conventions.
3. Convert the user's request into a Task and explicit Acceptance Criteria.
4. Establish the current Git state as the Loop baseline.

During verification, prefer project-native commands such as:

- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`

Record each result as Evidence associated with an Acceptance Criterion.

## Failure handling

When a verifier fails:

1. Preserve the failure output.
2. Associate it with the relevant criterion when possible.
3. Pass the failure and relevant context into the next FIX iteration.
4. Do not discard previous failed attempts.
5. Stop with `BLOCKED` after the configured repeated-failure or iteration limit.

## User cancellation

If the user explicitly asks to stop/cancel the current Loop run, stop the Loop immediately and report the current state and unresolved criteria.
