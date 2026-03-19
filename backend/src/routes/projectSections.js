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

// ============================================================
// POST /move-task — Move a task between sections (atomic transaction)
// ============================================================
router.post('/move-task', async (req, res) => {
  try {
    const userId = req.user.id;
    const { task_id, source_phase_id, target_phase_id, new_order } = req.body;

    if (!task_id || !source_phase_id || !target_phase_id) {
      return res.status(400).json({ error: 'task_id, source_phase_id, and target_phase_id required' });
    }

    // Fetch both phases (verify ownership via project)
    const { data: sourcePhase, error: srcErr } = await supabase
      .from('project_phases')
      .select('id, tasks, project_id')
      .eq('id', source_phase_id)
      .single();

    if (srcErr || !sourcePhase) return res.status(404).json({ error: 'Source section not found' });

    // Verify user owns the project
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', sourcePhase.project_id)
      .eq('user_id', userId)
      .single();

    if (!project) return res.status(403).json({ error: 'Not authorized' });

    const { data: targetPhase, error: tgtErr } = await supabase
      .from('project_phases')
      .select('id, tasks')
      .eq('id', target_phase_id)
      .single();

    if (tgtErr || !targetPhase) return res.status(404).json({ error: 'Target section not found' });

    // Find and remove task from source
    const sourceTasks = sourcePhase.tasks || [];
    const taskIndex = sourceTasks.findIndex(t => t.id === task_id);
    if (taskIndex === -1) return res.status(404).json({ error: 'Task not found in source section' });

    const [movedTask] = sourceTasks.splice(taskIndex, 1);

    // Add task to target at specified position
    const targetTasks = targetPhase.tasks || [];
    const insertAt = Math.min(new_order || 0, targetTasks.length);
    targetTasks.splice(insertAt, 0, movedTask);

    // Reorder both arrays
    sourceTasks.forEach((t, i) => { t.order = i; });
    targetTasks.forEach((t, i) => { t.order = i; });

    // Atomic writes — update both phases
    const { error: updateSrcErr } = await supabase
      .from('project_phases')
      .update({ tasks: sourceTasks })
      .eq('id', source_phase_id);

    if (updateSrcErr) throw new Error(`Failed to update source: ${updateSrcErr.message}`);

    const { error: updateTgtErr } = await supabase
      .from('project_phases')
      .update({ tasks: targetTasks })
      .eq('id', target_phase_id);

    if (updateTgtErr) {
      // Rollback source — put task back
      sourceTasks.splice(taskIndex, 0, movedTask);
      sourceTasks.forEach((t, i) => { t.order = i; });
      await supabase.from('project_phases').update({ tasks: sourceTasks }).eq('id', source_phase_id);
      throw new Error(`Failed to update target: ${updateTgtErr.message}`);
    }

    // Update worker_tasks phase_task_id if it changed context
    // (phase_task_id stays the same since it's the task's own ID, but we update the description link)
    // No change needed — phase_task_id is the task.id which didn't change

    logger.info(`[Sections] Moved task ${task_id} from ${source_phase_id} to ${target_phase_id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('[Sections] Move task error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to move task' });
  }
});

// ============================================================
// PATCH /reorder-tasks — Reorder tasks within a single section
// ============================================================
router.patch('/reorder-tasks', async (req, res) => {
  try {
    const userId = req.user.id;
    const { phase_id, task_ids } = req.body;

    if (!phase_id || !task_ids || !Array.isArray(task_ids)) {
      return res.status(400).json({ error: 'phase_id and task_ids array required' });
    }

    // Fetch phase and verify ownership
    const { data: phase } = await supabase
      .from('project_phases')
      .select('id, tasks, project_id')
      .eq('id', phase_id)
      .single();

    if (!phase) return res.status(404).json({ error: 'Section not found' });

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', phase.project_id)
      .eq('user_id', userId)
      .single();

    if (!project) return res.status(403).json({ error: 'Not authorized' });

    // Reorder tasks based on provided ID order
    const tasks = phase.tasks || [];
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const reordered = task_ids
      .map(id => taskMap.get(id))
      .filter(Boolean)
      .map((t, i) => ({ ...t, order: i }));

    // Add any tasks not in the provided list at the end (safety net)
    const providedIds = new Set(task_ids);
    tasks.filter(t => !providedIds.has(t.id)).forEach((t, i) => {
      reordered.push({ ...t, order: reordered.length + i });
    });

    const { error } = await supabase
      .from('project_phases')
      .update({ tasks: reordered })
      .eq('id', phase_id);

    if (error) throw error;

    res.json({ success: true, tasks: reordered });
  } catch (error) {
    logger.error('[Sections] Reorder error:', error.message);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

module.exports = router;
