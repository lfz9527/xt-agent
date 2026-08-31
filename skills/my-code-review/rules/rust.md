# Rust Review 规则

- 检查 ownership、borrowing、lifetime 与资源生命周期。
- 谨慎检查 `unsafe` 的必要性和安全边界。
- 检查并发共享状态、Send/Sync 和锁。
- 检查 Result/Option 是否不恰当地 unwrap/expect。
- 检查异步任务生命周期。
- 检查重复 trait、struct、helper 和业务逻辑。
