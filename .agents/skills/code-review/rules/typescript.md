# TypeScript Review 规则

仅在项目包含 TypeScript 时加载。

- 检查不必要的 `any`、危险类型断言和类型逃逸。
- 检查 `null` / `undefined`、联合类型和 narrowing 是否正确。
- 检查 Promise、async/await、未处理 rejection 和并发执行。
- 检查泛型是否真正提供类型约束，而不是制造复杂度。
- 检查 ESM/CJS、动态 import 和模块边界是否符合项目配置。
- 检查类型、DTO、Schema、Interface 是否重复定义。
- 不因为个人 TypeScript 风格偏好而阻断 Review。
