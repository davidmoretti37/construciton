/**
 * AI Template Generation Service
 * Generates service templates (items & phases) for ANY service type
 * Uses AI to create realistic workflows for services not in the database
 */

import { sendMessageToAI } from './aiService';
import {
  createServiceCategory,
  addServiceItems,
  addPhaseTemplates,
  getServiceByName,
  serviceExists,
} from './serviceDataService';

/**
 * Generate a complete service template using AI
 * @param {string} serviceName - Name of the service (e.g., "Pool Cleaning", "Bee Removal")
 * @returns {Promise<object>} Generated template with category, items, and phases
 */
export const generateServiceTemplate = async (serviceName) => {
  try {
    // Create the AI prompt
    const prompt = getTemplateGenerationPrompt(serviceName);

    // Call AI with a custom system prompt
    const response = await sendMessageToAI(
      prompt,
      {}, // No project context needed
      [], // No conversation history
      getTemplateSystemPrompt() // Custom system prompt for template generation
    );

    // Parse AI response
    const template = parseAIResponse(response, serviceName);

    return template;
  } catch (error) {
    console.error('Error generating template:', error);
    throw new Error(`Failed to generate template for ${serviceName}: ${error.message}`);
  }
};

/**
 * Generate and save a service template to the database
 * @param {string} serviceName - Name of the service
 * @returns {Promise<object>} Saved service with items and phases
 */
export const generateAndSaveTemplate = async (serviceName) => {
  try {
    // Check if service already exists
    const exists = await serviceExists(serviceName);
    if (exists) {
      console.log(`✓ Service "${serviceName}" already exists in database`);
      return await getServiceByName(serviceName);
    }

    // Generate template with AI
    const template = await generateServiceTemplate(serviceName);

    // Save to database
    console.log(`💾 Saving template for: ${serviceName}`);

    // 1. Create service category
    const category = await createServiceCategory({
      name: template.name,
      description: template.description,
      icon: template.icon,
    });

    // 2. Add service items
    if (template.items && template.items.length > 0) {
      await addServiceItems(category.id, template.items);
    }

    // 3. Add phase templates
    if (template.phases && template.phases.length > 0) {
      await addPhaseTemplates(category.id, template.phases);
    }

    console.log(`✅ Template saved to database with ID: ${category.id}`);

    return {
      ...category,
      items: template.items,
      phases: template.phases,
    };
  } catch (error) {
    console.error('❌ Error generating and saving template:', error);
    throw error;
  }
};

/**
 * Get the system prompt for template generation
 */
function getTemplateSystemPrompt() {
  return `You are a specialized AI expert in creating service workflow templates. Your specialty is generating realistic, industry-specific phases and tasks.

CRITICAL REQUIREMENTS:

PHASES (2-3 total):
- Generate ONLY 2-3 broad phases (not 4-7)
- Each phase must be UNIQUE and SPECIFIC to the service type
- NO generic phases like "Assessment", "Execution", "Completion"
- Use actual industry workflow milestones
- Phases must be in the order professionals actually follow

TASKS (4-6 per phase):
- Each phase should have 4-6 detailed, actionable tasks
- Tasks must be specific to the service type (use industry terminology)
- Include safety, preparation, quality checks where relevant
- Make tasks clear and actionable (not vague)

SERVICE ITEMS (3-5 items):
- Typical items/services that professionals offer
- Accurate descriptions of what's included
- Appropriate units: "sq ft", "linear ft", "hour", "job", "unit", "room"

EXAMPLES OF GOOD VS BAD PHASES:

❌ BAD (Generic):
Service: "Pool Cleaning"
- Phase 1: "Assessment"
- Phase 2: "Execution"
- Phase 3: "Completion"

✅ GOOD (Service-Specific):
Service: "Pool Cleaning"
- Phase 1: "Water Testing & Chemical Treatment"
- Phase 2: "Physical Cleaning & Maintenance"
- Phase 3: "Final Balance & Quality Check"

❌ BAD (Generic):
Service: "House Painting"
- Phase 1: "Preparation"
- Phase 2: "Painting"
- Phase 3: "Cleanup"

✅ GOOD (Service-Specific):
Service: "House Painting"
- Phase 1: "Surface Prep & Primer"
- Phase 2: "Paint Application (Coats 1-2)"
- Phase 3: "Trim, Touch-ups & Inspection"

IMPORTANT:
- NO pricing information
- Return ONLY valid JSON (no markdown, no extra text)
- Be realistic and professional

OUTPUT FORMAT:
{
  "name": "Service Name",
  "description": "What this service provides",
  "icon": "ionicons-name",
  "items": [
    {
      "name": "Item name",
      "description": "What's included",
      "unit": "sq ft | hour | job | unit | linear ft | room"
    }
  ],
  "phases": [
    {
      "name": "Specific Phase Name (not generic)",
      "description": "What happens in this phase",
      "defaultDays": 1-7,
      "tasks": [
        "Detailed task 1",
        "Detailed task 2",
        "Detailed task 3",
        "Detailed task 4"
      ]
    }
  ]
}`;
}

/**
 * Get the prompt for a specific service
 */
function getTemplateGenerationPrompt(serviceName) {
  return `Generate a professional template for "${serviceName}" service.

REQUIREMENTS:
1. Create 2-3 SPECIFIC phases (not generic ones)
2. Each phase should have 4-6 detailed tasks
3. 3-5 service items with accurate descriptions

CRITICAL: NO generic phases like "Assessment", "Execution", "Completion"!

For "${serviceName}", think:
- What are the ACTUAL steps professionals follow?
- What makes "${serviceName}" different from other services?
- What industry-specific workflow do experts use?

Create phases that are UNIQUE to "${serviceName}" using real industry practices.

Return ONLY valid JSON (no markdown, no extra text).`;
}

/**
 * Parse AI response and validate structure
 */
function parseAIResponse(aiResponse, serviceName) {
  try {
    // AI response should already be parsed JSON (from aiService)
    let template;

    if (typeof aiResponse === 'string') {
      // If it's still a string, try to parse and repair it
      let content = aiResponse.trim();

      // Remove markdown if present
      content = content.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

      // Try to repair truncated JSON
      if (!content.endsWith('}') && !content.endsWith(']}')) {
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          content += '}'.repeat(openBraces - closeBraces);
        }
        content = content.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      }

      template = JSON.parse(content);
    } else if (aiResponse.text) {
      // If it's wrapped in our response format
      template = typeof aiResponse.text === 'string'
        ? JSON.parse(aiResponse.text)
        : aiResponse.text;
    } else {
      template = aiResponse;
    }

    // Validate and fix required fields
    if (!template.name) {
      template.name = serviceName;
    }

    if (!template.description) {
      template.description = `Professional ${serviceName} services`;
    }

    if (!template.icon) {
      template.icon = selectIcon(serviceName);
    }

    if (!template.items || !Array.isArray(template.items)) {
      template.items = [];
    }

    if (!template.phases || !Array.isArray(template.phases)) {
      template.phases = [];
    }

    // If we have no phases, this is likely a failed generation - use fallback
    if (template.phases.length === 0) {
      console.warn('⚠️ No phases in AI response, using fallback template');
      return getFallbackTemplate(serviceName);
    }

    // Validate items structure
    template.items = template.items.map(item => ({
      name: item.name || 'Service Item',
      description: item.description || '',
      unit: validateUnit(item.unit),
    }));

    // Validate phases structure
    template.phases = template.phases.map(phase => ({
      name: phase.name || phase.phase_name || 'Phase',
      description: phase.description || '',
      defaultDays: parseInt(phase.defaultDays || phase.default_days || 1),
      tasks: Array.isArray(phase.tasks) ? phase.tasks : (phase.defaultTasks || []),
    }));

    return template;
  } catch (error) {
    console.error('Error parsing AI response:', error);
    // Return fallback template
    return getFallbackTemplate(serviceName);
  }
}

/**
 * Validate and normalize unit types
 */
function validateUnit(unit) {
  const validUnits = ['sq ft', 'linear ft', 'hour', 'job', 'unit'];
  const normalized = (unit || 'job').toLowerCase().trim();

  if (validUnits.includes(normalized)) {
    return normalized;
  }

  // Map common variations
  const unitMap = {
    'sqft': 'sq ft',
    'square feet': 'sq ft',
    'linear feet': 'linear ft',
    'lineal ft': 'linear ft',
    'hours': 'hour',
    'hr': 'hour',
    'each': 'unit',
    'per job': 'job',
  };

  return unitMap[normalized] || 'job';
}

/**
 * Select an appropriate icon based on service name
 */
function selectIcon(serviceName) {
  const name = serviceName.toLowerCase();

  // Icon mapping based on keywords
  const iconMap = {
    'clean': 'sparkles-outline',
    'pool': 'water-outline',
    'lawn': 'leaf-outline',
    'landscape': 'leaf-outline',
    'tree': 'leaf-outline',
    'pest': 'bug-outline',
    'electric': 'flash-outline',
    'plumb': 'water-outline',
    'roof': 'home-outline',
    'paint': 'color-palette-outline',
    'floor': 'layers-outline',
    'hvac': 'thermometer-outline',
    'heat': 'thermometer-outline',
    'cool': 'thermometer-outline',
    'security': 'shield-outline',
    'lock': 'lock-closed-outline',
    'garage': 'car-outline',
    'window': 'square-outline',
    'gutter': 'water-outline',
    'snow': 'snow-outline',
    'move': 'move-outline',
    'junk': 'trash-outline',
    'appliance': 'construct-outline',
    'repair': 'build-outline',
    'install': 'hammer-outline',
    'water': 'water-outline',
    'fire': 'flame-outline',
    'mold': 'warning-outline',
  };

  for (const [keyword, icon] of Object.entries(iconMap)) {
    if (name.includes(keyword)) {
      return icon;
    }
  }

  // Default icon
  return 'construct-outline';
}

/**
 * Fallback template if AI fails
 */
function getFallbackTemplate(serviceName) {
  return {
    name: serviceName,
    description: `Professional ${serviceName} services`,
    icon: selectIcon(serviceName),
    items: [
      {
        name: 'Standard Service',
        description: `Basic ${serviceName} service`,
        unit: 'job',
      },
      {
        name: 'Labor Rate',
        description: 'Hourly labor rate',
        unit: 'hour',
      },
    ],
    phases: [
      {
        name: 'Assessment',
        description: 'Initial assessment and planning',
        defaultDays: 1,
        tasks: ['Assess site', 'Plan work', 'Gather materials'],
      },
      {
        name: 'Execution',
        description: 'Perform the service',
        defaultDays: 2,
        tasks: ['Complete work', 'Quality check'],
      },
      {
        name: 'Completion',
        description: 'Final cleanup and walkthrough',
        defaultDays: 1,
        tasks: ['Clean up', 'Final inspection', 'Customer walkthrough'],
      },
    ],
  };
}

/**
 * Batch generate templates for multiple services
 * @param {Array<string>} serviceNames - Array of service names
 * @returns {Promise<Array>} Array of generated templates
 */
export const batchGenerateTemplates = async (serviceNames) => {
  const results = [];

  for (const serviceName of serviceNames) {
    try {
      const template = await generateAndSaveTemplate(serviceName);
      results.push({ success: true, serviceName, template });
    } catch (error) {
      results.push({ success: false, serviceName, error: error.message });
    }
  }

  return results;
};

/**
 * Validate a generated template
 * @param {object} template - Template to validate
 * @returns {object} Validation result with issues
 */
export const validateTemplate = (template) => {
  const issues = [];

  if (!template.name || template.name.trim().length === 0) {
    issues.push('Missing service name');
  }

  if (!template.items || template.items.length === 0) {
    issues.push('No service items provided');
  }

  if (!template.phases || template.phases.length === 0) {
    issues.push('No workflow phases provided');
  }

  template.items?.forEach((item, index) => {
    if (!item.name) {
      issues.push(`Item ${index + 1} missing name`);
    }
    if (!item.unit) {
      issues.push(`Item ${index + 1} missing unit`);
    }
  });

  template.phases?.forEach((phase, index) => {
    if (!phase.name) {
      issues.push(`Phase ${index + 1} missing name`);
    }
    if (!phase.tasks || phase.tasks.length === 0) {
      issues.push(`Phase ${index + 1} has no tasks`);
    }
  });

  return {
    valid: issues.length === 0,
    issues,
  };
};
