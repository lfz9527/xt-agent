# Go Review 规则

- 检查 goroutine 泄漏以及取消和退出机制。
- 检查 context 是否正确传递。
- 检查 error 是否被忽略或错误包装。
- 关注 data race、mutex、共享状态和 channel 生命周期。
- 检查 interface 是否过度抽象以及 package 边界。
- 检查重复 package/function/utility 逻辑。
