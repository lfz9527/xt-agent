export type RuntimeResourceKind = 'readonly' | 'mutable' | 'protected' | 'runtime-owned' | 'run-private';

export interface RuntimeResourcePolicy {
  /** 文件/目录路径或 Glob，例如 `src/**/*.ts`。 */
  resource: string;
  kind: RuntimeResourceKind;
  /** 允许访问该资源进行修改的 Capability。空数组表示禁止修改。 */
  allowedCapabilities: string[];
}

export interface ResourceMutationContext {
  policy: RuntimeResourcePolicy;
  capability: string;
  path?: string;
}

export interface ResourceMutationDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Resource Policy 负责回答“这个具体路径能不能被修改”。
 * 它不负责并发互斥；并发由 RuntimeResourceLock 负责。
 */
export function evaluateResourceMutation(context: ResourceMutationContext): ResourceMutationDecision {
  const { policy, capability, path = policy.resource } = context;

  if (!matchesResource(policy.resource, path)) {
    return { allowed: false, reason: `resource policy does not match path: ${path}` };
  }

  if (policy.kind === 'readonly' || policy.kind === 'runtime-owned') {
    return { allowed: false, reason: `resource is ${policy.kind}: ${path}` };
  }

  if (!policy.allowedCapabilities.includes(capability)) {
    return { allowed: false, reason: `capability cannot modify resource: ${capability}` };
  }

  return { allowed: true, reason: `resource mutation allowed: ${path}` };
}

/** 将受控 Glob 转换为正则；不依赖额外 npm 包，避免策略层引入运行时依赖。 */
export function matchesResource(pattern: string, path: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const normalizedPath = normalizePath(path);
  let regex = '';
  for (let i = 0; i < normalizedPattern.length; i += 1) {
    const char = normalizedPattern[i];
    if (char === '*' && normalizedPattern[i + 1] === '*') {
      i += 1;
      if (normalizedPattern[i + 1] === '/') {
        i += 1;
        regex += '(?:.*/)?';
      } else {
        regex += '.*';
      }
    } else if (char === '*') {
      regex += '[^/]*';
    } else {
      regex += /[.+^${}()|[\]\\?]/.test(char) ? `\\${char}` : char;
    }
  }
  return new RegExp(`^${regex}$`).test(normalizedPath);
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/** 项目默认资源策略：代码按路径修改，Loop 配置/Schema 受保护，Runtime 由引擎独占。 */
export const DEFAULT_RESOURCE_POLICIES: RuntimeResourcePolicy[] = [
  {
    resource: 'src/**/*.ts',
    kind: 'mutable',
    allowedCapabilities: ['code.modify'],
  },
  {
    resource: 'src/**/*.js',
    kind: 'mutable',
    allowedCapabilities: ['code.modify'],
  },
  {
    resource: 'test/**/*.spec.ts',
    kind: 'mutable',
    allowedCapabilities: ['test.modify'],
  },
  {
    resource: '.loop/config.yaml',
    kind: 'protected',
    allowedCapabilities: ['loop.policy.modify'],
  },
  {
    resource: '.loop/policies/**',
    kind: 'protected',
    allowedCapabilities: ['loop.policy.modify'],
  },
  {
    resource: '.loop/schemas/**',
    kind: 'protected',
    allowedCapabilities: ['loop.schema.modify'],
  },
  {
    resource: '.loop/runtime/**',
    kind: 'runtime-owned',
    allowedCapabilities: [],
  },
  {
    resource: '.loop/plans/**',
    kind: 'run-private',
    allowedCapabilities: ['artifact.modify'],
  },
  {
    resource: '.loop/specs/**',
    kind: 'run-private',
    allowedCapabilities: ['artifact.modify'],
  },
  {
    resource: '.loop/evidence/**',
    kind: 'run-private',
    allowedCapabilities: ['artifact.modify'],
  },
  {
    resource: '.loop/reviews/**',
    kind: 'run-private',
    allowedCapabilities: ['artifact.modify'],
  },
  {
    resource: '.git/**',
    kind: 'readonly',
    allowedCapabilities: [],
  },
];
