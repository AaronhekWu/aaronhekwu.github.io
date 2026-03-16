# aaronhekwu.github.io

NVC 非暴力沟通训练静态站点（前后端分离版）。

## 当前架构

```text
Flash 快速响应大模型
  -> Serverless Function (鉴权/校验/转发/限流)
  -> Streaming/SSE
  -> 静态前端（GitHub Pages）
```

- 前端职责：聊天 UI、会话状态、本地模式判定、静态场景模板加载、流式文本展示、网络失败提示、模式切换。
- Serverless 网关职责：读取 API_KEY、校验请求、转发到模型、流式返回、限流/防滥用。

## 项目结构

```text
.
├─ index.html                 # 前端静态页面（本地模式 + AI 模式）
├─ scenarios.json             # 静态场景模板（可放多个）
├─ config.json                # 前端运行配置（模式、场景地址、网关地址等）
├─ api/                       # Serverless 示例（/verify + /chat）
└─ backend/aliyun-fc/         # 阿里云函数示例
```

## 本地模式（无后端可用）

- `index.html` 打开时自动读取 `scenarios.json` 并导入场景。
- 点击“换一个场景”会先重新拉取 `scenarios.json`（`no-store`），再轮换模板，避免浏览器缓存导致看不到新增场景。
- 即使没有任何后端，页面也可正常训练（关键词判定）。

## AI 模式（Serverless）

编辑 `config.json`：

- `api.baseUrl`: 你的 Serverless 网关地址。
- `api.endpoints.verify`: 默认 `/verify`。
- `api.endpoints.chat`: 默认 `/chat`。

`/chat` 支持 `stream: true`，前端会按 SSE 增量展示回复。

## 静态场景模板格式

在 `scenarios.json` 中维护：

```json
{
  "scenarios": [
    { "scenario": {}, "character": {}, "player": {}, "opening": {}, "judgment_keywords": {}, "emotion_responses": {} }
  ]
}
```

可追加多个对象，前端会自动轮换。
