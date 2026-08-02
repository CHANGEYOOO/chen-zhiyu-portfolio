# 新后台基础架构验证版设计规格

> 日期：2026-08-02  
> 状态：设计已确认，尚未实现、尚未发布

## 1. 目标

创建一个与旧后台隔离的最小只读后台，用于验证以下基础链路：

1. 用户访问 `/admin/dashboard/`；
2. Cloudflare Access 使用 Cloudflare 账号授权登录；
3. 登录成功后返回 Dashboard；
4. Dashboard 读取当前前台实际使用的已发布作品接口；
5. 页面显示与前台一致的 30 个 TVC 和 8 个 Livestream 项目。

本阶段不修复、不重构旧后台，也不建立新的作品数据来源。

## 2. 范围边界

### 2.1 本阶段包含

- Cloudflare Access 登录后的只读 Dashboard 页面；
- 当前已发布作品总数、TVC 数量和 Livestream 数量；
- TVC 与 Livestream 两组只读作品列表；
- 加载、空数据、数据异常、请求失败和数量异常状态；
- 桌面端与移动端的基础可读布局；
- 数据模型、页面合约和禁止功能的自动测试。

### 2.2 本阶段禁止

- 上传；
- 新增、编辑、删除、归档或恢复作品；
- 修改作品或图片排序；
- 权限系统；
- 数据库或 Worker API 重构；
- 动画、高级交互或与前台视觉统一；
- 修改旧 `prototype/admin/` 已有文件；
- 未经明确发布指令修改 Cloudflare Access 或 GitHub Pages 线上状态。

## 3. 方案选择

采用“独立静态只读 Dashboard”方案。

新模块只在 `prototype/admin/dashboard/` 中新增文件。旧后台入口 `prototype/admin/index.html` 及其 JavaScript、CSS、测试和 API 客户端均不修改、不引用。新页面继续由现有 GitHub Pages 托管，访问 `/admin/dashboard` 时允许平台跳转至 `/admin/dashboard/`。

未采用以下方案：

- 独立 Worker 托管 Dashboard：会新增不必要的域名、路由和部署复杂度；
- 将旧后台切换为只读模式：会修改旧后台并破坏模块隔离原则。

## 4. 登录与访问控制

### 4.1 登录方式

新 Dashboard 使用 Cloudflare Access 的 Cloudflare 账号身份提供方式，不再使用邮箱一次性验证码。

实现时为 `/admin/dashboard*` 建立独立且更具体的 Access 应用或策略，只允许确认的 Cloudflare 账号进入。既有 `/admin*` 邮箱验证码规则继续服务旧后台，不因新模块而改变。

应用页面本身不实现登录表单、不处理 OAuth 回调、不保存令牌，也不接触 Cloudflare 凭据。未登录用户由 Cloudflare Access 跳转至托管登录页，授权成功后返回原 Dashboard 地址。

### 4.2 退出登录

Dashboard 顶部提供指向 `/cdn-cgi/access/logout` 的普通链接。页面不自行清理或管理认证 Cookie。

## 5. 数据来源与一致性

### 5.1 唯一数据来源

Dashboard 只读取：

```text
GET https://api.kjoe.top/api/public/works
```

这是当前线上前台优先使用的已发布作品接口。接口从现有 Cloudflare D1 查询 `published` 作品并返回媒体地址和直播图片，不新增数据库、JSON 清单或其他数据源。

### 5.2 数据范围

页面只显示接口返回的已发布作品：

- TVC：30 个；
- Livestream：8 个；
- 合计：38 个。

草稿和归档作品不属于本阶段。Dashboard 不调用受保护的旧管理接口 `/api/admin/works`，从而避免旧后台跨子域认证与 Cookie 依赖。

### 5.3 排序和显示字段

作品先按 `section` 分为 `tvc` 与 `livestream`，组内按数值 `sort_order` 升序排列。每行只显示：

- 序号；
- 品牌名称 `brand_name`；
- 作品名称 `work_title`；
- 作品类型 `work_type`。

页面不展示操作列。

### 5.4 一致性策略

接口请求失败时不使用静态 HTML、仓库根目录 JSON 或 Livestream 旧清单作为回退，避免 Dashboard 在数据不同步时伪装成正常状态。

接口返回数量不是 30 个 TVC 加 8 个 Livestream 时，页面继续展示接口实际返回的数据，同时显示明确的数量异常警告。结构不合法的数据不会进入列表。

## 6. 页面结构

```text
prototype/admin/dashboard/
├── index.html
├── dashboard.css
├── dashboard.js
├── works-model.js
├── vendor/
│   └── bootstrap.min.css
└── tests/
    ├── works-model.test.js
    └── dashboard-contract.test.js
```

### 6.1 模板与依赖

使用 Bootstrap 5 的预编译 CSS 构成基础后台布局，并将固定版本文件保存在新模块的 `vendor/` 中，避免运行时依赖第三方 CDN。页面不引入 Bootstrap JavaScript、前端框架、状态管理库或动画库。

### 6.2 页面区域

- 顶部栏：`JOEKUNI ADMIN`、只读标识、退出登录链接；
- 概览区：作品总数、TVC 数量、Livestream 数量；
- 列表区：TVC 表格和 Livestream 表格；
- 状态区：加载、空数据、请求失败、数据异常和数量警告。

桌面端使用标准表格。窄屏下每行改为纵向信息块，不依赖横向拖动才能读取关键文字。

## 7. 组件职责

### 7.1 `works-model.js`

纯数据模块，负责：

- 校验 API 顶层结构和每个作品的必需字段；
- 将作品分组为 TVC 与 Livestream；
- 按 `sort_order` 排序；
- 计算三项数量；
- 生成数量异常警告。

该模块不访问 DOM、不发起网络请求。

### 7.2 `dashboard.js`

页面编排模块，负责：

- 请求公开作品接口；
- 调用 `works-model.js`；
- 在加载、成功、空数据和错误状态之间切换；
- 使用 `textContent` 和 DOM API 渲染作品，避免拼接未经处理的 HTML；
- 提供失败后的“重新加载”按钮。

该模块不引用旧后台代码，不发送写请求。

### 7.3 `index.html` 与 `dashboard.css`

提供语义化只读页面骨架、状态容器和最少的 Bootstrap 覆盖样式。页面不包含作品表单、文件输入、拖拽区域或写操作按钮。

## 8. 错误处理

- 请求进行中：显示加载状态并隐藏旧列表；
- HTTP 或网络失败：显示失败原因的安全概述和“重新加载”按钮；
- JSON 或字段格式错误：显示“作品数据格式异常”，不渲染部分错误记录；
- 空数组：显示“当前没有已发布作品”；
- 数量异常：列表照常显示，并在概览区显示预期值与实际值；
- 未授权：由 Cloudflare Access 在页面到达静态资源前处理，应用代码不模拟登录状态。

## 9. 测试设计

### 9.1 数据模型测试

`works-model.test.js` 使用 Node 内置测试运行器验证：

- 38 个有效作品解析成功；
- 30 个 TVC 和 8 个 Livestream 正确分组；
- 组内按 `sort_order` 排列；
- 缺失 `id`、`section`、`brand_name`、`work_title`、`work_type` 或有效 `sort_order` 时拒绝数据；
- 空数组生成空状态模型；
- 数量偏差生成可见警告；
- 未知 `section` 被视为数据格式错误。

### 9.2 页面合约测试

`dashboard-contract.test.js` 读取静态文件并验证：

- 页面引用新模块自己的脚本和样式；
- 页面不引用旧 `admin.js`、`api-client.js`、上传或排序模块；
- 页面不存在文件输入、作品编辑表单、上传、编辑、删除、排序或权限入口；
- 数据请求目标只有 `/api/public/works`；
- 退出登录指向 Cloudflare Access 标准退出地址。

### 9.3 人工验收

1. 未登录访问 `/admin/dashboard/`；
2. 进入 Cloudflare 账号授权页；
3. 允许的 Cloudflare 账号登录成功；
4. 返回 Dashboard；
5. 显示 38 个当前已发布作品；
6. 作品名称、分类和顺序与前台逐项一致；
7. 旧 `/admin/` 页面和登录方式保持不变；
8. 桌面和手机均能完整读取列表。

## 10. 实施与发布边界

实施阶段先在本地新增模块、执行自动测试并完成本地静态页面验证。未经用户明确发布指令，不进行以下外部变更：

- 不推送 GitHub；
- 不触发 GitHub Pages 发布；
- 不创建或修改 Cloudflare Access 应用和策略；
- 不更改旧后台登录方式；
- 不修改 Worker、D1、R2 或线上前台。

发布阶段获得明确授权后，才执行：

1. 推送已验证版本；
2. 为 `/admin/dashboard*` 配置独立 Cloudflare Access 规则；
3. 选择 Cloudflare 账号身份提供方式并限制允许账号；
4. 验证授权、返回路径、38 项作品和旧后台隔离；
5. 按网站版本规则递增并记录发布版本。

## 11. 验收结论

第一阶段完成的判断标准是：

```text
Cloudflare 账号授权成功
→ 进入 /admin/dashboard/
→ 看到 30 个 TVC 与 8 个 Livestream
→ 名称、分类和顺序与线上前台一致
→ 旧后台和线上前台未被本地开发影响
```
