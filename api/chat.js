// Vercel Serverless Function — proxies LLM requests, keeps API keys server-side.
// Environment variables required in Vercel dashboard:
//   GEMINI_API_KEY, AIMLAPI_KEY, DEEPSEEK_API_KEY, QWEN_API_KEY (set whichever you use)

const PROVIDER_CONFIG = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
  },
  gpt5mini: {
    url: 'https://api.aimlapi.com/v1/chat/completions',
    envKey: 'AIMLAPI_KEY',
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
  },
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, model, messages, temperature = 0.7, max_tokens = 800 } = req.body;

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
