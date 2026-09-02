import { execFileSync } from 'node:child_process';

export interface GitBaseline {
  commit: string;
  branch: string;
  worktreeFingerprint: string;
}

export interface GitConsistencyResult {
  consistent: boolean;
  reason: string;
  current: GitBaseline;
}

/** INIT 时捕获 Git 基线；Runtime 不允许凭“自己记得改了什么”判断工作区安全。 */
export function captureGitBaseline(cwd: string): GitBaseline {
  const commit = git(cwd, ['rev-parse', 'HEAD']);
  const branch = git(cwd, ['branch', '--show-current']);
  return {
    commit,
    branch,
    worktreeFingerprint: worktreeFingerprint(cwd),
  };
}

/**
 * 每次执行共享工作区前重新计算 Fingerprint。
 * 只要出现 Loop 未登记的漂移，Runtime 必须阻断，而不是猜测变更归属。
 */
export function verifyGitBaseline(cwd: string, baseline: GitBaseline, expectedWorktreeFingerprint?: string): GitConsistencyResult {
  const current = captureGitBaseline(cwd);
  if (current.branch !== baseline.branch) {
    return { consistent: false, reason: 'git branch changed since run baseline', current };
  }
  if (expectedWorktreeFingerprint && current.worktreeFingerprint !== expectedWorktreeFingerprint) {
    return { consistent: false, reason: 'git worktree changed outside the expected mutation state', current };
  }
  return { consistent: true, reason: 'git baseline is consistent', current };
}

/** 仅使用 Git 原生状态输出生成稳定指纹，避免依赖平台特定文件时间。 */
export function worktreeFingerprint(cwd: string): string {
  return git(cwd, ['status', '--porcelain=v1', '--untracked-files=all']);
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error(`[LOOP_BLOCKED] git command failed: git ${args.join(' ')}`);
  }
}
