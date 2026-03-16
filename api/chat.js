const PROVIDER_CONFIG = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
  },
  gpt5mini: {
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
  },
  minimax: {
    url: 'https://api.minimaxi.chat/v1/chat/completions',
    envKey: 'MINIMAX_API_KEY',
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, model, messages, temperature = 0.7, max_tokens = 8000, stream = false } = req.body || {};

  if (!provider || !model || !messages) {
    return res.status(400).json({
      error: 'Missing required fields',
      detail: `provider=${provider}, model=${model}, messages=${!!messages}`,
    });
  }

  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) {
    return res.status(400).json({ error: `Unknown provider: ${provider}`, available: Object.keys(PROVIDER_CONFIG) });
  }

  const apiKey = process.env[cfg.envKey];
  if (!apiKey) {
    return res.status(500).json({ error: `Server missing env var: ${cfg.envKey}` });
  }

  try {
    const upstream = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens, stream: !!stream }),
    });

    if (stream) {
      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => '');
        return res.status(upstream.status).json({ error: 'Upstream API error', detail: errBody.substring(0, 500) });
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      const reader = upstream.body?.getReader();
      if (!reader) {
        return res.status(502).json({ error: 'Upstream stream unavailable' });
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    }

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'Invalid JSON from upstream', http_status: upstream.status, raw: text.substring(0, 500) });
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
    return res.status(502).json({ error: 'Failed to reach upstream API', provider, detail: err.message });
  }
}
