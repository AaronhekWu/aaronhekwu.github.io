// Vercel Serverless Function — proxies LLM requests, keeps API keys server-side.
// Environment variables required in Vercel dashboard:
//   GEMINI_API_KEY, OPENAI_API_KEY, MINIMAX_API_KEY, QWEN_API_KEY

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

  const { provider, model, messages, temperature = 0.7, max_tokens = 8000 } = req.body;

  if (!provider || !model || !messages) {
    return res.status(400).json({ error: 'Missing required fields: provider, model, messages' });
  }

  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
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
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Upstream API error', detail: data });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach upstream API', detail: err.message });
  }
}
