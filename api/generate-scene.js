// Vercel Serverless Function — generates NVC training scenarios via LLM
// POST /api/generate-scene { provider, model }
// Falls back to trying all configured providers if none specified

const PROVIDER_CONFIG = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
  },
  gpt5mini: {
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  minimax: {
    url: 'https://api.minimaxi.chat/v1/chat/completions',
    envKey: 'MINIMAX_API_KEY',
    defaultModel: 'MiniMax-M2.5',
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
    defaultModel: 'qwen-turbo',
  },
};

const SCENARIO_PROMPT = `你是一个非暴力沟通教学场景设计师。请生成一个适合练习"非暴力沟通四步法"的生活化场景。

要求：
1. 场景要贴近真实生活，涉及家庭、校园、职场、友情等常见关系冲突
2. 角色要有鲜明性格和合理的情绪状态
3. 冲突要有具体背景和细节，不能太抽象
4. 每次生成不同类型的场景，确保多样性

请严格按以下JSON格式输出，不要有其他内容：
{
  "scenario": { "title": "场景标题（10字以内）", "description": "场景描述（80字以内）", "setting": "对话场景" },
  "character": { "name": "角色姓名", "age": "年龄", "identity": "身份", "personality": "性格特征（30字以内）", "emotion_state": "当前情绪状态（20字以内）", "core_issue": "核心困扰（30字以内）", "avatar_emoji": "代表角色的emoji（1个）" },
  "player": { "role": "玩家扮演的角色", "goal": "沟通目标（30字以内）" },
  "opening": { "scene_desc": "场景描写（30字以内）", "first_line": "角色的第一句台词（30字以内）" },
  "judgment_keywords": {
    "step1_bad_words": ["评判性词语至少8个"],
    "step2_bad_words": ["指责性句式至少6个"],
    "step3_bad_words": ["比较/含糊词语至少6个"],
    "step4_bad_words": ["命令式词语至少6个"],
    "step2_good_words": ["表达感受词语至少6个"],
    "step3_good_words": ["表达需求词语至少5个"],
    "step4_good_words": ["协商式请求词语至少5个"]
  },
  "emotion_responses": {
    "step1_pass": { "emotion": "sad", "response": "通过后回应50字内" },
    "step1_fail": { "emotion": "angry", "response": "失败后回应50字内" },
    "step2_pass": { "emotion": "touched", "response": "通过后回应50字内" },
    "step2_fail": { "emotion": "defensive", "response": "失败后回应50字内" },
    "step3_pass": { "emotion": "relieved", "response": "通过后回应50字内" },
    "step3_fail": { "emotion": "defensive", "response": "失败后回应50字内" },
    "step4_pass": { "emotion": "happy", "response": "通过后回应50字内" },
    "step4_fail": { "emotion": "angry", "response": "失败后回应50字内" }
  }
}`;

async function callProvider(cfg, apiKey, model) {
  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: SCENARIO_PROMPT }],
      temperature: 0.9,
      max_tokens: 1200,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`${resp.status}: ${errText.substring(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API');

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  return JSON.parse(jsonMatch[0]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, model } = req.body || {};

  // If specific provider requested, use it
  if (provider && PROVIDER_CONFIG[provider]) {
    const cfg = PROVIDER_CONFIG[provider];
    const apiKey = process.env[cfg.envKey];
    if (!apiKey) {
      return res.status(500).json({ error: `Missing env var: ${cfg.envKey}` });
    }
    try {
      const scene = await callProvider(cfg, apiKey, model || cfg.defaultModel);
      return res.status(200).json(scene);
    } catch (err) {
      return res.status(502).json({ error: err.message, provider });
    }
  }

  // Otherwise try all configured providers
  const errors = [];
  for (const [id, cfg] of Object.entries(PROVIDER_CONFIG)) {
    const apiKey = process.env[cfg.envKey];
    if (!apiKey) continue;
    try {
      const scene = await callProvider(cfg, apiKey, cfg.defaultModel);
      return res.status(200).json(scene);
    } catch (err) {
      errors.push({ provider: id, error: err.message });
    }
  }

  return res.status(503).json({
    error: 'No available provider could generate a scene',
    details: errors,
  });
}
