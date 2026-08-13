---
name: mysql-table-designer
description: 当用户明确要求设计 MySQL 数据库表时使用此技能。触发关键词：「设计表」「设计数据库表」「创建表结构」「建表」「数据库设计」「设计XX表」「XX系统的数据库」「DDL」等。输出完整的 CREATE TABLE DDL 语句，包含索引、外键约束、默认值、注释和建表规范。只要用户提到要设计数据库表结构，就应该使用此技能。
---

# MySQL 数据库表设计

根据用户的需求设计 MySQL 数据库表，输出可直接执行的 DDL 语句。

## 设计流程

1. **理解需求** — 先和用户确认业务场景、核心实体和字段。如果用户描述不完整，主动追问关键字段和业务关系
2. **规划表结构** — 确定需要哪些表、每张表有哪些字段、表之间的关系
3. **输出 DDL** — 按规范输出完整 CREATE TABLE 语句，每条语句以分号结尾

## 三大范式约束

设计每张表时必须满足以下范式，这是数据库设计的底线：

### 第一范式（1NF）— 字段原子性

每个字段的值必须是不可再分的原子值。不能在一个字段中存放多个值或可拆分的数据。

**❌ 违反 1NF：**
```sql
-- 错误：一个字段存多个值
`tags` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '标签，英文逗号分隔'
-- 错误：字段可再拆分
`address` VARCHAR(200) COMMENT '完整地址，如：广东省深圳市南山区科技园'
```

**✅ 符合 1NF：**
```sql
-- 多值拆为独立表
CREATE TABLE `tags` ( ... );
CREATE TABLE `article_tags` (
    `article_id` BIGINT UNSIGNED NOT NULL,
    `tag_id` BIGINT UNSIGNED NOT NULL,
    ...
);
-- 地址拆分为原子字段
`province` VARCHAR(20),
`city` VARCHAR(30),
`district` VARCHAR(30),
`detail` VARCHAR(100)
```

### 第二范式（2NF）— 消除部分依赖

在满足 1NF 的基础上，非主键字段必须完全依赖于主键的全部，而不是部分。

由于本规范统一使用单列自增主键，2NF 天然满足。但如果遇到联合主键的关联表，需特别注意：关联表的所有附加字段必须同时依赖联合主键的所有列。

**❌ 违反 2NF：**
```sql
-- 联合主键 (student_id, course_id)，但 credit 只依赖 course_id，不依赖 student_id
CREATE TABLE `student_courses` (
    `student_id` BIGINT UNSIGNED NOT NULL,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `course_name` VARCHAR(100) NOT NULL,   -- 只依赖 course_id，应放在 courses 表
    `credit` DECIMAL(3,1) NOT NULL,        -- 只依赖 course_id，应放在 courses 表
    `score` DECIMAL(5,2) NOT NULL,         -- 依赖全部主键，保留
    PRIMARY KEY (`student_id`, `course_id`)
);
```

**✅ 符合 2NF：**
```sql
-- course_name、credit 移到 courses 表
CREATE TABLE `student_courses` (
    `student_id` BIGINT UNSIGNED NOT NULL,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `score` DECIMAL(5,2) NOT NULL COMMENT '成绩',
    PRIMARY KEY (`student_id`, `course_id`)
);
```

### 第三范式（3NF）— 消除传递依赖

在满足 2NF 的基础上，非主键字段不能通过另一个非主键字段间接依赖于主键。每个非主键字段必须直接依赖主键。

**❌ 违反 3NF：**
```sql
-- user_id → dept_id → dept_name（dept_name 通过 dept_id 间接依赖主键）
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `dept_id` BIGINT UNSIGNED NOT NULL,
    `dept_name` VARCHAR(50) NOT NULL,  -- 传递依赖！应放在 departments 表
    `dept_manager` VARCHAR(50) NOT NULL, -- 传递依赖！
    PRIMARY KEY (`id`)
);
```

**✅ 符合 3NF：**
```sql
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `dept_id` BIGINT UNSIGNED NOT NULL COMMENT '部门ID',
    -- dept_name、dept_manager 移到 departments 表，通过 dept_id 关联
    PRIMARY KEY (`id`)
);
```

### 检查清单

输出 DDL 之前，逐项确认：

- [ ] 是否存在用逗号/分隔符拼接的字段？→ 拆表或拆字段
- [ ] 是否存在"省市区"、"年月日"等可拆分的复合字段？→ 拆为独立字段
- [ ] 联合主键表中，是否存在只依赖部分主键的字段？→ 移回所属表
- [ ] 是否存在能通过其他字段推导出的字段？→ 移回所属表

---

## 输出规范

每条 CREATE TABLE 语句必须包含以下全部要素，缺一不可：

- 字段名、类型、是否允许 NULL
- 主键（统一 `BIGINT UNSIGNED AUTO_INCREMENT`）
- 字段默认值（不允许为空的字段给合理默认值）
- 每个字段的 COMMENT 注释
- 合适的索引（普通索引、唯一索引、联合索引）
- 表 COMMENT 注释

## 命名规范

遵循 MySQL 社区惯例：

| 对象 | 规范 | 示例 |
|------|------|------|
| 表名 | 小写蛇形，复数 | `users`、`order_items` |
| 字段名 | 小写蛇形 | `user_id`、`created_at` |
| 主键 | 统一 `id` | `id` |
| 外键 | `关联表_字段` | `user_id`、`order_id` |
| 普通索引 | `idx_字段名` | `idx_email`、`idx_status` |
| 联合索引 | `idx_字段1_字段2` | `idx_user_id_status` |
| 唯一索引 | `uk_字段名` | `uk_email`、`uk_mobile` |

索引命名不加表名前缀，因为索引本身在表内，写 SQL 时自然知道是哪个表的索引。

## 字段类型约定

这些是经过验证的最佳实践，按此执行可避免常见坑：

- **主键**：`BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` — 用 INT 迟早会遇到溢出
- **变长字符串**：`VARCHAR(N)`，N 按实际需要设定，不确定时问用户
- **长文本**：`TEXT`，不设默认值（MySQL 不支持 TEXT 设默认值）
- **金额**：`DECIMAL(18,2)` — 绝不用 FLOAT/DOUBLE，精度丢失是会计灾难
- **状态/类型**：`TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 1=启用 2=禁用'` — 枚举含义写在注释里
- **布尔值**：`TINYINT NOT NULL DEFAULT 0 COMMENT '是否XX: 0=否 1=是'`
- **时间**：`DATETIME NOT NULL` — 不用 TIMESTAMP，2038 年溢出问题
- **created_at**：`DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- **updated_at**：`DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
- **软删除**：`DATETIME DEFAULT NULL`（字段名 `deleted_at`），不需要则不添加
- **JSON 数据**：`JSON` 类型（MySQL 5.7+ 原生支持，比 TEXT 存 JSON 更优）

## 表固定配置

每张表的末尾统一使用：

```sql
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='表注释';
```

- InnoDB：支持事务、行锁、外键
- utf8mb4：支持 emoji 和所有 Unicode 字符
- utf8mb4_unicode_ci：排序准确，不区分大小写

## 外键与约束

- 关联表外键字段命名：`关联表名单数_id`，如 `user_id`、`category_id`
- 外键类型始终与关联表主键类型一致（BIGINT UNSIGNED）
- 是否添加 `FOREIGN KEY` 约束根据场景决定：
  - 需要数据库层面保证引用完整性 → 加外键约束
  - 高并发写入场景 → 仅字段+索引，外键约束在应用层处理
- 删除策略：`ON DELETE CASCADE`（级联删除）或 `ON DELETE SET NULL`，按业务需求选择

## 输出模板

```sql
-- ============================================
-- 表名: 表注释
-- 说明: 业务用途简述
-- ============================================
CREATE TABLE `table_name` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    -- 业务字段在此
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='表注释';
```

## 示例

**用户输入**：「设计一个用户表，需要用户名、邮箱、密码、手机号」

**输出**：

```sql
-- ============================================
-- 表名: 用户表
-- 说明: 存储系统用户基本信息
-- ============================================
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `username` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '用户名',
    `email` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '邮箱',
    `password` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '密码（加密存储）',
    `mobile` VARCHAR(20) NOT NULL DEFAULT '' COMMENT '手机号',
    `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 1=启用 2=禁用',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_email` (`email`),
    UNIQUE KEY `uk_mobile` (`mobile`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';
```

## 注意事项

- 不要在 DDL 中包含 `DROP TABLE IF EXISTS`，用户可能需要检查后再执行
- 字段长度（VARCHAR 的 N）不确定时主动询问，不随意设值
- 敏感字段（密码、身份证号等）在注释中标注"加密存储"
