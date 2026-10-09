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

## 面向用户链接切 fork（SPEC #6）

已核实（只读）：fork `williamxhero/CPA-Manager-Plus-ex` 是上游的 fork，**仓库页/tag 存在**，但
**无 GitHub Release（API `/releases` 为空）、无 release 资产、无 `update-channel` 分支、无 GHCR/Docker
Hub 镜像（`williamxhero/cpa-manager-plus` 不存在）、未启用 GitHub Pages**。据此分类处理：

**已切到 fork（受 `tests/forkEntryLinks.test.mjs` 守卫）**

- 仓库/项目入口：README(+CN) 徽章（release/license/stars）、LICENSE 文件链接、`SystemPage.tsx` 仓库
  快捷入口、`MainLayout.tsx` 页头/侧栏仓库入口、docs vitepress editLink 与 socialLinks、`apps/docs/**`
  的项目与 Release 浏览链接、`bin/install-cpamp.sh` 文档中安装脚本 raw 链接。
- 版本/发布浏览链接：`versionReleaseLinks.ts` 的 manager 目标改为 fork（`/releases/tag/<tag>` 对 fork
  已存在的 tag 返回 200；fork 自发布版本必然带同名 tag）。
- 演示 fixture：`demoFixtures.ts` 的示例 release 链接。

**保留上游引用（逐一理由，不得盲目字符串替换）**

| 引用 | 位置 | 保留理由 |
|---|---|---|
| `Copyright (c) 2026 Seakee` / `Copyright 2026 Seakee` | `LICENSE`、README、docs footer | 法律要求的原作者署名 |
| `git remote add upstream .../seakee/CPA-Manager-Plus.git` | `CONTRIBUTING.md` | 明确命名的上游同步 remote，用于未来合并 seakee 更新 |
| Go module `github.com/seakee/cpa-manager-plus/...` | `go.mod`、`Dockerfile.manager-server`、`package-native.sh` ldflags | 内部 import identity，改动会牵动全部 import，非用户可见，独立评估 |
| 历史 release notes/posts | `docs/release-notes/**`、`docs/release-posts/**` | 历史记录，保留原样 |
| 旧版 `seakee/cpa-manager` 镜像 | migration 文档 | 指向更早的另一个项目，非本 fork |
| 镜像 `seakee/cpa-manager-plus`（docker.io + ghcr.io） | README、docs、`UsageMaintenanceCapabilityViews.tsx`、`bin/install-cpamp.sh` | **fork 未发布自有镜像**；改指 fork 会使 `docker pull` 404，下载请求失效 |
| `update-channel/update-index.json`（raw） | `version.ts`、`updatecheck/metadata.go`、`docs/update-check.md` | **fork 无 `update-channel` 分支**；改指 fork 会 404、更新检查失效 |
| `panel-github-repository` 示例值 | docs（getting-started/cpa-panel/faq/update） | 已切 fork 作为推荐值；但需 fork 先发布 Releases 方能真正下载 `management.html`（见阻塞） |
| release 流水线仓库常量/镜像名/source label | `bin/release/*.mjs`、`.github/workflows/release*.yml` | 绑定发布身份与镜像仓库；fork 尚无发布器与命名空间，改指会 fail-closed |

**阻塞（需人工/发布后处理，不声称完成）**

1. fork 尚未发布任何 GitHub Release/资产 → 一键安装脚本的 native 下载、`panel-github-repository` 的
   `management.html` 拉取、端口版本卡片的 release 页仍可能落空。需在 fork 运行发布流水线后复核。
2. fork 未启用 GitHub Pages，`demo-pages.yml` 未在 fork main 运行 → README/界面/文档站的在线演示与
   在线文档链接仍指向上游 `seakee.github.io/CPA-Manager-Plus/`（唯一可用站点）。
3. fork 未发布镜像（docker.io/ghcr.io）→ 安装脚本与 README 的镜像拉取仍走上游镜像。
4. fork 无 `update-channel` 分支 → 管理器自动更新索引仍指向上游。

## 待开发 / 后续

- Go module path 改名：属独立评估，不在本轮字符串替换范围。
- 桌面端/托盘/安装器图标：本仓无独立资产，如引入需单独补 EX。
