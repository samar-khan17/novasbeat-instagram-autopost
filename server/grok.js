// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — AI text generation via NVIDIA NIM
// Uses NVIDIA_KEY_1/2/3 key pool with automatic rotation on 429/401.
// Model: meta/llama-3.3-70b-instruct  (OpenAI-compatible endpoint)
// ═══════════════════════════════════════════════════════════════════
import OpenAI from 'openai';

const NVIDIA_BASE  = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_MODEL = process.env.NVIDIA_TEXT_MODEL || 'meta/llama-3.3-70b-instruct';

let _keyIdx = 0;

function getKeys() {
  const keys = [
    process.env.NVIDIA_KEY_1,
    process.env.NVIDIA_KEY_2,
    process.env.NVIDIA_KEY_3,
  ].filter(Boolean);
  if (!keys.length) throw new Error('No NVIDIA keys set (NVIDIA_KEY_1/2/3 in .env)');
  return keys;
}

// Calls fn(client) with key rotation on 429 / 401 / 403.
async function withKeyRotation(fn) {
  const keys = getKeys();
  let lastErr;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[(_keyIdx + attempt) % keys.length];
    const ai  = new OpenAI({ baseURL: NVIDIA_BASE, apiKey: key });
    try {
      const result = await fn(ai);
      _keyIdx = (_keyIdx + attempt + 1) % keys.length;
      return result;
    } catch (e) {
      lastErr = e;
      const status = e.status || e.response?.status;
      if (status === 429 || status === 401 || status === 403) continue;
      throw e;
    }
  }
  throw lastErr;
}

// ── Full Instagram caption (150-200 words) ────────────────────────────
export async function generateCaption(headline, body) {
  const snippet = String(body || '').slice(0, 800);
  return withKeyRotation(async (ai) => {
    const res = await ai.chat.completions.create({
      model: NVIDIA_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert social media manager for NovasBeat, a premium AI-powered news platform. Write engaging, informative, and professional captions.',
        },
        {
          role: 'user',
          content:
            'Write a compelling Instagram caption for this news article.\n' +
            'Requirements:\n' +
            '- 150-200 words\n' +
            '- Start with a powerful hook sentence\n' +
            '- Include key facts from the article\n' +
            '- End with a call to action (e.g. "Follow @novasbeatnews for live updates")\n' +
            '- Do NOT include hashtags\n' +
            '- Be informative and journalistic in tone\n\n' +
            `Headline: ${headline}\n` +
            `Article: ${snippet}`,
        },
      ],
      temperature: 0.75,
      max_tokens: 400,
    });
    return (res.choices?.[0]?.message?.content || '').trim();
  });
}

// ── 15 relevant hashtags ──────────────────────────────────────────────
export async function generateHashtags(headline, body) {
  return withKeyRotation(async (ai) => {
    const res = await ai.chat.completions.create({
      model: NVIDIA_MODEL,
      messages: [
        { role: 'system', content: 'You are a social media hashtag expert for a news brand.' },
        {
          role: 'user',
          content:
            'Generate exactly 15 relevant, trending Instagram hashtags for this news article.\n' +
            'Mix general news hashtags with topic-specific ones.\n' +
            'Return ONLY hashtags separated by spaces, no other text.\n' +
            `Headline: ${headline}`,
        },
      ],
      temperature: 0.6,
      max_tokens: 150,
    });

    let tags = (res.choices?.[0]?.message?.content || '').trim();
    tags = tags
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t.replace(/[^a-z0-9_]/gi, '')}`))
      .filter((t) => t.length > 1)
      .join(' ');
    return tags;
  });
}

// ── 3 key info points for the icon cards ─────────────────────────────
// Returns: [{ title, desc, icon }, ...]
// icon: law | shield | people | chart | globe | fire | clock | star
export async function generateKeyPoints(headline, body) {
  const snippet = String(body || '').slice(0, 600);

  try {
    return await withKeyRotation(async (ai) => {
      const res = await ai.chat.completions.create({
        model: NVIDIA_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a news analyst. Return ONLY valid JSON — no markdown, no explanation.',
          },
          {
            role: 'user',
            content:
              'Generate exactly 3 key highlights for an Instagram news card infographic.\n' +
              'Return ONLY a JSON array with exactly 3 objects:\n' +
              '[{"title":"MAX 3 WORDS ALL CAPS","desc":"short phrase max 6 words","icon":"one of: law|shield|people|chart|globe|fire|clock|star"}]\n\n' +
              `Headline: ${headline}\n` +
              `Article: ${snippet}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 250,
      });

      const text  = (res.choices?.[0]?.message?.content || '').trim();
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr) && arr.length >= 3) {
          return arr.slice(0, 3).map((kp) => ({
            title: String(kp.title || 'KEY UPDATE').toUpperCase().slice(0, 22),
            desc:  String(kp.desc  || '').slice(0, 40),
            icon:  String(kp.icon  || 'star'),
          }));
        }
      }
      throw new Error('Invalid key points response');
    });
  } catch (e) {
    console.warn('[grok] generateKeyPoints failed:', e.message);
  }

  // Category-aware fallback
  const cat = String(headline || '').toLowerCase();
  if (cat.match(/court|law|election|vote|govern|democra/)) {
    return [
      { title: 'LEGAL VERDICT',  desc: 'Constitutional decision made',  icon: 'law'    },
      { title: 'DEMOCRACY',      desc: 'Democratic process upheld',      icon: 'shield' },
      { title: 'PUBLIC TRUST',   desc: 'Transparency & accountability',  icon: 'people' },
    ];
  }
  if (cat.match(/tech|ai|digital|cyber|software|app/)) {
    return [
      { title: 'TECH UPDATE',    desc: 'Innovation breakthrough',        icon: 'chart'  },
      { title: 'GLOBAL IMPACT',  desc: 'Worldwide adoption expected',    icon: 'globe'  },
      { title: 'FUTURE VISION',  desc: 'New possibilities emerge',       icon: 'star'   },
    ];
  }
  if (cat.match(/econom|market|trade|finance|stock|bank/)) {
    return [
      { title: 'MARKET UPDATE',  desc: 'Financial sector impacted',      icon: 'chart'  },
      { title: 'GLOBAL TRADE',   desc: 'International markets affected', icon: 'globe'  },
      { title: 'ECONOMIC SHIFT', desc: 'Significant policy changes',     icon: 'clock'  },
    ];
  }
  return [
    { title: 'BREAKING UPDATE',  desc: 'Major development underway',     icon: 'fire'   },
    { title: 'GLOBAL IMPACT',    desc: 'World attention focused here',   icon: 'globe'  },
    { title: 'EXPERT ANALYSIS',  desc: 'In-depth coverage follows',      icon: 'star'   },
  ];
}

// ── Punchy 2-line headline for Instagram graphic ──────────────────────
// Returns: { line1: string, line2: string } — both UPPERCASE
export async function generateShortHeadline(headline, body) {
  const snippet = String(body || '').slice(0, 300);

  try {
    return await withKeyRotation(async (ai) => {
      const res = await ai.chat.completions.create({
        model: NVIDIA_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a breaking-news graphic designer. Return ONLY valid JSON. No markdown, no explanation.',
          },
          {
            role: 'user',
            content:
              'Rewrite this headline into a punchy 2-line Instagram graphic headline.\n' +
              'Rules:\n' +
              '- Total 5-9 words split across TWO lines\n' +
              '- Line 1: 3-5 words (subject/context — displayed white)\n' +
              '- Line 2: 2-4 words (action/impact — displayed in purple gradient)\n' +
              '- ALL UPPERCASE\n' +
              '- No punctuation except colons or dashes\n' +
              '- Dramatic, like a breaking news chyron\n' +
              'Return ONLY: {"line1":"...","line2":"..."}\n\n' +
              `Headline: ${headline}\n` +
              (snippet ? `Context: ${snippet}` : ''),
          },
        ],
        temperature: 0.7,
        max_tokens: 80,
      });

      const text  = (res.choices?.[0]?.message?.content || '').trim();
      const match = text.match(/\{[^}]+\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        if (obj.line1 && obj.line2) {
          return {
            line1: String(obj.line1).toUpperCase().trim(),
            line2: String(obj.line2).toUpperCase().trim(),
          };
        }
      }
      throw new Error('Invalid headline response');
    });
  } catch (e) {
    console.warn('[grok] generateShortHeadline failed:', e.message);
  }

  // Fallback: split original headline at midpoint
  const words = String(headline).toUpperCase().trim().split(/\s+/);
  const mid   = Math.ceil(words.length / 2);
  return {
    line1: words.slice(0, mid).join(' '),
    line2: words.slice(mid).join(' ') || words.slice(0, 1).join(' '),
  };
}

export default { generateCaption, generateHashtags, generateKeyPoints, generateShortHeadline };
