# 套餐凭证编辑：行为和集成边界

## 用户界面

- 凭证管理 → 齿轮 → 右侧抽屉 → 配置：仅 Qwen / OpenCode Go 增加别名、Base URL、API Key；不修改插件配置页。
- 别名写入凭证 JSON 的 `label`，不改文件名或 `id`。留空保存为脱敏密钥，通常是前 4 位 `...` 后 4 位；短密钥隐藏更多字符。
- API Key 是密码类型的替换输入，初始为空；留空保留已保存的密钥。错误和通知不转述可能含密钥的上游诊断。
- Base URL 留空选择并写入明确默认值：
  - Qwen：`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
  - OpenCode Go：`https://opencode.ai/zen/go/v1`
- 添加套餐凭证页中，每个服务商单独一行，顺序为「别名 / Base URL / API Key / 添加」；窄屏允许换行。其他 OAuth 表单不改。

## 保存安全性

编辑器通过现有鉴权下载读取实际文件。特殊字段不依赖 `/auth-files/fields`：不同主机版本支持程度不同，当前相邻源码虽能保存任意元数据，但即时同步并未可靠更新插件的密钥/上游属性与标签；`name` 仍是目标选择器，不是别名。因此使用现有同文件名上传 API，附带完整来源身份和原始内容 SHA-256 条件。上传当前记录的最小修改，保留其他元数据；并在上传后重新下载核对。不删除旧文件，不调用插件的添加接口冒充更新。

请求绑定连接和凭证身份。保存前重新核对身份、已保存密钥/标签/上游等字段；连接切换、关闭编辑器、来源变化时停止尚未提交的写入。重复检查读取同服务商文件，拒绝已知相同密钥和显式有效上游地址的组合，不把密钥放入错误。

**不能把上传成功解释成运行时生效保证。** 成功通知只确认凭证文件已保存并核对。主机上传构建的合成上下文没有插件解析器，可能发布缺少 `api_key` 属性的运行时记录；主机监听器通常会重新解析插件凭证，但上传同步与监听器存在顺序竞态，不能保证仅靠等待就恢复。此竞态来自源码检查，未在运行环境复现。可靠激活需要主机修复，并独立验证真实请求确实使用新密钥/上游；Qwen 的控制台额度不是密钥轮换生效证据。

## 必须如实保留的限制

1. 特殊字段更新仅支持单记录、具有显式 `base_url`、运行时 ID 等于全小写物理文件名的凭证。旧版/配置生成凭证、共享来源、混合大小写文件名或身份不一致的记录拒绝此类更新，而不是猜测迁移身份。普通配置字段仍走原有流程。
2. 对插件添加接口生成的 `服务商-key-摘要.json` 文件名，只允许不改变密钥和有效 URL 的安全更新（例如别名）。轮换后保留原摘要文件名，再添加原密钥/URL 组合时，插件只检查当前密钥/URL 是否重复，随后会保存到已占用的原文件名，可能覆盖轮换后的凭证。因此本次对此类轮换拒绝写入；要解除限制，需要插件和主机支持冲突安全的创建/更新语义。
3. 缺少 `base_url` 的凭证可能继承插件自定义上游；前端无法可靠判断其有效 URL，因此不声称对这类记录完成了全局重复检测。并发添加或绕过 Manager 的其他写入也不在前端预检查锁内。
4. Manager 现有身份与 SHA-256 条件在转发前保护来源；CPA 同文件名上传没有端到端事务回滚保证。超时或失败可能发生在文件已写入后。实现不会删除或盲目恢复文件；会保留草稿、报告无法确认，并要求重新加载核对。不能宣称“任何失败均保持原字节不变”。
5. 本次仅本地源码、合成凭证和模拟请求验证，未读取线上凭证、未写入线上 API、未部署或重启。最终运行时行为由父任务在集成环境核验。
6. 输入验证拒绝无 `://` 的地址、空查询/片段标记、用户信息、空白和反斜杠，避免浏览器 URL 解析器接受插件拒绝的地址。OpenCode 的 HTTP 上游仍需插件配置显式开启 `allow-http`；前端不读取或更改该配置，HTTP 地址保存不等于插件接受它，默认 HTTPS 不受此限制。
7. 已保存 URL 的用户信息、查询、片段和密钥回显不会进入普通文本输入。脱敏显示值与原始来源分开：普通字段编辑不会重写它；特殊字段编辑仍核验真实 URL，必须显式修正不安全地址。未修改的旧版密钥/地址不阻止普通配置编辑。连接控件在预检查期间变为禁用时停止未提交的保存并保留草稿。

## 只读检查的相邻源码证据

以下路径属于其他独立项目；本次仅阅读，没有修改。所述为检查到的源码，不代表已核实部署版本。

- `qwen-cliproxyapi/internal/plugin/auth.go:41-68`、`opencode-go-cliproxyapi/internal/plugin/auth.go:39-62`：文件 `api_key` 是选中凭证密钥；显式 `base_url` 使用文件名作为运行时 ID，文件 `label` 优先。没有显式 URL 时配置中的 `name` 可能覆盖文件标签（各自 `accountLabel`）。
- `qwen-cliproxyapi/internal/plugin/plugin.go:309-386`、`opencode-go-cliproxyapi/internal/plugin/plugin.go:337-417`：配置密钥物化使用仅密钥摘要的 ID，且存在检查与带 URL 的手动凭证不同。更改配置生成记录可能造成身份转换或再次生成。
- `qwen-cliproxyapi/internal/plugin/credentials.go:65-85,96-129`、`opencode-go-cliproxyapi/internal/plugin/credentials.go:26-29,72-88`：添加接口用密钥加 URL 摘要生成文件名，仅按当前密钥/URL 组合拒绝重复，不检查目标文件名已被另一组合占用；别名改变不是更新操作。OpenCode 的 `availableAuthName` 仅用于配置物化，不保护手动添加。
- 两个插件的 `internal/plugin/hostbridge.go:67-72` 直接转发保存；`CLIProxyAPI-source/internal/pluginhost/auth_callbacks.go:271-308` 仅验证文件名和 JSON，`:305` 的 `os.WriteFile` 可覆盖已存在文件。这是禁止摘要文件名原位轮换的依据。
- `CLIProxyAPI-source/internal/api/handlers/management/auth_files_crud.go:261-283,469-546`：上传使用未设置 `PluginAuthParser` 的合成上下文，然后同步运行时记录；Windows ID 小写化。`auth_files_fields.go:257-258,272-287,331-390,603-640` 保存元数据但未即时更新插件属性。
- `CLIProxyAPI-source/internal/watcher/synthesizer/file.go:93-152`、`internal/watcher/clients.go:250-275,306-330`：文件监听重解析调用插件并协调增删改；`sdk/cliproxy/builder.go:308-335`、`internal/watcher/dispatcher.go:88-130` 的上传同步可能覆盖监听状态，同内容事件又可能被 `clients.go:208-212` 的摘要检查跳过。
- `qwen-cliproxyapi/internal/plugin/executor.go:50-99,123-132`、`opencode-go-cliproxyapi/internal/plugin/executor.go:54-83,111-120`：正确解析后实际请求读取选中运行时记录的密钥/URL，并非仅改卡片显示；缺少密钥属性会报错。

对于已支持的显式 URL、非摘要普通稳定文件名凭证，无需修改插件即可保存这三个字段，但可靠运行时激活仍需主机使用带插件解析器的合成/校验流程，并按确定顺序发布正确运行时记录，不能只依赖文件监听补救；解析失败也不能静默降级成不完整的通用记录。摘要文件名凭证仅允许不改变密钥/有效 URL 的更新。要解除摘要文件名轮换限制，两个插件的添加操作至少需要在目标文件名被另一组合占用时返回冲突；主机还需提供原子的仅创建、不覆盖保存语义，避免预检查与上传之间的竞态，或提供协调的安全迁移操作。要解除旧版/配置生成凭证限制，需要所属主机/插件项目协调上传和监听器的稳定 ID、配置物化的存在检查及更新语义；即时运行时正确性需要上传路径使用插件解析。要保证失败时原字节不变，需要主机侧事务式写入/失败恢复协议，不能仅靠前端实现。

## SPEC #8 中断恢复验证（2026-10-09）

SPEC：[williamxhero/CPA-Manager-Plus-ex#8](https://github.com/williamxhero/CPA-Manager-Plus-ex/issues/8)。整体 **PARTIAL**，不是可部署的完整验收。

| 检查 | 实际结果 | 退出码 |
| --- | --- | --- |
| 修改前的既有聚焦测试 | 8 文件、388 测试通过 | 0 |
| 新回归测试修复前 | 2 文件，16 失败、197 通过 | 1 |
| 修复后聚焦测试（`--maxWorkers=2`） | 8 文件、404 测试通过 | 0 |
| 最终 Web 全量（`npm --workspace apps/web run test -- --maxWorkers=2`） | 265 文件、4855 测试通过 | 0 |
| `npm run type-check` | 通过 | 0 |
| `npm run lint` | 0 错误、6 条现有范围外警告 | 0 |
| `npm run build` | 通过；`apps/web/dist/index.html` 为 6,479,244 字节，未提交生成物 | 0 |
| `go -C apps/manager-server test -count=1 ./internal/http/middleware ./internal/service/proxy` | 两个包通过 | 0 |
| `npm run manager-server:test` | 8 测试失败，涉及 6 包：Windows 不支持 helper 信号、POSIX 权限断言、已打开文件替换 | 1 |
| `npm run test:repo -- --maxWorkers=2` | Windows 下未展开脚本中的 `tests/*.test.mjs`，未找到测试 | 1 |
| 用明确文件列表重跑上述 repo 范围（16 文件，`--maxWorkers=2`） | 5 文件失败、11 通过；86 测试失败、173 通过 | 1 |
| 最终来源/架构/文档完整性复查 | 1 文件失败、2 通过；1 测试失败、14 通过 | 1 |
| staged diff 空白及高置信密钥模式扫描 | 通过，0 个模式命中；测试仅使用合成凭证 | 0 |

Repo 失败涉及安装器平台行为、发布工作流/内容校验，以及架构检查把既有 `planCredentialsWiring.test.ts` 中的页面导入断言字符串算作真实导入。该字符串已存在于恢复前 HEAD；本次没有弱化断言或调整范围外文件。原有 `test:repo` 脚本排除 `nativeControlScripts.test.mjs`，本次沿用该范围，没有另跑该文件。最终 Web 与来源/架构/文档检查在代码修复后重跑；repo 全量及 Go 全量失败记录仍原样保留，不能宣称全量全绿。

未做真实浏览器截图或独立运行时请求验收；没有线上 API 读写、部署、合并或 live restart。Go 全量失败遗留的两个本地测试 helper 已按本次临时可执行文件路径核实并停止；不是服务进程。源码检查证明正确插件解析后的字段会控制真实请求，但未证明此次上传能可靠激活。因此必须先修复上述主机/插件边界，再由父任务在隔离集成环境独立验收。
