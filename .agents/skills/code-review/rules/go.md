# Go Review 规则

仅在项目包含 Go 时加载。

- 检查 goroutine 是否可能泄漏，以及取消和退出机制。
- 检查 context 是否正确向下传递。
- 检查 error 是否被忽略或错误包装。
- 关注 data race、mutex 使用和共享状态。
- 检查 channel 生命周期、关闭责任和阻塞风险。
- 检查 interface 是否过度抽象以及 package 边界是否合理。
- 检查重复 package/function/utility 逻辑。
