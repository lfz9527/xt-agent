#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONSTRAINT_PREFIX = /^(?:PRIMARY\s+KEY|UNIQUE(?:\s+(?:KEY|INDEX))?|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY|CHECK|FULLTEXT|SPATIAL)\b/i;

function stripSqlComments(sql) {
  let result = "";
  let state = "normal";

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      if (current === "\n") {
        state = "normal";
        result += current;
      } else {
        result += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        state = "normal";
        result += "  ";
        index += 1;
      } else {
        result += current === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "single-quote" || state === "double-quote" || state === "backtick") {
      result += current;
      const delimiter = state === "single-quote" ? "'" : state === "double-quote" ? '"' : "`";

      if (current === "\\" && index + 1 < sql.length) {
        result += sql[index + 1];
        index += 1;
        continue;
      }

      if (current === delimiter) {
        if (next === delimiter) {
          result += next;
          index += 1;
        } else {
          state = "normal";
        }
      }
      continue;
    }

    if (current === "-" && next === "-") {
      state = "line-comment";
      result += "  ";
      index += 1;
    } else if (current === "#") {
      state = "line-comment";
      result += " ";
    } else if (current === "/" && next === "*") {
      state = "block-comment";
      result += "  ";
      index += 1;
    } else {
      result += current;
      if (current === "'") state = "single-quote";
      if (current === '"') state = "double-quote";
      if (current === "`") state = "backtick";
    }
  }

  return result;
}

function findMatchingParenthesis(sql, openingIndex) {
  let depth = 0;
  let state = "normal";

  for (let index = openingIndex; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state !== "normal") {
      const delimiter = state === "single-quote" ? "'" : state === "double-quote" ? '"' : "`";
      if (current === "\\") {
        index += 1;
        continue;
      }
      if (current === delimiter) {
        if (next === delimiter) {
          index += 1;
        } else {
          state = "normal";
        }
      }
      continue;
    }

    if (current === "'") state = "single-quote";
    else if (current === '"') state = "double-quote";
    else if (current === "`") state = "backtick";
    else if (current === "(") depth += 1;
    else if (current === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function splitTopLevelDefinitions(body) {
  const definitions = [];
  let start = 0;
  let depth = 0;
  let state = "normal";

  for (let index = 0; index < body.length; index += 1) {
    const current = body[index];
    const next = body[index + 1];

    if (state !== "normal") {
      const delimiter = state === "single-quote" ? "'" : state === "double-quote" ? '"' : "`";
      if (current === "\\") {
        index += 1;
        continue;
      }
      if (current === delimiter) {
        if (next === delimiter) index += 1;
        else state = "normal";
      }
      continue;
    }

    if (current === "'") state = "single-quote";
    else if (current === '"') state = "double-quote";
    else if (current === "`") state = "backtick";
    else if (current === "(") depth += 1;
    else if (current === ")") depth -= 1;
    else if (current === "," && depth === 0) {
      definitions.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }

  definitions.push(body.slice(start).trim());
  return definitions.filter(Boolean);
}

function identifiersFrom(text) {
  const identifiers = [];
  const matcher = /`((?:``|[^`])+)`|\b([A-Za-z_][A-Za-z0-9_$]*)\b/g;
  for (const match of text.matchAll(matcher)) {
    identifiers.push((match[1] ?? match[2]).replaceAll("``", "`").toLowerCase());
  }
  return identifiers;
}

function firstIdentifier(definition) {
  const match = definition.match(/^\s*(?:`((?:``|[^`])+)`|([A-Za-z_][A-Za-z0-9_$]*))/);
  return match ? (match[1] ?? match[2]).replaceAll("``", "`").toLowerCase() : null;
}

export function extractCreateTables(input) {
  const sql = stripSqlComments(input);
  const tables = new Map();
  const createMatcher = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;
  let match;

  while ((match = createMatcher.exec(sql)) !== null) {
    const openingIndex = sql.indexOf("(", createMatcher.lastIndex);
    if (openingIndex === -1) break;

    const header = sql.slice(createMatcher.lastIndex, openingIndex);
    const headerIdentifiers = identifiersFrom(header);
    const tableName = headerIdentifiers.at(-1);
    const closingIndex = findMatchingParenthesis(sql, openingIndex);
    if (!tableName || closingIndex === -1) break;

    const semicolonIndex = sql.indexOf(";", closingIndex + 1);
    const statementEnd = semicolonIndex === -1 ? sql.length : semicolonIndex + 1;
    const body = sql.slice(openingIndex + 1, closingIndex);
    const definitions = splitTopLevelDefinitions(body);
    const columns = new Map();

    for (const definition of definitions) {
      if (CONSTRAINT_PREFIX.test(definition)) continue;
      const columnName = firstIdentifier(definition);
      if (columnName) columns.set(columnName, definition);
    }

    tables.set(tableName, {
      name: tableName,
      body,
      columns,
      definitions,
      options: sql.slice(closingIndex + 1, statementEnd),
      statement: sql.slice(match.index, statementEnd),
    });

    createMatcher.lastIndex = statementEnd;
  }

  return tables;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function identifierPattern(name) {
  const escapedName = escapeRegExp(name);
  return "(?:`" + escapedName + "`|" + escapedName + ")";
}

function column(table, name) {
  return table?.columns.get(name.toLowerCase());
}

function indexColumns(definition) {
  if (/\bFOREIGN\s+KEY\b/i.test(definition)) return [];
  if (!/^(?:PRIMARY\s+KEY|UNIQUE(?:\s+(?:KEY|INDEX))?|KEY|INDEX|CONSTRAINT\s+\S+\s+UNIQUE)\b/i.test(definition.trim())) return [];
  const openingIndex = definition.indexOf("(");
  if (openingIndex === -1) return [];
  const closingIndex = findMatchingParenthesis(definition, openingIndex);
  if (closingIndex === -1) return [];
  return identifiersFrom(definition.slice(openingIndex + 1, closingIndex)).filter(
    (name) => !["asc", "desc"].includes(name),
  );
}

function hasIndexPrefix(table, expectedColumns, { unique = false } = {}) {
  const expected = expectedColumns.map((name) => name.toLowerCase());

  for (const definition of table.definitions) {
    if (unique && !/^(?:PRIMARY\s+KEY|UNIQUE(?:\s+(?:KEY|INDEX))?|CONSTRAINT\s+\S+\s+UNIQUE)\b/i.test(definition.trim())) continue;
    const actual = indexColumns(definition);
    if (expected.every((name, index) => actual[index] === name)) return true;
  }

  if (expected.length === 1) {
    const definition = column(table, expected[0]);
    if (definition && /\b(?:PRIMARY\s+KEY|UNIQUE)\b/i.test(definition)) return true;
  }

  return false;
}

function hasUniqueColumnSet(table, expectedColumns) {
  const expected = [...expectedColumns].map((name) => name.toLowerCase()).sort();
  return table.definitions.some((definition) => {
    if (!/^(?:PRIMARY\s+KEY|UNIQUE(?:\s+(?:KEY|INDEX))?|CONSTRAINT\s+\S+\s+UNIQUE)\b/i.test(definition.trim())) return false;
    const actual = indexColumns(definition).slice(0, expected.length).sort();
    return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
  });
}

function foreignKeyDefinition(table, name) {
  const pattern = new RegExp(`\\bFOREIGN\\s+KEY\\s*\\(\\s*${identifierPattern(name)}(?:\\s*[,\\)])`, "i");
  return table.definitions.find((definition) => pattern.test(definition));
}

function hasForeignKey(table, name) {
  return Boolean(foreignKeyDefinition(table, name));
}

function hasNonNegativeCheck(table, name) {
  const nameMatcher = new RegExp(identifierPattern(name), "i");
  return table.definitions.some(
    (definition) => /\bCHECK\s*\(/i.test(definition)
      && nameMatcher.test(definition)
      && /(?:>=\s*0|>\s*(?:-1|0))\b/i.test(definition),
  );
}

function hasPositiveCheck(table, name) {
  const nameMatcher = new RegExp(identifierPattern(name), "i");
  return table.definitions.some(
    (definition) => /\bCHECK\s*\(/i.test(definition)
      && nameMatcher.test(definition)
      && /(?:>\s*0|>=\s*1)\b/i.test(definition),
  );
}

function validateCommon(sql, tables, failures) {
  if (/\bDROP\s+TABLE\b/i.test(sql)) failures.push("DDL 不应包含 DROP TABLE");
  if (tables.size === 0) failures.push("没有解析到 CREATE TABLE 语句");

  for (const table of tables.values()) {
    if (!/\bENGINE\s*=\s*InnoDB\b/i.test(table.options)) failures.push(`${table.name}: 缺少 ENGINE=InnoDB`);
    if (!/\b(?:DEFAULT\s+)?(?:CHARACTER\s+SET|CHARSET)\s*=\s*utf8mb4\b/i.test(table.options)) failures.push(`${table.name}: 缺少 utf8mb4 字符集`);
    if (!/\bCOMMENT\s*=\s*'(?:''|[^'])*'/i.test(table.options)) failures.push(`${table.name}: 缺少表 COMMENT`);
    if (!/\bPRIMARY\s+KEY\b/i.test(table.body)) failures.push(`${table.name}: 缺少主键`);
    if (/(?:\.\.\.|\bTODO\b)/i.test(table.body)) failures.push(`${table.name}: DDL 中存在占位符`);

    for (const [name, definition] of table.columns) {
      if (!/\bCOMMENT\s+'(?:''|[^'])*'/i.test(definition)) failures.push(`${table.name}.${name}: 缺少字段 COMMENT`);
      if (/^(?:password|password_hash|email|mobile|phone|username|name)$/i.test(name)
        && /\bNOT\s+NULL\b/i.test(definition)
        && /\bDEFAULT\s+''/i.test(definition)) {
        failures.push(`${table.name}.${name}: 必填身份或敏感字段不应默认空字符串`);
      }
    }
  }
}

function requireTable(tables, name, failures) {
  const table = tables.get(name);
  if (!table) failures.push(`缺少 ${name} 表`);
  return table;
}

function requireColumn(table, name, failures) {
  if (!table) return undefined;
  const definition = column(table, name);
  if (!definition) failures.push(`${table.name}: 缺少 ${name} 字段`);
  return definition;
}

function validateProduct(tables, failures) {
  const products = requireTable(tables, "products", failures);
  if (!products) return;

  const name = requireColumn(products, "name", failures);
  const categoryId = requireColumn(products, "category_id", failures);
  const price = requireColumn(products, "price", failures);
  const stock = requireColumn(products, "stock", failures);
  requireColumn(products, "status", failures);

  if (name && !/\bNOT\s+NULL\b/i.test(name)) failures.push("products.name: 商品名称应为必填字段");
  if (price && !/\bDECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/i.test(price)) failures.push("products.price: 应使用明确精度的 DECIMAL(p,s)");
  if (price && !/\bNOT\s+NULL\b/i.test(price)) failures.push("products.price: 商品价格应为必填字段");
  if (stock && !/\b(?:TINYINT|SMALLINT|MEDIUMINT|INT|BIGINT)\b/i.test(stock)) failures.push("products.stock: 应使用整数类型");
  if (stock && !/\bNOT\s+NULL\b/i.test(stock)) failures.push("products.stock: 库存应为必填字段");
  if (categoryId && !/\bINT(?:EGER)?\s+UNSIGNED\b/i.test(categoryId)) failures.push("products.category_id: 类型应与 categories.id 的 INT UNSIGNED 一致");
  if (!hasForeignKey(products, "category_id")) failures.push("products.category_id: 需求明确要求数据库外键");
  if (!hasNonNegativeCheck(products, "price")) failures.push("products.price: MySQL 8.0 场景应包含非负 CHECK");
  if (!hasNonNegativeCheck(products, "stock")) failures.push("products.stock: MySQL 8.0 场景应包含非负 CHECK");
  if (!hasIndexPrefix(products, ["category_id", "status"])) failures.push("products: 缺少以 category_id、status 开头的查询索引");
}

function validateOrderSystem(tables, failures) {
  const orders = requireTable(tables, "orders", failures);
  const items = requireTable(tables, "order_items", failures);
  const userId = requireColumn(orders, "user_id", failures);
  const totalAmount = requireColumn(orders, "total_amount", failures);
  requireColumn(orders, "status", failures);
  requireColumn(items, "order_id", failures);
  requireColumn(items, "product_id", failures);
  const quantity = requireColumn(items, "quantity", failures);
  const unitPrice = requireColumn(items, "unit_price", failures);

  if (userId && !/\bBIGINT\s+UNSIGNED\b/i.test(userId)) failures.push("orders.user_id: 类型应与 users.id 的 BIGINT UNSIGNED 一致");
  const orderId = items && column(items, "order_id");
  const productId = items && column(items, "product_id");
  if (orderId && !/\bBIGINT\s+UNSIGNED\b/i.test(orderId)) failures.push("order_items.order_id: 类型应与 orders.id 的 BIGINT UNSIGNED 一致");
  if (productId && !/\bBIGINT\s+UNSIGNED\b/i.test(productId)) failures.push("order_items.product_id: 类型应与 products.id 的 BIGINT UNSIGNED 一致");
  if (userId && !hasForeignKey(orders, "user_id")) failures.push("orders.user_id: 需求明确要求数据库外键");
  if (items && !hasForeignKey(items, "order_id")) failures.push("order_items.order_id: 需求明确要求数据库外键");
  if (items && !hasForeignKey(items, "product_id")) failures.push("order_items.product_id: 需求明确要求数据库外键");
  if (totalAmount && !/\bDECIMAL\s*\(/i.test(totalAmount)) failures.push("orders.total_amount: 应使用 DECIMAL");
  if (unitPrice && !/\bDECIMAL\s*\(/i.test(unitPrice)) failures.push("order_items.unit_price: 应使用 DECIMAL");
  if (quantity && !hasPositiveCheck(items, "quantity")) failures.push("order_items.quantity: 应包含正数 CHECK");

  const userForeignKey = orders && foreignKeyDefinition(orders, "user_id");
  const productForeignKey = items && foreignKeyDefinition(items, "product_id");
  if (userForeignKey && /\bON\s+DELETE\s+CASCADE\b/i.test(userForeignKey)) failures.push("orders.user_id: 不得级联删除历史订单");
  if (productForeignKey && /\bON\s+DELETE\s+CASCADE\b/i.test(productForeignKey)) failures.push("order_items.product_id: 不得级联删除历史订单明细");
}

function validateCourseSystem(tables, failures) {
  const students = requireTable(tables, "students", failures);
  const courses = requireTable(tables, "courses", failures);
  const relation = requireTable(tables, "student_courses", failures);
  requireColumn(students, "student_no", failures);
  requireColumn(courses, "course_name", failures);
  requireColumn(courses, "credit", failures);
  requireColumn(relation, "student_id", failures);
  requireColumn(relation, "course_id", failures);
  requireColumn(relation, "score", failures);

  if (relation) {
    if (column(relation, "course_name") || column(relation, "credit")) failures.push("student_courses: 不应冗余当前课程名或学分");
    if (!hasUniqueColumnSet(relation, ["student_id", "course_id"])) failures.push("student_courses: 必须防止学生重复选择同一课程");
    if (!hasForeignKey(relation, "student_id") || !hasForeignKey(relation, "course_id")) failures.push("student_courses: 缺少学生或课程外键");
  }
}

function validateOptionalUniqueUser(tables, failures) {
  const users = requireTable(tables, "users", failures);
  const username = requireColumn(users, "username", failures);
  const email = requireColumn(users, "email", failures);
  const mobile = requireColumn(users, "mobile", failures);
  const passwordHash = requireColumn(users, "password_hash", failures);

  for (const [name, definition] of [["email", email], ["mobile", mobile]]) {
    if (!definition) continue;
    if (/\bNOT\s+NULL\b/i.test(definition)) failures.push(`users.${name}: 可选字段应允许 NULL`);
    if (/\bDEFAULT\s+''/i.test(definition)) failures.push(`users.${name}: 不应默认空字符串`);
    if (!hasIndexPrefix(users, [name], { unique: true })) failures.push(`users.${name}: 缺少唯一约束`);
  }

  if (username && !/\bNOT\s+NULL\b/i.test(username)) failures.push("users.username: 用户名应为必填字段");
  if (passwordHash && !/\bNOT\s+NULL\b/i.test(passwordHash)) failures.push("users.password_hash: 密码哈希应为必填字段");
  if (passwordHash && /\bDEFAULT\b/i.test(passwordHash)) failures.push("users.password_hash: 不应设置默认值");
  if (users && column(users, "password")) failures.push("users: 应明确使用 password_hash，而不是含糊的 password 字段");
}

function validateOrderSnapshot(sql, tables, failures) {
  const items = requireTable(tables, "order_items", failures);
  if (!items) return;

  const productName = column(items, "product_name_snapshot") ?? column(items, "product_name");
  const unitPrice = column(items, "unit_price");
  if (!productName) failures.push("order_items: 缺少商品名称快照字段");
  if (!unitPrice || !/\bDECIMAL\s*\(/i.test(unitPrice)) failures.push("order_items: 缺少 DECIMAL 类型成交单价快照");
  if (!/(?:快照|snapshot|下单时)/i.test(sql)) failures.push("输出未说明名称和单价是历史快照");
}

function validateMysql57(tables, failures) {
  const profiles = requireTable(tables, "user_profiles", failures);
  const userId = requireColumn(profiles, "user_id", failures);
  const preferences = requireColumn(profiles, "preferences", failures);
  if (userId && !/\bINT(?:EGER)?\s+UNSIGNED\b/i.test(userId)) failures.push("user_profiles.user_id: 类型应与用户主键的 INT UNSIGNED 一致");
  if (preferences && !/\bJSON\b/i.test(preferences)) failures.push("user_profiles.preferences: 应使用 JSON 类型");
  if (preferences && /\bDEFAULT\b/i.test(preferences)) failures.push("MySQL 5.7 的 JSON 字段不应设置默认值");

  for (const table of tables.values()) {
    if (/utf8mb4_0900_/i.test(table.options)) failures.push(`${table.name}: MySQL 5.7 不支持 utf8mb4_0900_*`);
    if (/\bCHECK\s*\(/i.test(table.body)) failures.push(`${table.name}: MySQL 5.7 场景不能依赖不会执行的 CHECK`);
  }
}

function validateSoftDeleteUnique(tables, failures) {
  const users = requireTable(tables, "users", failures);
  requireColumn(users, "email", failures);
  requireColumn(users, "deleted_at", failures);
  if (!users) return;

  const generated = [...users.columns.entries()].find(([, definition]) =>
    /\b(?:GENERATED\s+ALWAYS\s+)?AS\s*\(/i.test(definition)
      && new RegExp(identifierPattern("email"), "i").test(definition)
      && new RegExp(identifierPattern("deleted_at"), "i").test(definition),
  );
  const activeEmailTable = [...tables.values()].find((table) =>
    table.name !== "users"
      && column(table, "email")
      && column(table, "user_id")
      && hasIndexPrefix(table, ["email"], { unique: true })
      && hasForeignKey(table, "user_id"),
  );

  if (!generated && !activeEmailTable) {
    failures.push("缺少生成列或独立活动邮箱表，无法在数据库层保证活动邮箱唯一");
  } else if (generated && !hasIndexPrefix(users, [generated[0]], { unique: true })) {
    failures.push(`users.${generated[0]}: 活动邮箱生成列缺少唯一索引`);
  }

  const naiveUnique = users.definitions.some((definition) =>
    /\bUNIQUE\b/i.test(definition)
      && indexColumns(definition).includes("email")
      && indexColumns(definition).includes("deleted_at"),
  );
  if (naiveUnique) failures.push("users: UNIQUE(email, deleted_at) 不能保证活动记录邮箱唯一");
}

export function validateDdl(sql, scenario) {
  const tables = extractCreateTables(sql);
  const failures = [];
  validateCommon(sql, tables, failures);

  const validators = {
    product: () => validateProduct(tables, failures),
    "order-system": () => validateOrderSystem(tables, failures),
    "course-system": () => validateCourseSystem(tables, failures),
    "optional-unique-user": () => validateOptionalUniqueUser(tables, failures),
    "order-snapshot": () => validateOrderSnapshot(sql, tables, failures),
    mysql57: () => validateMysql57(tables, failures),
    "soft-delete-unique": () => validateSoftDeleteUnique(tables, failures),
  };

  if (!validators[scenario]) failures.push(`未知验证场景: ${scenario}`);
  else validators[scenario]();
  return failures;
}

function runSelfTest() {
  const sample = `
CREATE TABLE \`products\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  \`category_id\` INT UNSIGNED NOT NULL COMMENT '分类ID',
  \`name\` VARCHAR(120) NOT NULL COMMENT '商品名称',
  \`price\` DECIMAL(12,2) NOT NULL COMMENT '销售价格',
  \`stock\` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '库存数量',
  \`status\` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态',
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (\`id\`),
  KEY \`idx_products_category_status_created\` (\`category_id\`, \`status\`, \`created_at\`),
  CONSTRAINT \`fk_products_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`chk_products_price_nonnegative\` CHECK (\`price\` >= 0),
  CONSTRAINT \`chk_products_stock_nonnegative\` CHECK (\`stock\` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商品表';
`;

  const failures = validateDdl(sample, "product");
  if (failures.length > 0) throw new Error(`正向自测失败:\n${failures.join("\n")}`);

  const invalid = sample.replace("CONSTRAINT `chk_products_stock_nonnegative` CHECK (`stock` >= 0)", "KEY `idx_stock` (`stock`)");
  const invalidFailures = validateDdl(invalid, "product");
  if (!invalidFailures.some((message) => message.includes("stock"))) throw new Error("反向自测未识别缺失的库存约束");

  process.stdout.write("validate-ddl self-test passed\n");
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const [, , file, scenario] = process.argv;
  if (file === "--self-test") {
    runSelfTest();
  } else if (!file || !scenario) {
    process.stderr.write("Usage: node scripts/validate-ddl.mjs <output-file> <scenario>\n");
    process.exitCode = 2;
  } else {
    const sql = fs.readFileSync(path.resolve(file), "utf8");
    const failures = validateDdl(sql, scenario);
    if (failures.length > 0) {
      process.stderr.write(`${failures.map((message) => `- ${message}`).join("\n")}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`DDL validation passed: ${scenario}\n`);
    }
  }
}
