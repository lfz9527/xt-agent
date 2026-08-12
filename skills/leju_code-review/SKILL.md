---
name: leju_code-review
description: 对已修改代码进行专业的代码审查(Code Review)。当用户提到"审查代码"、"Code Review"、"review 代码"、"检查代码"、"CR"、或在提交前要求评估代码质量时使用。自动获取 git 变更，检测技术栈并加载对应审查规则，输出按 P0-P3 严重程度分级的结构化报告和合并建议。
---

# Code Review 技能

基于 `E:\lifangzheng\code-review-rule\rules\` 规则库，对 git diff 变更代码进行系统化审查。

## 审查流程

### 1. 确定审查范围

按以下优先级确定待审查的代码：

1. 用户明确指定的文件路径
2. `git diff --name-only` 获取未暂存变更
3. `git diff --cached --name-only` 获取已暂存变更

对于 git diff：
```bash
git diff --name-only
git diff --cached --name-only
```

如果是用户指定的文件，直接读取文件内容作为审查目标（视同整个文件为变更）。

只审查源代码文件，跳过：
- 构建产物：`dist/`、`build/`、`node_modules/`、`__pycache__/`
- 锁文件：`package-lock.json`、`yarn.lock`、`pnpm-lock.yaml`、`poetry.lock`
- 静态资源：图片、字体、`.svg`、`.css`（除非用户要求）
- 自动生成文件：`.d.ts`（无对应 `.ts` 变更时）、`.gen.*`、`.generated.*`

如果变更文件超过 20 个，提示用户缩小审查范围。

### 2. 检测技术栈

对每个变更文件，用文件名后缀匹配规则库中的技术栈：

| 后缀/特征 | 技术栈 |
|-----------|--------|
| `*.tsx`、`*.jsx` | react |
| `*.ts`（含 NestJS 装饰器）、`*.module.ts`、`*.controller.ts`、`*.service.ts` | nestjs |
| `*.ts`（非 NestJS）、`*.js`、`*.mjs`、`*.cjs` | javascript |
| `*.py` | python |
| `*.tsx`/`*.jsx` + `app/` 或 `pages/` 目录 | nextjs |
| `*.tsx`/`*.jsx` + React Native 特征 | react-native |
| `*.js`/`*.ts` + Electron 特征 | electron |
| ROS 相关文件 | ros |
| Unity 相关文件 | unity |

判断依据：
- 先检查文件名后缀直接匹配
- 再检查 `rules/{stack}/rules.yaml` 中 `meta.detect` 字段的匹配条件
- 同一文件可能匹配多个技术栈时，选择最具体的（如 `.tsx` 优先匹配 react 而非 javascript）

对每个检测到的技术栈，读取对应的规则文件。

### 3. 加载规则

规则目录结构：`E:\lifangzheng\code-review-rule\rules\{stack}/`

每个技术栈包含三个文件：
- `rules.yaml`：语义规则（审查核心，逐条判断）
- `patterns.yaml`：确定性正则（预扫描快速命中）
- `examples.md`：正反示例（辅助理解规则意图）

#### rules.yaml 结构

```yaml
meta:
  prefix: REACT           # 规则 ID 前缀
rules:
  - id: REACT-X01         # 唯一规则 ID
    title: 问题标题
    level: P0             # P0/P1/P2/P3
    root_cause: true      # 是否是根因（用于因果去重）
    causes: []            # 本规则派生的子规则 ID
    detect:               # 命中条件（语义描述）
      - 描述1
      - 描述2
    keywords: []          # 辅助关键词
    safe_patterns: []     # 命中这些则视为安全
    problem: 问题说明
    suggestion: 修复建议
causal_graph:             # 因果关系
  - root: RULE-ID
    causes: [CHILD-ID]
    note: 说明
review_order:             # 审查执行顺序
  - priority: P0
    rules: [ID1, ID2]
```

#### patterns.yaml 结构（可选）

```yaml
rules:
  - id: RULE-ID
    level: P1
    patterns:             # 正则表达式列表
      - "regex pattern"
    excludes:             # 排除模式（误报抑制）
      - "exclude pattern"
    context_lines: 20
```

### 4. 执行审查

#### 第一阶段：patterns 预扫描

对每个变更文件，用对应技术栈的 `patterns.yaml` 中的正则表达式扫描 diff 内容。命中且不被 `excludes` 排除的，标记为候选问题。

#### 第二阶段：语义规则审查

对 `rules.yaml` 中每条规则，**逐条判断**变更代码是否命中 `detect` 字段描述的条件。重点关注：

- 命中 `keywords` 中关键词的代码片段
- 但如果代码包含 `safe_patterns` 中的模式，视为安全、跳过该规则
- 按 `review_order` 中定义的优先级顺序执行（P0 → P1 → P2 → P3）

审查时要结合 diff 的上下文理解代码意图，不要机械匹配。对于 patterns 预扫描命中的代码段要重点检查。

#### 第三阶段：因果去重

根据 `causal_graph` 和每条规则的 `root_cause` / `causes` 字段进行去重：

- 如果根因规则（`root_cause: true`）命中，只报告根因
- 被根因 `causes` 引用的派生规则（`root_cause: false`）写入根因的「影响范围」
- 派生规则仅在未发现其根因时独立报告

#### 第四阶段：补充发现

规则库不可能覆盖所有问题。审查完规则库后，用你的专业知识检查代码是否有以下规则库**未覆盖但同样严重**的问题：

- **性能**：N+1 查询、循环内 I/O、不必要的多次遍历、未使用批量操作、同步阻塞异步上下文
- **空值安全**：可能为 null/undefined 的值直接访问属性或方法
- **错误处理**：异常被静默吞掉（空 catch 块、仅 log 不处理）
- **竞态条件**：异步操作间存在未加锁的共享状态读写
- **输入验证**：用户输入未做基本校验

补充发现的问题，使用 `EXT-{类别}{序号}` 格式作为规则 ID（如 `EXT-P01`、`EXT-N01`），按实际严重程度归入 P0-P3 级别。

补充发现与规则库命中一视同仁——同样影响合并建议公式的计算。

### 5. 输出报告

## 报告结构

严格使用以下模板：

```
# Code Review 报告

## 审查概览
- 审查文件：N 个
- 技术栈：{stack1}, {stack2}
- P0 致命：N 个
- P1 严重：N 个
- P2 一般：N 个
- P3 建议：N 个

## 合并建议

[根据公式输出以下三者之一]

❌ **禁止合并** — 存在 P0 致命问题，必须立即修复
⏳ **修复后合并** — 存在 P1 严重问题，修复后方可合并
✅ **可以合并** — 无阻塞性问题

## 问题详情

### P0 致命 🔴 — 安全/数据损坏，阻塞合并

**[P0] {规则ID} — {标题}**
- 文件：`path/to/file.ts:行号`
- 问题：{problem 字段内容}
- 修复建议：{suggestion 字段内容}
- 影响范围：{派生规则列表，如 REACT-H04, REACT-R04}

### P1 严重 🟠 — 合并前必须修复

（同上格式）

### P2 一般 🟡 — 建议修复，可跟进

（同上格式）

### P3 建议 🔵 — 优化建议

（同上格式）
```

## 合并建议公式

```
P0 数量 > 0              → ❌ 禁止合并
P0 = 0, P1 数量 > 0      → ⏳ 修复 P1 后合并
P0 = 0, P1 = 0           → ✅ 可以合并
```

这是硬性规则，不主观判断。严格按照数量计算。

## 报告原则

- 没有发现问题就直接说"未发现问题"
- 每条问题必须标注：规则 ID、文件路径 + 行号、问题描述、修复建议
- 相同规则命中的多个位置合并为一条，列出所有出现位置
- 修复建议优先使用 `examples.md` 中的正确写法
- 根因规则命中时，派生规则列在「影响范围」而非独立条目
- 不在报告中对用户的选择做主观评判，只陈述技术事实
- patterns 预扫描命中的正则，要在审查时进行语义确认，避免误报
