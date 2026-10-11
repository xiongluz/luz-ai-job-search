# 律动求职 AI 简历平台部署说明

## 1. 项目类型

这是一个 Vite + React 前端项目，构建产物在 `dist/` 目录。

主要命令：

```bash
npm install
npm run build
npm run preview
```

## 2. 静态部署

如果只部署前端页面，可以直接部署 `dist/` 目录。

Nginx 示例：

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/guangqi-ai/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:8080/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

注意：项目使用前端路由，必须配置 `try_files ... /index.html`，否则刷新子页面会 404。

## 3. AI 接口接入点

当前前端已预留 AI 简历助手接口：

### AI 对话接口

文件：`src/aiResumeService.js`

请求地址：

```txt
POST /api/ai-resume/chat
```

无文件时请求：

```json
{
  "mode": "chat | generate | diagnose | optimize",
  "message": "用户输入内容",
  "jd": "岗位 JD，可为空"
}
```

有附件时使用 `multipart/form-data`：

```txt
mode
message
jd
files
```

期望返回：

```json
{
  "reply": "AI 回复内容"
}
```

### 简历上传接口

文件：`src/resumeUploadService.js`

当前前端已有选择、拖拽、校验、进度展示和会话预览逻辑。后端接入时建议实现：

```txt
POST /api/resumes/upload
Content-Type: multipart/form-data
file: PDF / DOC / DOCX
```

期望返回：

```json
{
  "id": "resume_xxx",
  "fileName": "产品经理简历.pdf",
  "fileUrl": "https://...",
  "status": "uploaded"
}
```

## 4. 部署前检查

```bash
npm install
npm run build
```

构建成功后，把 `dist/` 上传到静态服务器即可。

如果需要 AI、上传、解析、下载等能力，需要后端提供：

- `/api/ai-resume/chat`
- `/api/resumes/upload`
- 简历解析接口
- 简历生成 / 下载接口
- 用户登录态或鉴权接口

## 5. 本压缩包内容

压缩包保留：

- `src/`
- `public/`
- `dist/`
- `package.json`
- `package-lock.json`
- `index.html`
- `brand.jpg`
- 部署脚本和说明文档

压缩包排除：

- `node_modules/`
- Vite 临时日志
- 本地编辑器缓存

