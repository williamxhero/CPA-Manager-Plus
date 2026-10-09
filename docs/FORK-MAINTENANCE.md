# Fork 维护清单（CPAMP-EX）

本文件记录 `williamxhero/CPA-Manager-Plus-ex`（下称 CPAMP-EX）相对上游
`seakee/CPA-Manager-Plus` 的**自有定制**，供上游合并时逐项核对。只填写已核实
的信息；未落地项明确标注「待开发」，不当作已完成功能。

> 基准：本清单数据来自只读盘点（`branding-plan.md`，2026-10-09，HEAD `41adc1e1`）。
> `merge-base(origin/main, fork/main) == origin/main HEAD` → fork 纯 ahead、无分叉，
> 因此下面各项都确属 fork 新增，而非上游功能。

## 分类说明

- **品牌偏好**：外观/文案/图标等偏好差异，不含功能行为。
- **新增功能**：上游没有的能力。
- **兼容修复**：为兼容旧配置/旧链接或修补集成问题而做的改动。

## 清单

| # | 功能 / 用户目的 | 分类 | 涉及代码与资产（fork 内路径） | 上游来源 | 保留规则 | 重叠替换条件 | 配置/数据迁移注意 | 验收（测试 / 真实页面） | 状态 · 关联 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | provider key 别名（凭证可用别名引用） | 新增功能 | manager-server `internal/{http/controller,repository,service}/providerkeyalias`、`internal/model/provider_key_alias.go`、`http/router/router.go`、`sqlite/migrate.go`；web `components/providers/ProviderKeyAliasEditor.tsx`、`ProviderEditDrawer/*`、`ProviderTable/rowData.ts`；`bin/release/reapply-provider-alias.sh`；`docs/provider-alias-upgrade.md` | 无（fork 新增） | 保留，直到上游提供等价能力并通过本 fork 验收 | 若上游实现别名且迁移兼容，移除重复实现、保留回归测试 | 升级后需 `reapply-provider-alias.sh` 回填别名 | 真实页面：Provider 编辑抽屉保存/回显别名 | 已实现（fork 主线，base `41adc1e1`） |
| 2 | OpenCode Go 额度查询 + 凭证行折叠 | 新增功能 | web `utils/quota/opencodeGoQuota.ts`、`features/authFiles/model/openCodeGoAuthFiles.ts`、`components/quota/quotaConfigs.ts` | 无 | 保留 | 上游覆盖且通过验收时移除重复实现 | 无 | `openCodeGoAuthFiles.test.ts` 等 | 已实现（fork 主线） |
| 3 | 额度单位分数显示 | 品牌偏好 | web `features/accounts/model/quotaUnitFraction.ts` | 无 | 保留 | 上游提供可配置单位时替换 | 无 | 单测 | 已实现（fork 主线） |
| 4 | OpenCode Go 计划剩余天数 + “Go” 标签 | 品牌偏好 | web `features/accounts/model/accountSubscriptionPresentation.ts` | 无 | 保留 | 上游覆盖时替换 | 无 | 单测 + 凭证卡页面 | 已实现（fork 主线） |
| 5 | OpenAI key 连通性测试（不消耗模型） | 新增功能 | web `components/providers/openAIKeyTest.ts` | 无 | 保留 | 上游提供等价探测时替换 | 无 | 单测 | 已实现（fork 主线） |
| 6 | 手写插件凭证表单（非浏览器 OAuth） | 新增功能 | web `features/oauth/PluginCredentialForm.tsx`、`pluginCredentialMetadata.ts` | 无 | 保留 | 上游支持手动凭证时替换 | 需要 host 下发 metadata 或回退 | `OAuthPage.credentials.test.tsx` | 已实现（fork 主线） |
| 7 | 统一「（计划）凭证」页 `/plan-credentials` | 品牌偏好 + 新增功能 | web `features/planCredentials/PlanCredentialsPage.tsx`、`features/plugins/planPlugins.ts`、`pages/PlanCredentialsPage.tsx`、`router/MainRoutes.tsx` | 无 | 保留 | 上游提供等价入口时替换 | route 保持 `/plan-credentials` 以免破坏旧链接 | `PlanCredentialsPage.test.tsx`、`planCredentialsWiring.test.ts` + 侧栏入口 | 已实现（fork 主线） |
| 8 | Qwen 额度 + 凭证卡渲染 | 新增功能 | web `utils/quota/qwenQuota.ts`、`features/accounts/model/accountQuota*`、`accountSubscriptionPresentation.ts` | 无 | 保留 | 上游覆盖时替换 | 无 | 单测 + 凭证卡页面 | 已实现（fork 主线） |
| 9 | 受保护的计划凭证编辑 | 新增功能 | web `services/api/authFiles.ts`（plan configuration）、`features/authFiles/hooks/useAuthFileConfigurationEditor.ts`、`accounts/components/accountDetail/AccountConfigurationTab.tsx`；`docs/plan-credential-editing.zh-CN.md` | 无 | 保留 | 上游覆盖时替换 | 无 | 单测 | 已实现（fork 主线） |
| 10 | provider source 解析改造 | 兼容修复 | web `utils/sourceResolver.ts`、`monitoring/model/sourceDisplay.ts`、`realtimeSourceDisplay.ts` 等 | 无 | 保留 | 上游覆盖时替换 | 无 | 单测 | 已实现（fork 主线） |
| 11 | CPAMP EX 品牌角标 + 主题 provider 图标 + 添加页改名 | 品牌偏好 | 品牌资产 `apps/web/src/assets/brand/*`（15 SVG + 15 PNG 全部加 EX 角标）、`apps/web/public/favicon.ico`、`apple-touch-icon.png` 及 manager-server 内嵌副本、`apps/web/index.html` 内联回退；provider 图标 `apps/web/src/assets/icons/opencode-{light,dark}.png` + `features/authFiles/constants.ts`；文案 `i18n/locales/*`、`features/plugins/planPlugins.ts`、`features/planCredentials/PlanCredentialsPage.tsx` | 无（fork 品牌偏好） | 保留；EX 仅加于 CPAMP 自有资产，**不加**第三方 provider 标志 | 上游若提供官方品牌变体，按需替换但保留 EX 语义 | 无 | `tests/cpampExBranding.test.mjs`、`repoSourceIntegrity.test.mjs`、`constants.test.ts`、`PlanCredentialsPage.test.tsx`、`planCredentialsWiring.test.ts` | 本 PR 实现（`claude/ex-branding`），**未合并/未部署** |

## 上游合并检查表

1. 建独立更新分支（不要直接在主干事分支上合并）。
2. 合并 CPAMP 或 OpenCode subtree 上游（按改动来源选择）。
3. 逐项核对上表定制点，确认上游是否已覆盖。
4. 处理重叠/迁移（配置、数据、路由、资产）。
5. 跑测试与构建（`npm run test`、`npm run type-check`、`npm run lint`、`npm run build`；Go 侧 `go test ./...`）。
6. 真实页面验收（侧栏入口、`/plan-credentials` 两模块标题+图标、系统信息链接、favicon）。
7. 合并主干。

> 上游已覆盖、且通过本 fork 验收的能力：移除重复实现，保留有价值的回归测试。
> **不得**无条件 `ours`/`theirs` 合并。

## 待开发 / 后续

- #6 的面向用户链接切 fork（README 徽章/安装 raw/文档站、`SystemPage.tsx`、`versionReleaseLinks.ts`、`bin/release/*`、workflows、`apps/docs/**` 等）：**本卡未实现**，需先核实 fork release/tag/镜像真实存在，不得制造 404。
- Go module path 改名：属独立评估，不在本轮字符串替换范围。
- 桌面端/托盘/安装器图标：本仓无独立资产，如引入需单独补 EX。
