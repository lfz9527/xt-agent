import assert from "node:assert/strict";
import test from "node:test";

import { extractCreateTables, validateDdl } from "./validate-ddl.mjs";

function expectValid(sql, scenario) {
  assert.deepEqual(validateDdl(sql, scenario), []);
}

test("解析字段注释中的逗号且保留表定义", () => {
  const tables = extractCreateTables(`
CREATE TABLE \`sample\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  \`status\` TINYINT UNSIGNED NOT NULL COMMENT '状态: 0=关闭, 1=开启',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='示例表';
`);

  assert.deepEqual([...tables.keys()], ["sample"]);
  assert.match(tables.get("sample").columns.get("status"), /0=关闭, 1=开启/);
});

test("验证订单及明细表的金额、数量和外键", () => {
  expectValid(`
CREATE TABLE \`orders\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  \`user_id\` BIGINT UNSIGNED NOT NULL COMMENT '下单用户ID',
  \`total_amount\` DECIMAL(14,2) NOT NULL COMMENT '订单总金额',
  \`status\` VARCHAR(32) NOT NULL COMMENT '订单状态码',
  PRIMARY KEY (\`id\`),
  KEY \`idx_orders_user_id\` (\`user_id\`),
  CONSTRAINT \`fk_orders_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='订单表';

CREATE TABLE \`order_items\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单明细ID',
  \`order_id\` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  \`product_id\` BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  \`quantity\` INT UNSIGNED NOT NULL COMMENT '购买数量',
  \`unit_price\` DECIMAL(14,2) NOT NULL COMMENT '成交单价',
  PRIMARY KEY (\`id\`),
  KEY \`idx_order_items_order_id\` (\`order_id\`),
  KEY \`idx_order_items_product_id\` (\`product_id\`),
  CONSTRAINT \`fk_order_items_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_order_items_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`chk_order_items_quantity_positive\` CHECK (\`quantity\` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='订单明细表';
`, "order-system");
});

test("验证选课关联表不冗余课程属性并防止重复", () => {
  expectValid(`
CREATE TABLE \`students\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '学生ID',
  \`student_no\` VARCHAR(32) NOT NULL COMMENT '学号',
  \`name\` VARCHAR(80) NOT NULL COMMENT '姓名',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_students_student_no\` (\`student_no\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生表';

CREATE TABLE \`courses\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '课程ID',
  \`course_name\` VARCHAR(120) NOT NULL COMMENT '课程名称',
  \`credit\` DECIMAL(3,1) NOT NULL COMMENT '课程学分',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程表';

CREATE TABLE \`student_courses\` (
  \`student_id\` INT UNSIGNED NOT NULL COMMENT '学生ID',
  \`course_id\` INT UNSIGNED NOT NULL COMMENT '课程ID',
  \`score\` DECIMAL(5,2) NULL COMMENT '成绩',
  PRIMARY KEY (\`student_id\`, \`course_id\`),
  KEY \`idx_student_courses_course_id\` (\`course_id\`),
  CONSTRAINT \`fk_student_courses_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_student_courses_course\` FOREIGN KEY (\`course_id\`) REFERENCES \`courses\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生选课关系表';
`, "course-system");
});

test("验证可选邮箱手机号使用 NULL 且密码保存哈希", () => {
  expectValid(`
CREATE TABLE \`users\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  \`username\` VARCHAR(64) NOT NULL COMMENT '用户名',
  \`password_hash\` VARCHAR(255) NOT NULL COMMENT '盐化密码哈希',
  \`email\` VARCHAR(254) NULL COMMENT '可选邮箱',
  \`mobile\` VARCHAR(32) NULL COMMENT '可选手机号',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_users_username\` (\`username\`),
  UNIQUE KEY \`uk_users_email\` (\`email\`),
  UNIQUE KEY \`uk_users_mobile\` (\`mobile\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
`, "optional-unique-user");
});

test("验证订单明细保留下单时商品快照", () => {
  expectValid(`
-- product_name_snapshot 和 unit_price 是下单时快照，不随商品主数据变化。
CREATE TABLE \`order_items\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单明细ID',
  \`order_id\` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  \`product_id\` BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  \`product_name_snapshot\` VARCHAR(160) NOT NULL COMMENT '下单时商品名称快照',
  \`quantity\` INT UNSIGNED NOT NULL COMMENT '购买数量',
  \`unit_price\` DECIMAL(14,2) NOT NULL COMMENT '下单时成交单价快照',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单明细表';
`, "order-snapshot");
});

test("验证 MySQL 5.7 不使用 8.0 排序规则或 CHECK", () => {
  expectValid(`
CREATE TABLE \`user_profiles\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户资料ID',
  \`user_id\` INT UNSIGNED NOT NULL COMMENT '用户ID',
  \`nickname\` VARCHAR(80) NOT NULL COMMENT '昵称',
  \`preferences\` JSON NULL COMMENT '用户偏好设置',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_user_profiles_user_id\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户资料表';
`, "mysql57");
});

test("验证软删除活动邮箱使用生成列唯一约束", () => {
  expectValid(`
CREATE TABLE \`users\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  \`email\` VARCHAR(254) NOT NULL COMMENT '登录邮箱',
  \`deleted_at\` DATETIME NULL COMMENT '软删除时间',
  \`active_email\` VARCHAR(254) GENERATED ALWAYS AS (
    CASE WHEN \`deleted_at\` IS NULL THEN LOWER(\`email\`) ELSE NULL END
  ) STORED COMMENT '活动记录的规范化邮箱',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_users_active_email\` (\`active_email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表';
`, "soft-delete-unique");
});

test("接受独立活动邮箱表作为并发安全的等价结构", () => {
  expectValid(`
CREATE TABLE \`users\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  \`email\` VARCHAR(254) NOT NULL COMMENT '用户历史邮箱',
  \`deleted_at\` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

CREATE TABLE \`active_user_emails\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '活动邮箱记录ID',
  \`user_id\` BIGINT UNSIGNED NOT NULL COMMENT '活动用户ID',
  \`email\` VARCHAR(254) NOT NULL COMMENT '活动用户邮箱',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_active_user_emails_email\` (\`email\`),
  UNIQUE KEY \`uk_active_user_emails_user_id\` (\`user_id\`),
  CONSTRAINT \`fk_active_user_emails_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='活动用户邮箱表';
`, "soft-delete-unique");
});

test("拒绝 UNIQUE(email, deleted_at) 的软删除陷阱", () => {
  const failures = validateDdl(`
CREATE TABLE \`users\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  \`email\` VARCHAR(254) NOT NULL COMMENT '登录邮箱',
  \`deleted_at\` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_users_email_deleted_at\` (\`email\`, \`deleted_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
`, "soft-delete-unique");

  assert.ok(failures.some((message) => message.includes("UNIQUE(email, deleted_at)")));
});
