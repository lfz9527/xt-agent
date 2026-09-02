export type RuntimeResourceKind = 'readonly' | 'mutable' | 'protected';

export interface RuntimeResourcePolicy {
  resource: string;
  kind: RuntimeResourceKind;
  /** 允许访问该资源进行修改的 Capability。空数组表示禁止修改。 */
  allowedCapabilities: string[];
}

export interface ResourceMutationContext {
  policy: RuntimeResourcePolicy;
  capability: string;
}

export interface ResourceMutationDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Resource Policy 负责回答“这个资源能不能被修改”。
 * 它不负责并发互斥；并发由 RuntimeResourceLock 负责。
 */
export function evaluateResourceMutation(context: ResourceMutationContext): ResourceMutationDecision {
  const { policy, capability } = context;

  if (policy.kind === 'readonly') {
    return { allowed: false, reason: `resource is readonly: ${policy.resource}` };
  }

  if (policy.kind === 'protected') {
    if (!policy.allowedCapabilities.includes(capability)) {
      return { allowed: false, reason: `resource is protected for capability: ${policy.resource}` };
    }
  }

  if (!policy.allowedCapabilities.includes(capability)) {
    return { allowed: false, reason: `capability cannot modify resource: ${capability}` };
  }

  return { allowed: true, reason: `resource mutation allowed: ${policy.resource}` };
}

/** 项目默认资源策略：代码可修改，Loop 策略与 Git 元数据默认受保护。 */
export const DEFAULT_RESOURCE_POLICIES: RuntimeResourcePolicy[] = [
  {
    resource: 'working-tree',
    kind: 'mutable',
    allowedCapabilities: ['code.modify', 'test.modify', 'artifact.modify'],
  },
  {
    resource: '.loop/config.yaml',
    kind: 'protected',
    allowedCapabilities: ['loop.policy.modify'],
  },
  {
    resource: '.loop/policies',
    kind: 'protected',
    allowedCapabilities: ['loop.policy.modify'],
  },
  {
    resource: '.loop/schemas',
    kind: 'protected',
    allowedCapabilities: ['loop.schema.modify'],
  },
  {
    resource: '.git',
    kind: 'readonly',
    allowedCapabilities: [],
  },
];
