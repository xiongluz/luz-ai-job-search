# Luz AI 简历求职

> 一个面向高校应届生的 AI 简历求职与校招信息平台：把分散的企业招聘信息结构化，用大模型完成「简历解析 → 诊断 → 岗位匹配 → 面试准备」的完整闭环。

Web SPA，包含职位数据中心、AI 简历工作台、岗位匹配、模拟面试题库、微信扫码登录与后台数据管理端。

## Features

- **AI 简历工作台** — 上传简历即可解析 PDF / DOC / DOCX，生成多维诊断报告与问题清单，再把结论拆成「改哪一段、怎么改」的优化任务，在工作台分节改写成稿，并支持导出 PDF
- **AI 岗位匹配** — 一份简历同时对多个岗位打分，输出分数、匹配依据与差距，支持「换一批」与岗位收藏追踪；喂给模型前先做 PII 脱敏，最终分由后端加权计算
- **AI 模拟面试题库** — 按目标方向生成结构化面试题，含参考答案、追问与评分要点，流式生成、可随时中断
- **职位数据中心** — 招聘 Excel 批量导入，结构化条件筛选与简历语义检索双通道，支持收藏
- **求职进度看板** — 投递全流程跟踪，看板与表格双视图，离线优先
- **微信扫码登录** — 公众号扫码登录，会话带 TTL 且可跨实例共享
- **后台数据管理端** — 企业 / 岗位 / 投递链接 / 内推码管理与表格批量导入

## 学生侧使用流程

```
上传简历 → 看诊断报告与问题清单 → 按优化任务逐节改写 → 成稿导出 PDF
        → 浏览校招 / 实习职位（条件筛选或简历语义检索）→ 收藏意向岗位
        → 一键批量匹配，拿到分数、匹配依据与差距 → 按推荐方向刷面试题库
        →  在看板跟踪投递进度，直到拿到 offer
```

诊断、匹配与题库生成无需登录即可使用；职位查询、收藏与进度追踪需登录后使用，数据跨端保留。

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Java 17 · Spring Boot 3.5 · MyBatis-Plus · Spring AI (DeepSeek) |
| Data | MySQL · Redis · Elasticsearch |
| Docs & Import | Apache PDFBox · POI · EasyExcel |
| API Docs | Knife4j + springdoc-openapi |
| Frontend | React · Vite（无路由库 / 无 UI 库，自研 History API 路由与 SSE 解析） |
| Infra | Nginx 静态托管 · REST + SSE |

## Architecture

```
React SPA (Vite / Nginx)
        │  /api/**  (JSON + SSE)
        ▼
Spring Boot  ·  context-path=/api
  Controller → Service → Mapper
  登录鉴权 AOP 切面
  OpenAiCompatibleChatClient（自研 LLM 网关：流式 / 重试退避 / 会话记忆）
   │        │        │        │
 MySQL    Redis     ES      DeepSeek
```

职位数据以 MySQL 为写入主库，导入后同步重建检索索引；精确条件筛选走 MySQL 分页，语义检索走 Elasticsearch；Redis 承载登录态与会话。

## Quick Start

### Prerequisites

JDK 17 · Maven 3.8+ · Node 18+ · MySQL · Redis · Elasticsearch

仓库根目录即后端 Maven 工程，前端位于 `luz-ai-job-search-frontend/`。

### Backend

```bash
# 在仓库根目录执行；先通过环境变量注入数据库 / Redis / ES / 模型密钥，不要写入配置文件
mvn spring-boot:run
# 启动成功后健康检查为 /api/health，端口以 application.yml 配置为准
```

### Frontend

```bash
cd luz-ai-job-search-frontend
npm install
npm run dev        # Vite dev server，/api 代理到后端
npm run build      # 构建产物，预览用 node preview-server.js
```

开发服务与本地预览使用同一端口，取值见 `vite.config.js` 与 `preview-server.js`。

### API Docs

后端启动后访问 `/api/swagger-ui.html`（Knife4j 中文分组）。

## Project Structure

```
.
├── pom.xml                       # 后端 Maven 工程（仓库根目录即后端）
├── src/main/java/                # Spring Boot：controller / service / ai（自研 LLM 网关）
│                                 #   / es / excel / resume / community / user / listener / utils
├── src/main/resources/           # application.yml、MyBatis mapper、静态资源
└── luz-ai-job-search-frontend/   # React SPA：页面与组件、自研路由、SSE 流式请求
    ├── src/                      #   样式令牌与明暗主题
    ├── tests/                    # 鉴权路由与生产构建产物检查
    └── preview-server.js         # 构建产物本地预览
```

接口契约与参数说明以 Swagger 为准，不在此处重复维护。

## Core APIs

| Method | Path | Description |
|---|---|---|
| POST | `/api/resumes/upload` | 上传简历，返回解析文本 |
| POST | `/api/ai/resumes/diagnose` | 生成诊断报告 |
| POST | `/api/ai/jobs/match` | 单岗位匹配打分 |
| POST | `/api/ai/jobs/batch-match` | 批量岗位匹配 |
| POST | `/api/ai/jobs/jd-image/parse` | 多模态：JD 截图转结构化 JSON |
| POST | `/api/ai/question-bank/stream` | SSE 流式生成面试题 |
| POST | `/api/campusRecruitment/searchByDocument` | 简历文本 → 语义检索 |
| GET | `/api/login/wechat/qrcode` | 获取登录二维码 scene |
| GET | `/api/login/wechat/status` | 轮询扫码登录结果 |

鉴权接口需在请求头携带 `token`，由登录鉴权切面校验 Redis 会话。

## Notable Implementation

- **xlsx 超链接保真**：招聘表中的投递链接含非法 URI 字符会使 POI 直接抛异常，项目将 `.xlsx` 作为原始 ZIP 解析 `sharedStrings.xml` / `*.rels`，配合 `.rels` 消毒重打包，用双解析器保证链接与字段都不丢失。
- **模型输出可信化**：模型只输出分项得分，最终分由后端按固定权重计算；无目标岗位时匹配维度强制为 `null`，并配置信息充分性闸门与多级降级链。
- **批量匹配降本**：以「简历 + 岗位 + 模型」内容寻址生成缓存键并设置 TTL，响应外露模型调用次数与缓存命中数。
- **前端零重依赖**：路由、分页、主题、POST-SSE 流式解析全部自研，未引入路由 / 状态 / UI 组件库。

## Environment Variables

| Key | Description |
|---|---|
| `SPRING_PROFILES_ACTIVE` | 运行环境 profile |
| `MYSQL_HOST` / `MYSQL_USER` / `MYSQL_PASSWORD` | 主库连接 |
| `REDIS_HOST` / `REDIS_PORT` | 会话存储 |
| `ES_URIS` | Elasticsearch 地址 |
| `DEEPSEEK_API_KEY` | 模型网关密钥 |

凭据一律通过环境变量注入，不要提交到仓库；本地开发复制 `.env.example` 后填写。

## License

[MIT](LICENSE)
