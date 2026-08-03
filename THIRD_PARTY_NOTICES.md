# 第三方组件声明

## `@xhacker/qmcwasm` 1.0.0

- 许可证：Apache License 2.0
- 源代码仓库：`https://github.com/xhacker-zzz/QmcWasm`
- 分发方式：从 npm 注册表安装，并固定为 `1.0.0`
- 项目用途：在已认证后台的浏览器 Worker 中本地解码 QMC 文件，再上传经过签名复验的标准音频

该包随本站构建产物自托管，不从运行时 CDN 加载。此接入不会把原始 QMC 文件发送到服务端。Apache License 2.0 文本可在已安装包的 `node_modules/@xhacker/qmcwasm/LICENSE.txt` 中查看。

## Unlock Music 参考实现

- 许可证：MIT
- 源代码仓库：`https://git.unlock-music.dev/um/um-react`
- 项目用途：仅用于核对 QQ 音乐 MusicEx 文件名查键规则和 MMKV 字符串容器格式；本站未引入其完整 UI、CLI 或 Go 依赖

项目内 MMKV 解析器只处理管理员主动选择的本地密钥文件，并在浏览器内存中生成精确文件名到 ekey 的映射。原始密钥文件和映射不会上传、持久化或写入日志。
