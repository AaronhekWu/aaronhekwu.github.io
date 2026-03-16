const PROVIDER_CONFIG = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
    authStyle: 'bearer', // Gemini OpenAI-compatible endpoint uses Bearer
  },
  gpt5mini: {
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    authStyle: 'bearer',
  },
  minimax: {
    url: 'https://api.minimaxi.chat/v1/chat/completions',
    envKey: 'MINIMAX_API_KEY',
    authStyle: 'bearer',
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
    authStyle: 'bearer',
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, model, messages, temperature = 0.7, max_tokens = 8000 } = req.body || {};

  if (!provider || !model || !messages) {
    return res.status(400).json({
      error: 'Missing required fields',
      detail: `provider=${provider}, model=${model}, messages=${!!messages}`,
    });
  }

  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) {
    return res.status(400).json({
      error: `Unknown provider: ${provider}`,
      available: Object.keys(PROVIDER_CONFIG),
    });
  }

  const apiKey = process.env[cfg.envKey];
  if (!apiKey) {
    return res.status(500).json({
      error: `Server missing env var: ${cfg.envKey}`,
      hint: `请在 Vercel 后台 Settings → Environment Variables 添加 ${cfg.envKey}`,
    });
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    let url = cfg.url;

    // All providers use Bearer auth via OpenAI-compatible endpoints
    headers['Authorization'] = `Bearer ${apiKey}`;

    const body = { model, messages, temperature, max_tokens };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: 'Invalid JSON from upstream',
        http_status: upstream.status,
        raw: text.substring(0, 500),
      });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Upstream API error',
        provider,
        model,
        http_status: upstream.status,
        detail: data,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({
      error: 'Failed to reach upstream API',
      provider,
      detail: err.message,
    });
  }
}
