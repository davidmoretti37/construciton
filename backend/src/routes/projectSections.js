/**
 * Project Sections Route
 * AI-powered generation of project sections (phases) with tasks from scope descriptions.
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// AUTHENTICATION (same pattern as other routes)
// ============================================================
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
};

router.use(authenticateUser);

// ============================================================
// POST /generate — Generate project sections from scope description
// ============================================================
router.post('/generate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { scope_text, estimate_id, project_type } = req.body;

    if (!scope_text && !estimate_id) {
      return res.status(400).json({ error: 'scope_text or estimate_id required' });
    }

    let scopeDescription = scope_text || '';

    // If estimate_id provided, build scope from estimate items
    if (estimate_id) {
      const { data: estimate } = await supabase
        .from('estimates')
        .select('items, project_name, phases')
        .eq('id', estimate_id)
        .eq('user_id', userId)
        .single();

      if (estimate) {
        const items = estimate.items || [];
        scopeDescription = `Project: ${estimate.project_name || 'Unnamed'}\nLine items:\n` +
          items.map(item => `- ${item.description} (${item.quantity} x $${item.unitPrice})`).join('\n');

        // If estimate already has phases, return those directly
        if (estimate.phases && estimate.phases.length > 0) {
          const sections = estimate.phases.map((phase, i) => ({
            name: phase.name,
            tasks: (phase.tasks || []).map((task, j) => ({
              id: `task-${Date.now()}-${i}-${j}`,
              description: typeof task === 'string' ? task : task.description || 'Untitled',
              order: j,
              completed: false,
            })),
          }));
          return res.json({ sections, source: 'estimate_phases' });
        }
      }
    }

    // Try to get relevant task templates from construction knowledge graph
    let templateContext = '';
    if (project_type) {
      const { data: templates } = await supabase
        .from('construction_task_templates')
        .select('name, trade, phase_category, duration_hours_avg')
        .contains('project_types', [project_type])
        .limit(30);

      if (templates && templates.length > 0) {
        templateContext = '\n\nRelevant construction tasks from knowledge base:\n' +
          templates.map(t => `- ${t.name} (${t.trade}, ${t.phase_category}, ~${t.duration_hours_avg}h)`).join('\n');
      }
    }

    // Also check user's saved phase templates
    const { data: profile } = await supabase
      .from('profiles')
      .select('phases_template, business_type')
      .eq('id', userId)
      .single();

    let userTemplateContext = '';
    if (profile?.phases_template?.phases) {
      userTemplateContext = '\n\nContractor\'s typical phases:\n' +
        profile.phases_template.phases.map(p => `- ${p.name}: ${(p.tasks || []).join(', ')}`).join('\n');
    }

    // Call AI to generate sections
    const prompt = `You are a construction project planning assistant. Given this project scope, generate a structured work breakdown into logical sections (phases) with specific tasks.

PROJECT SCOPE:
${scopeDescription}
${templateContext}
${userTemplateContext}

RULES:
- Create 3-8 sections based on the scope complexity
- Each section should have 3-8 specific, actionable tasks
- Tasks should be things a worker can check off (not vague like "do plumbing")
- Order sections in the logical construction sequence
- Use industry-standard terminology
- Don't include scheduling, dates, or durations — just the work breakdown

Return ONLY valid JSON, no markdown, no explanation:
[
  {
    "name": "Section Name",
    "tasks": ["Task 1 description", "Task 2 description"]
  }
]`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const aiResult = await response.json();
    let content = aiResult.choices?.[0]?.message?.content || '';

    // Clean up AI response
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Remove trailing commas before ] or }
    content = content.replace(/,(\s*[}\]])/g, '$1');

    let rawSections;
    try {
      rawSections = JSON.parse(content);
    } catch (parseErr) {
      logger.error('[Sections] Failed to parse AI response:', content.substring(0, 200));
      // Fallback: generic sections
      rawSections = [
        { name: 'Preparation', tasks: ['Site assessment', 'Material procurement', 'Tool setup'] },
        { name: 'Main Work', tasks: ['Primary installation', 'Quality check'] },
        { name: 'Completion', tasks: ['Cleanup', 'Final inspection', 'Client walkthrough'] },
      ];
    }

    // Format sections with proper task IDs
    const sections = rawSections.map((section, i) => ({
      name: section.name,
      tasks: (section.tasks || []).map((task, j) => ({
        id: `task-${Date.now()}-${i}-${j}`,
        description: typeof task === 'string' ? task : task.description || 'Untitled',
        order: j,
        completed: false,
      })),
    }));

    res.json({ sections, source: 'ai_generated' });
  } catch (error) {
    logger.error('[Sections] Generate error:', error.message);
    res.status(500).json({ error: 'Failed to generate project sections' });
  }
});

module.exports = router;
