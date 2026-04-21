/**
 * AI helper routes
 *
 * POST /api/ai/suggest-checklist-labor
 *   Generates suggested daily checklist items + labor roles for a project,
 *   based on its name, services, and phases. Used by the ProjectBuilder
 *   "Suggest with AI" button. JSON only — does NOT touch the database.
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const logger = require('../utils/logger');
const { authenticateUser } = require('../middleware/authenticate');

router.use(authenticateUser);

const FALLBACK_RESPONSE = {
  checklist_items: [
    { title: 'Site clean at end of day', item_type: 'checkbox', requires_photo: false },
    { title: 'Photos of completed work', item_type: 'checkbox', requires_photo: true },
    { title: 'Materials staged for tomorrow', item_type: 'checkbox', requires_photo: false },
  ],
  labor_roles: [
    { role_name: 'Lead Carpenter', default_quantity: 1 },
    { role_name: 'Helper', default_quantity: 1 },
  ],
  source: 'fallback',
};

router.post('/suggest-checklist-labor', async (req, res) => {
  try {
    const { projectName, services, phases } = req.body || {};

    if (!projectName || typeof projectName !== 'string') {
      return res.status(400).json({ error: 'projectName is required' });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      logger.warn('[AI Suggest] OPENROUTER_API_KEY not set — returning fallback');
      return res.json(FALLBACK_RESPONSE);
    }

    const serviceLines = Array.isArray(services) && services.length
      ? services.map(s => typeof s === 'string' ? `- ${s}` : `- ${s.description || s.name || ''}${s.amount ? ` ($${s.amount})` : ''}`).join('\n')
      : '(none specified)';

    const phaseLines = Array.isArray(phases) && phases.length
      ? phases.map(p => {
          const tasks = Array.isArray(p.tasks) && p.tasks.length
            ? `: ${p.tasks.map(t => typeof t === 'string' ? t : (t.description || '')).filter(Boolean).join(', ')}`
            : '';
          return `- ${p.name || 'Phase'}${tasks}`;
        }).join('\n')
      : '(none specified)';

    const prompt = `You help contractors plan job sites. For the project below, generate practical end-of-day checklist items and labor role assignments.

PROJECT: ${projectName}
SERVICES:
${serviceLines}
PHASES:
${phaseLines}

RULES:
- Generate 4-8 checklist_items: short concrete actions a worker checks off at end of day. Set requires_photo: true for items that benefit from photo evidence (cleanups, completed work, damage). Use item_type: "checkbox" for simple yes/no, or "quantity" with quantity_unit (e.g. "bags", "sqft") for measurable items.
- Generate 2-5 labor_roles: trade roles relevant to the work (Lead Carpenter, Electrician, Helper, etc.) with default_quantity 1-3 indicating how many of that role typically work on this kind of project.
- Be specific to the project type — don't return generic items for every job.
- No scheduling, no dates.

Return ONLY valid JSON, no markdown:
{
  "checklist_items": [
    { "title": "...", "item_type": "checkbox" | "quantity", "quantity_unit": "...", "requires_photo": true | false }
  ],
  "labor_roles": [
    { "role_name": "...", "default_quantity": 1 }
  ]
}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - AI Suggest',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      logger.error(`[AI Suggest] OpenRouter HTTP ${response.status}`);
      return res.json(FALLBACK_RESPONSE);
    }

    const aiResult = await response.json();
    let content = aiResult.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    content = content.replace(/,(\s*[}\]])/g, '$1');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      logger.error('[AI Suggest] JSON parse failed:', content.substring(0, 200));
      return res.json(FALLBACK_RESPONSE);
    }

    const checklist_items = Array.isArray(parsed.checklist_items)
      ? parsed.checklist_items
          .filter(c => c && typeof c.title === 'string' && c.title.trim())
          .map(c => ({
            title: String(c.title).trim(),
            item_type: c.item_type === 'quantity' ? 'quantity' : 'checkbox',
            quantity_unit: c.quantity_unit ? String(c.quantity_unit).trim() : null,
            requires_photo: !!c.requires_photo,
          }))
      : [];

    const labor_roles = Array.isArray(parsed.labor_roles)
      ? parsed.labor_roles
          .filter(r => r && typeof r.role_name === 'string' && r.role_name.trim())
          .map(r => ({
            role_name: String(r.role_name).trim(),
            default_quantity: Math.max(1, parseInt(r.default_quantity, 10) || 1),
          }))
      : [];

    if (checklist_items.length === 0 && labor_roles.length === 0) {
      return res.json(FALLBACK_RESPONSE);
    }

    return res.json({ checklist_items, labor_roles, source: 'ai_generated' });
  } catch (error) {
    logger.error('[AI Suggest] Error:', error.message);
    return res.json(FALLBACK_RESPONSE);
  }
});

module.exports = router;
