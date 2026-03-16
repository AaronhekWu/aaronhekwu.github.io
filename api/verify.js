// Vercel Serverless Function — verifies which providers have API keys configured
// AND optionally tests real connectivity with ?ping=true
// Returns { providers: { gemini: true, gpt5mini: false, ... }, details: {...} }

const PROVIDER_CONFIG = {
  gemini: {
    envKey: 'GEMINI_API_KEY',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    testModel: 'gemini-2.5-flash',
  },
  gpt5mini: {
    envKey: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/chat/completions',
    testModel: 'gpt-4o-mini',
  },
  minimax: {
    envKey: 'MINIMAX_API_KEY',
    url: 'https://api.minimaxi.chat/v1/chat/completions',
    testModel: 'MiniMax-M2.5',
  },
  qwen: {
    envKey: 'QWEN_API_KEY',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    testModel: 'qwen-turbo',
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const doPing = req.query?.ping === 'true';
  const providers = {};
  const details = {};

  for (const [key, cfg] of Object.entries(PROVIDER_CONFIG)) {
    const apiKey = process.env[cfg.envKey];
    const hasKey = !!apiKey;

    if (!hasKey) {
      providers[key] = false;
      details[key] = { hasKey: false, reason: `env ${cfg.envKey} not set` };
      continue;
    }

    if (!doPing) {
      // Quick mode: just check env var existence
      providers[key] = true;
      details[key] = { hasKey: true };
      continue;
    }

    // Ping mode: make a real API call to verify key works
    try {
      const resp = await fetch(cfg.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.testModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
      });

      if (resp.ok) {
        providers[key] = true;
        details[key] = { hasKey: true, ping: 'ok', status: resp.status };
      } else {
        const errorData = await resp.text().catch(() => '');
        providers[key] = false;
        details[key] = {
          hasKey: true,
          ping: 'fail',
          status: resp.status,
          error: errorData.substring(0, 200),
        };
      }
    } catch (err) {
      providers[key] = false;
      details[key] = { hasKey: true, ping: 'error', error: err.message };
    }
  }

  return res.status(200).json({ providers, details });
}
