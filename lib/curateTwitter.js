// Orchestrates one curation run: fetch candidates -> curate with Claude -> store in Redis.
const Anthropic = require('@anthropic-ai/sdk');
const { fetchCandidates } = require('./twitterapi');
const { saveFeed } = require('./kv');

const MODEL = process.env.CURATION_MODEL || 'claude-opus-4-8';
const TARGET = 50;
const MAX_CANDIDATES = 220; // cap sent to the model to bound tokens/cost

const CATEGORIES = ['Pajak ID', 'Makro ID', 'Finance Edu', 'Global Macro', 'Global Tax', 'Markets', 'Other'];

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    selected: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id:         { type: 'string' },
          category:   { type: 'string', enum: CATEGORIES },
          region:     { type: 'string', enum: ['ID', 'Global'] },
          summary_id: { type: 'string' },
        },
        required: ['id', 'category', 'region', 'summary_id'],
      },
    },
  },
  required: ['selected'],
};

function buildPrompt(candidates) {
  const compact = candidates.map((c) => ({
    id: c.id,
    region: c.region,
    handle: c.handle,
    text: c.text.slice(0, 280),
    likes: c.likes,
    rt: c.retweets,
    replies: c.replies,
  }));
  return [
    `You are a finance/economics news curator for an Indonesian audience (tax consulting firm).`,
    `From the candidate tweets below, select the strongest items to help the reader stay current on:`,
    `tax, macroeconomics, finance, tax-regulation updates, and finance/economics education.`,
    ``,
    `Rules:`,
    `- Keep only genuinely relevant, informative tweets. DROP spam, ads, giveaways, engagement-bait, pure shilling, and off-topic chatter.`,
    `- Select up to ${TARGET} items, ranked best-first by relevance × engagement.`,
    `- TARGET MIX: ~28 Indonesian (region "ID") and ~22 international (region "Global"). Fill the ID slots FIRST — prioritize relevant Indonesian items. Only include fewer than ~28 ID if there genuinely aren't enough relevant Indonesian tweets in the candidates; never pad with spam or off-topic items to hit the number.`,
    `- Tweets in Bahasa Indonesia, or about Indonesia's economy/tax/markets, are region "ID". Everything else is "Global".`,
    `- For each selected item: set "category" (one of ${CATEGORIES.join(', ')}), confirm "region" (ID or Global), and write "summary_id": ONE concise sentence in Bahasa Indonesia explaining why it matters.`,
    `- Use the exact "id" from the candidate. Do not invent items.`,
    ``,
    `Candidates (JSON):`,
    JSON.stringify(compact),
  ].join('\n');
}

async function curateWithClaude(candidates) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const req = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt(candidates) }],
  };
  // Adaptive thinking is supported on Opus/Sonnet/Fable but not Haiku — only send it where valid.
  if (!/haiku/i.test(MODEL)) req.thinking = { type: 'adaptive' };
  const msg = await client.messages.create(req);
  const textBlock = msg.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('curation: no text block in model response');
  const parsed = JSON.parse(textBlock.text);
  return Array.isArray(parsed.selected) ? parsed.selected : [];
}

// Join the model's selection back to full candidate data, in the model's ranked order.
function assemble(selected, candidates) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const items = [];
  for (const s of selected) {
    const c = byId.get(String(s.id));
    if (!c) continue;
    items.push({
      id: c.id,
      url: c.url,
      author: c.author,
      handle: c.handle,
      text: c.text,
      summaryId: s.summary_id || '',
      category: s.category || 'Other',
      region: s.region || c.region || 'Global',
      likes: c.likes,
      retweets: c.retweets,
      replies: c.replies,
      createdAt: c.createdAt,
    });
    if (items.length >= TARGET) break;
  }
  return items;
}

function todayJakarta() {
  // en-CA renders as YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

async function runCuration() {
  const { candidates, perQuery } = await fetchCandidates({ windowHours: 30, maxPagesPerQuery: 2 });
  const ranked = candidates
    .sort((a, b) => (b.likes + b.retweets + b.replies) - (a.likes + a.retweets + a.replies))
    .slice(0, MAX_CANDIDATES);

  let items = [];
  if (ranked.length) {
    const selected = await curateWithClaude(ranked);
    items = assemble(selected, ranked);
  }

  const date = todayJakarta();
  const payload = { generatedAt: new Date().toISOString(), date, count: items.length, items };
  await saveFeed(date, payload);

  return { date, candidates: candidates.length, ranked: ranked.length, curated: items.length, perQuery };
}

module.exports = { runCuration, curateWithClaude, MODEL };
