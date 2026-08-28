# Rust Review 规则

仅在项目包含 Rust 时加载。

- 检查 ownership、borrowing 和 lifetime 是否符合真实资源生命周期。
- 谨慎检查 `unsafe` 的必要性和安全边界。
- 检查并发共享状态、Send/Sync 和锁使用。
- 检查 Result/Option 是否被不恰当地 unwrap/expect。
- 检查资源释放和异步任务生命周期。
- 检查重复 trait、struct、helper 和业务逻辑。
