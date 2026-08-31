# NestJS Review 规则

- 检查 Module、Controller、Provider 和 Dependency Injection 边界。
- 检查 DTO、Pipe、Validation、Guard、Interceptor 和 Exception Filter 的职责。
- Controller 不应无理由承载业务逻辑或绕过既有数据访问层。
- 检查 Provider 是否产生不必要耦合或循环依赖。
- 检查事务、并发、授权和异常处理。
- 检查重复 Service、Provider、DTO、Mapper 和业务规则。
