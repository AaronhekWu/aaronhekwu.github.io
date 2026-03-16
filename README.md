# aaronhekwu.github.io

A working example of NVC training using LLM digital twins.

## 当前部署结构（GitHub Pages + 阿里云函数）

```text
.
├─ index.html                 # 前端静态页面（GitHub Pages）
├─ config.json                # 前端运行配置（后端地址、默认模型等）
├─ nvc-prompt-template.md
└─ backend/
   └─ aliyun-fc/
      ├─ index.js             # 阿里云函数入口
      └─ package.json
```

## 前后端通信方案

1. 前端（GitHub Pages）只负责收集用户输入。
2. 前端请求阿里云函数 `POST /chat`。
3. 云函数从环境变量读取 API Key（不暴露给浏览器），转发到大模型 API，再把结果返回前端。

## 已配置的函数触发地址

`config.json` 默认已配置：

- `https://fc-mp-1ff77b60-d1e4-4cf7-b8d1-9843fece77c8.next.bspapp.com/chat`

如果以后替换域名，只需要改 `config.json` 的 `api.endpoints.chat`。

## 阿里云函数部署要点

### 1) Runtime

- Node.js 18+
- 入口：`index.handler`

### 2) HTTP 触发

确保至少可访问：

- `POST /chat`

`/verify` 是可选能力；当前前端在未配置 verify 时，会直接按 `config.json` 里的 provider 列表启用模型选项。

### 3) 环境变量（至少配置一个）

- `QWEN_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `MINIMAX_API_KEY`
