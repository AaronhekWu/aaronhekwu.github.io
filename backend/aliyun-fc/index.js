'use strict';

/**
 * 阿里云函数计算（Node.js）统一入口
 * 暴露两个接口：
 *   GET  /verify  -> 检查环境变量里的 API Key 是否存在（可选 ping=true 实测连通性）
 *   POST /chat    -> 前端透传 messages，函数代为调用大模型 API
 *
 * 建议在 FC 环境变量中配置：
 *   QWEN_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, MINIMAX_API_KEY
 */

const PROVIDER_CONFIG = {
  qwen: {
    envKey: 'QWEN_API_KEY',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-turbo',
  },
  gemini: {
    envKey: 'GEMINI_API_KEY',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.5-flash',
  },
  gpt5mini: {
    envKey: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
  },
  minimax: {
    envKey: 'MINIMAX_API_KEY',
    url: 'https://api.minimaxi.chat/v1/chat/completions',
    defaultModel: 'MiniMax-M2.5',
  },
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parsePath(req) {
  const rawPath = req.path || req.url || '/';
  return String(rawPath).split('?')[0].replace(/\/+$/, '') || '/';
}

function parseQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function handleVerify(req, res) {
  const query = parseQuery(req);
  const doPing = query.ping === 'true';
  const providers = {};
  const details = {};

  for (const [provider, cfg] of Object.entries(PROVIDER_CONFIG)) {
    const apiKey = process.env[cfg.envKey];
    if (!apiKey) {
      providers[provider] = false;
      details[provider] = { hasKey: false, reason: `env ${cfg.envKey} not set` };
      continue;
    }

    if (!doPing) {
      providers[provider] = true;
      details[provider] = { hasKey: true };
      continue;
    }

    try {
      const resp = await fetch(cfg.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.defaultModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
      });

      if (resp.ok) {
        providers[provider] = true;
        details[provider] = { hasKey: true, ping: 'ok', status: resp.status };
      } else {
        providers[provider] = false;
        details[provider] = {
          hasKey: true,
          ping: 'fail',
          status: resp.status,
          error: (await resp.text()).slice(0, 200),
        };
      }
    } catch (error) {
      providers[provider] = false;
      details[provider] = { hasKey: true, ping: 'error', error: error.message };
    }
  }

  return sendJson(res, 200, { providers, details });
}

async function handleChat(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const {
    provider = 'qwen',
    model,
    messages,
    temperature = 0.7,
    max_tokens = 8000,
  } = body || {};

  if (!provider || !messages) {
    return sendJson(res, 400, { error: 'Missing required fields: provider/messages' });
  }

  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) {
    return sendJson(res, 400, {
      error: `Unknown provider: ${provider}`,
      available: Object.keys(PROVIDER_CONFIG),
    });
  }

  const apiKey = process.env[cfg.envKey];
  if (!apiKey) {
    return sendJson(res, 500, {
      error: `Server missing env var: ${cfg.envKey}`,
      hint: `请在阿里云函数计算环境变量中配置 ${cfg.envKey}`,
    });
  }

  try {
    const upstreamResp = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || cfg.defaultModel,
        messages,
        temperature,
        max_tokens,
      }),
    });

    const text = await upstreamResp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return sendJson(res, 502, {
        error: 'Invalid JSON from upstream',
        http_status: upstreamResp.status,
        raw: text.slice(0, 500),
      });
    }

    if (!upstreamResp.ok) {
      return sendJson(res, upstreamResp.status, {
        error: 'Upstream API error',
        provider,
        model: model || cfg.defaultModel,
        detail: data,
      });
    }

    return sendJson(res, 200, data);
  } catch (error) {
    return sendJson(res, 502, {
      error: 'Failed to reach upstream API',
      provider,
      detail: error.message,
    });
  }
}

module.exports.handler = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const path = parsePath(req);
  if (req.method === 'GET' && path.endsWith('/verify')) {
    return handleVerify(req, res);
  }

  if (req.method === 'POST' && path.endsWith('/chat')) {
    return handleChat(req, res);
  }

  return sendJson(res, 404, {
    error: 'Not found',
    routes: ['GET /verify', 'POST /chat'],
  });
};
