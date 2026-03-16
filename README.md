# aaronhekwu.github.io

A working example of NVC training using LLM digital twins.

## 推荐项目结构（GitHub Pages + 阿里云函数）

```text
.
├─ index.html                 # 前端静态页面（可直接部署到 GitHub Pages）
├─ config.json                # 前端运行配置（后端地址、默认模型等）
├─ nvc-prompt-template.md
├─ api/                       # 本地/Vercel 开发用函数（可选）
└─ backend/
   └─ aliyun-fc/
      ├─ index.js             # 阿里云函数入口（/verify + /chat）
      └─ package.json
```

## 前后端通信方案

1. 前端（GitHub Pages）只负责收集用户输入，调用你的云函数接口。
2. 阿里云函数从环境变量读取 API Key（不暴露给前端）。
3. 云函数转发请求到大模型服务（Qwen/Gemini/OpenAI/MiniMax），再把响应返回前端。

## 前端配置方式

编辑 `config.json`：

- `api.baseUrl`: 阿里云函数网关地址（例如 `https://xxx.cn-hangzhou.fcapp.run`）
- `api.endpoints.verify`: 健康检查/可用模型检查路径，默认 `/verify`
- `api.endpoints.chat`: 对话代理路径，默认 `/chat`

如果 `api.baseUrl` 留空，前端会回退到本地 `/api/*`（兼容当前仓库里的 `api/` 目录）。

## 阿里云函数部署要点

### 1) Runtime

- Node.js 18+。
- 入口：`index.handler`。

### 2) HTTP 路由

确保这两个路由可访问：

- `GET /verify`
- `POST /chat`

### 3) 环境变量（至少配置一个）

- `QWEN_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `MINIMAX_API_KEY`

### 4) CORS

`backend/aliyun-fc/index.js` 已内置 `Access-Control-Allow-Origin: *`，可直接被 GitHub Pages 页面调用。

## 本地开发

你可以继续使用仓库现有 `api/` 下的 Vercel 风格函数做本地联调；线上切换到阿里云函数时，只需修改 `config.json` 的 `api.baseUrl`。
