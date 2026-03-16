// Vercel Serverless Function — 可视化诊断工具
// 访问 /api/debug 查看 HTML 诊断报告
// 访问 /api/debug?format=json 获取 JSON 格式
// 访问 /api/debug?test=true 执行真实 API 连通性测试

const PROVIDER_CONFIG = {
  gemini: {
    name: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
    testModel: 'gemini-2.5-flash',
  },
  gpt5mini: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    testModel: 'gpt-4o-mini',
  },
  minimax: {
    name: 'MiniMax',
    url: 'https://api.minimaxi.chat/v1/chat/completions',
    envKey: 'MINIMAX_API_KEY',
    testModel: 'MiniMax-M2.5',
  },
  qwen: {
    name: '通义千问',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
    testModel: 'qwen-turbo',
  },
};

async function runDiagnostics(doTest) {
  const results = {
    timestamp: new Date().toISOString(),
    node_version: process.version,
    providers: {},
    env_scan: [],
    warnings: [],
    summary: { total: 0, configured: 0, working: 0 },
  };

  // Scan for API-related env vars
  const relatedKeys = Object.keys(process.env).filter(
    (k) => k.includes('API') || k.includes('KEY') || k.includes('MODEL') || k.includes('TOKEN')
  );
  results.env_scan = relatedKeys.map((k) => {
    const v = process.env[k];
    return { name: k, set: !!v, preview: v ? v.substring(0, 3) + '***' : '(empty)' };
  });

  // Check for common mistakes
  const wrongNames = ['MODEL_API_KEY', 'API_KEY', 'LLM_API_KEY', 'AI_API_KEY'];
  for (const wn of wrongNames) {
    if (process.env[wn]) {
      results.warnings.push(
        `发现环境变量 "${wn}"，但代码需要的是: GEMINI_API_KEY / OPENAI_API_KEY / MINIMAX_API_KEY / QWEN_API_KEY`
      );
    }
  }

  // Check each provider
  for (const [id, cfg] of Object.entries(PROVIDER_CONFIG)) {
    results.summary.total++;
    const apiKey = process.env[cfg.envKey];
    const entry = {
      name: cfg.name,
      envKey: cfg.envKey,
      hasKey: !!apiKey,
      keyLength: apiKey ? apiKey.length : 0,
      keyPreview: apiKey ? apiKey.substring(0, 4) + '****' + apiKey.slice(-4) : '(not set)',
      testModel: cfg.testModel,
      connectivity: null,
      latency: null,
      error: null,
      response: null,
    };

    if (apiKey) {
      results.summary.configured++;
    }

    if (doTest && apiKey) {
      const start = Date.now();
      try {
        const resp = await fetch(cfg.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.testModel,
            messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
            max_tokens: 5,
            temperature: 0,
          }),
        });
        entry.latency = Date.now() - start;
        const text = await resp.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          entry.connectivity = 'error';
          entry.error = `Invalid JSON: ${text.substring(0, 200)}`;
          results.providers[id] = entry;
          continue;
        }

        if (resp.ok) {
          entry.connectivity = 'ok';
          entry.response = data.choices?.[0]?.message?.content || '(no content)';
          results.summary.working++;
        } else {
          entry.connectivity = 'api_error';
          entry.error = JSON.stringify(data.error || data).substring(0, 300);
        }
      } catch (err) {
        entry.latency = Date.now() - start;
        entry.connectivity = 'network_error';
        entry.error = err.message;
      }
    }

    results.providers[id] = entry;
  }

  return results;
}

function renderHTML(results, doTest) {
  const rows = Object.entries(results.providers)
    .map(([id, p]) => {
      let statusIcon, statusText, statusClass;
      if (!p.hasKey) {
        statusIcon = '&#10060;';
        statusText = '未配置';
        statusClass = 'miss';
      } else if (!doTest) {
        statusIcon = '&#9888;&#65039;';
        statusText = '已配置（未测试）';
        statusClass = 'warn';
      } else if (p.connectivity === 'ok') {
        statusIcon = '&#9989;';
        statusText = `连通 (${p.latency}ms)`;
        statusClass = 'ok';
      } else {
        statusIcon = '&#10060;';
        statusText = p.connectivity === 'api_error' ? 'API错误' : '网络错误';
        statusClass = 'fail';
      }

      return `<tr class="${statusClass}">
        <td><strong>${p.name}</strong><br><code>${id}</code></td>
        <td><code>${p.envKey}</code></td>
        <td>${p.hasKey ? `<span class="tag ok-tag">已设置</span> <code>${p.keyPreview}</code>` : '<span class="tag miss-tag">未设置</span>'}</td>
        <td><code>${p.testModel}</code></td>
        <td>${statusIcon} ${statusText}</td>
        <td>${p.error ? `<code class="err">${p.error.substring(0, 120)}</code>` : (p.response || '-')}</td>
      </tr>`;
    })
    .join('');

  const warningHTML = results.warnings.length
    ? `<div class="warning-box">${results.warnings.map((w) => `<p>&#9888;&#65039; ${w}</p>`).join('')}</div>`
    : '';

  const envHTML = results.env_scan.length
    ? results.env_scan.map((e) => `<code>${e.name}</code> = ${e.preview}`).join('<br>')
    : '<em>没有找到任何 API/KEY 相关的环境变量</em>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API 诊断工具</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
  h1 { color: #58a6ff; margin-bottom: 8px; }
  .subtitle { color: #8b949e; margin-bottom: 20px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
  .card h2 { color: #f0f6fc; margin-bottom: 12px; font-size: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #30363d; color: #8b949e; font-weight: 600; }
  td { padding: 10px 8px; border-bottom: 1px solid #21262d; vertical-align: top; }
  tr.ok td { background: rgba(46, 160, 67, 0.05); }
  tr.fail td, tr.miss td { background: rgba(248, 81, 73, 0.05); }
  tr.warn td { background: rgba(210, 153, 34, 0.05); }
  code { background: #0d1117; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  code.err { color: #f85149; word-break: break-all; }
  .tag { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .ok-tag { background: #238636; color: #fff; }
  .miss-tag { background: #da3633; color: #fff; }
  .warning-box { background: #0d1117; border: 1px solid #d29922; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
  .warning-box p { color: #d29922; margin: 4px 0; }
  .summary { display: flex; gap: 16px; margin-bottom: 20px; }
  .summary-item { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; text-align: center; }
  .summary-item .num { font-size: 32px; font-weight: bold; }
  .summary-item .label { font-size: 12px; color: #8b949e; }
  .num.green { color: #3fb950; }
  .num.yellow { color: #d29922; }
  .num.red { color: #f85149; }
  .btn { display: inline-block; padding: 8px 20px; background: #238636; color: #fff; border: none; border-radius: 6px; text-decoration: none; font-size: 14px; cursor: pointer; margin-right: 8px; }
  .btn:hover { background: #2ea043; }
  .btn.secondary { background: #30363d; }
  .btn.secondary:hover { background: #484f58; }
  .env-box { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.8; }
  .guide { background: #161b22; border: 1px solid #1f6feb; border-radius: 8px; padding: 16px; margin-top: 16px; }
  .guide h3 { color: #58a6ff; margin-bottom: 8px; }
  .guide ol { padding-left: 20px; line-height: 2; }
  .guide code { background: #0d1117; }
  .ts { color: #8b949e; font-size: 12px; }
</style>
</head>
<body>
  <h1>&#128269; NVC API 诊断工具</h1>
  <p class="subtitle">检测时间: ${results.timestamp} | Node ${results.node_version}</p>

  <div class="summary">
    <div class="summary-item">
      <div class="num">${results.summary.total}</div>
      <div class="label">Provider 总数</div>
    </div>
    <div class="summary-item">
      <div class="num ${results.summary.configured > 0 ? 'green' : 'red'}">${results.summary.configured}</div>
      <div class="label">已配置 Key</div>
    </div>
    <div class="summary-item">
      <div class="num ${doTest ? (results.summary.working > 0 ? 'green' : 'red') : 'yellow'}">${doTest ? results.summary.working : '?'}</div>
      <div class="label">${doTest ? '连通成功' : '未测试'}</div>
    </div>
  </div>

  ${warningHTML}

  <div style="margin-bottom: 16px;">
    ${!doTest ? '<a class="btn" href="/api/debug?test=true">&#9889; 运行连通性测试</a>' : '<a class="btn secondary" href="/api/debug">&#8592; 返回快速检查</a>'}
    <a class="btn secondary" href="/api/debug?format=json${doTest ? '&test=true' : ''}">JSON 格式</a>
    <a class="btn secondary" href="/api/verify?ping=true">验证端点</a>
  </div>

  <div class="card">
    <h2>Provider 状态</h2>
    <table>
      <thead><tr><th>Provider</th><th>环境变量</th><th>Key 状态</th><th>测试模型</th><th>连通性</th><th>详情</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>环境变量扫描</h2>
    <p style="color:#8b949e; margin-bottom:8px; font-size:13px;">在 Vercel 环境中检测到的所有 API/KEY/MODEL/TOKEN 相关变量：</p>
    <div class="env-box">${envHTML}</div>
  </div>

  <div class="guide">
    <h3>&#128218; 配置指南</h3>
    <ol>
      <li>登录 <a href="https://vercel.com" style="color:#58a6ff;">Vercel 控制台</a></li>
      <li>选择你的项目 → <strong>Settings</strong> → <strong>Environment Variables</strong></li>
      <li>添加至少一个 API Key（变量名必须精确匹配）：
        <br><code>GEMINI_API_KEY</code> → 从 <a href="https://aistudio.google.com/apikey" style="color:#58a6ff;">Google AI Studio</a> 获取
        <br><code>OPENAI_API_KEY</code> → 从 <a href="https://platform.openai.com/api-keys" style="color:#58a6ff;">OpenAI Platform</a> 获取
        <br><code>MINIMAX_API_KEY</code> → 从 MiniMax 控制台获取
        <br><code>QWEN_API_KEY</code> → 从 <a href="https://dashscope.console.aliyun.com/" style="color:#58a6ff;">阿里云 DashScope</a> 获取
      </li>
      <li>环境变量适用范围选择 <strong>Production</strong>（和 Preview / Development 如需要）</li>
      <li>保存后 <strong>重新部署</strong>（Deployments → Redeploy）</li>
      <li>回到此页面点击 "运行连通性测试" 验证</li>
    </ol>
    <p style="margin-top:12px; color:#f85149;"><strong>常见错误：</strong>变量名设为 <code>MODEL_API_KEY</code> 或 <code>API_KEY</code>，但代码需要的是具体的 <code>GEMINI_API_KEY</code> 等。</p>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const doTest = req.query?.test === 'true';
  const formatJson = req.query?.format === 'json';

  const results = await runDiagnostics(doTest);

  if (formatJson) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(results);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderHTML(results, doTest));
}
