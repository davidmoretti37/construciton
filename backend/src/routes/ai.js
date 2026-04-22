/**
 * AI helper routes
 *
 * POST /api/ai/suggest-checklist-labor
 *   Generates suggested RECURRING daily checklist items + labor roles for a
 *   project, based on its name and service category. Used by the
 *   ProjectBuilder "Suggest with AI" button. JSON only — does NOT touch
 *   the database.
 *
 *   Important: only the project NAME and a coarse service summary are
 *   considered. Phase-specific tasks are intentionally NOT fed in — they
 *   confuse the model into echoing one-time milestones back as "daily"
 *   items (e.g. "All plumbing pressure tested" is a phase milestone, not
 *   a recurring daily check).
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const logger = require('../utils/logger');
const { authenticateUser } = require('../middleware/authenticate');

router.use(authenticateUser);

const FALLBACK_RESPONSE = {
  checklist_items: [
    { title: 'Crew head count', item_type: 'quantity', quantity_unit: 'workers', requires_photo: false },
    { title: 'PPE check completed', item_type: 'checkbox', requires_photo: false },
    { title: 'Site photo — start of day', item_type: 'checkbox', requires_photo: true },
    { title: 'Site photo — end of day', item_type: 'checkbox', requires_photo: true },
    { title: 'Daily safety walkthrough', item_type: 'checkbox', requires_photo: false },
    { title: 'Work area cleaned & tools secured', item_type: 'checkbox', requires_photo: false },
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
    const { projectName, services } = req.body || {};

    if (!projectName || typeof projectName !== 'string') {
      return res.status(400).json({ error: 'projectName is required' });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      logger.warn('[AI Suggest] OPENROUTER_API_KEY not set — returning fallback');
      return res.json(FALLBACK_RESPONSE);
    }

    // Coarse service category — just the names, no per-phase task lists.
    // Feeding tasks in causes the model to echo phase-completion milestones
    // back as "daily" items.
    const serviceLines = Array.isArray(services) && services.length
      ? services.map(s => typeof s === 'string' ? `- ${s}` : `- ${s.description || s.name || ''}`).filter(l => l !== '- ').join('\n')
      : '(none specified)';

    const prompt = `You generate the RECURRING daily checklist a construction crew fills out EVERY workday on a job site.

PROJECT: ${projectName}
SERVICE CATEGORIES:
${serviceLines}

CRITICAL RULES — read carefully:

1. EVERY item must be something a worker does/records EVERY DAY, all the way through the job. NOT one-time milestones, NOT phase-completion checks.

2. Forbidden item types — DO NOT generate any of these:
   ❌ Phase milestones: "All plumbing pressure tested", "Electrical rough-in complete", "Tile layout checked", "Drywall mud applied" — these happen ONCE per project and belong in phase tasks, not daily checks.
   ❌ Project deliverables: "Cabinets installed", "Roof shingles laid", "Foundation poured"
   ❌ Inspections that happen on a specific day: "Final walkthrough", "City inspection passed"

3. Required item types — your list should be drawn from these patterns:
   ✅ Headcount / roll call: "Crew head count" (quantity, workers)
   ✅ Safety: "PPE check completed", "Daily safety walkthrough", "Job hazard analysis filled"
   ✅ Photos: "Site photo — start of day" (photo), "Site photo — end of day" (photo)
   ✅ Daily progress quantities specific to the trade (linear ft, sqft, bags, gallons installed/used today)
   ✅ Cleanup / housekeeping: "Work area cleaned & tools secured", "Debris bagged & removed"
   ✅ Materials: "Materials staged for tomorrow", "Materials/equipment locked up"
   ✅ Communication: "Daily log photo sent to PM", "Issues/blockers communicated"

4. Generate 5-8 items. Mix checkbox + quantity items. Use requires_photo: true ONLY for items that genuinely need visual evidence (start/end-of-day site photos, damage, completed cleanup).

5. Generate 2-5 labor_roles relevant to the trade (Lead Carpenter, Electrician, Plumber, Helper, etc.) with default_quantity 1-3.

6. No scheduling. No dates. No phase names.

EXAMPLES of well-formed output:

For a bathroom remodel:
- "Crew head count" (quantity, workers)
- "PPE & safety briefing complete" (checkbox)
- "Site photo — start of day" (checkbox, photo)
- "Linear feet of pipe installed today" (quantity, ft)
- "Sqft of tile laid today" (quantity, sqft)
- "Site photo — end of day" (checkbox, photo)
- "Work area swept & tools secured" (checkbox)
- "Materials/equipment locked up" (checkbox)

For roofing:
- "Crew head count" (quantity, workers)
- "Fall protection inspected" (checkbox)
- "Bundles of shingles installed today" (quantity, bundles)
- "Squares of underlayment laid" (quantity, squares)
- "Debris removed from yard" (checkbox)
- "Tarp secured for overnight" (checkbox)
- "Site photo — end of day" (checkbox, photo)

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
