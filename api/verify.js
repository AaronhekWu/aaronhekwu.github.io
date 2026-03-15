// Vercel Serverless Function — verifies which providers have API keys configured.
// Returns { providers: { gemini: true, gpt5mini: false, ... } }

const PROVIDER_ENVKEYS = {
  gemini: 'GEMINI_API_KEY',
  gpt5mini: 'OPENAI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  qwen: 'QWEN_API_KEY',
};

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const providers = {};
  for (const [key, envVar] of Object.entries(PROVIDER_ENVKEYS)) {
    providers[key] = !!process.env[envVar];
  }

  return res.status(200).json({ providers });
}
