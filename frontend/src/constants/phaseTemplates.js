/**
 * Predefined phase templates for different trades
 * Used to suggest common phases when creating projects
 */

export const PHASE_TEMPLATES = {
  // General Construction
  construction: [
    {
      name: 'Foundation',
      defaultDays: 5,
      description: 'Site preparation and foundation work',
      defaultTasks: [
        'Excavate site',
        'Install formwork',
        'Pour concrete',
        'Cure foundation',
        'Backfill and compact'
      ]
    },
    {
      name: 'Framing',
      defaultDays: 7,
      description: 'Structural framing and rough-in',
      defaultTasks: [
        'Install sill plates',
        'Frame walls',
        'Install floor joists',
        'Frame roof structure',
        'Install sheathing'
      ]
    },
    {
      name: 'Electrical',
      defaultDays: 3,
      description: 'Electrical wiring and fixtures',
      defaultTasks: [
        'Run wiring',
        'Install boxes and panels',
        'Install fixtures',
        'Test circuits',
        'Final inspection'
      ]
    },
    {
      name: 'Plumbing',
      defaultDays: 3,
      description: 'Plumbing installation',
      defaultTasks: [
        'Install supply lines',
        'Install drain lines',
        'Install fixtures',
        'Pressure test',
        'Final inspection'
      ]
    },
    {
      name: 'HVAC',
      defaultDays: 2,
      description: 'Heating, ventilation, and air conditioning',
      defaultTasks: [
        'Install ductwork',
        'Install equipment',
        'Connect electrical',
        'Test system',
        'Balance airflow'
      ]
    },
    {
      name: 'Drywall',
      defaultDays: 4,
      description: 'Drywall installation and finishing',
      defaultTasks: [
        'Hang drywall sheets',
        'Tape seams',
        'Apply mud/compound',
        'Sand smooth',
        'Prime walls'
      ]
    },
    {
      name: 'Flooring',
      defaultDays: 3,
      description: 'Flooring installation',
      defaultTasks: [
        'Prepare subfloor',
        'Install underlayment',
        'Install flooring',
        'Install trim',
        'Clean and seal'
      ]
    },
    {
      name: 'Finishing',
      defaultDays: 5,
      description: 'Paint, trim, and final touches',
      defaultTasks: [
        'Paint walls and ceiling',
        'Install baseboards',
        'Install door trim',
        'Install fixtures',
        'Final walkthrough'
      ]
    },
  ],

  // Electrical specific
  electrical: [
    {
      name: 'Planning & Permits',
      defaultDays: 2,
      description: 'Design and permit approval',
      defaultTasks: ['Create electrical plan', 'Submit permits', 'Receive approval']
    },
    {
      name: 'Rough-In',
      defaultDays: 3,
      description: 'Wiring and electrical boxes',
      defaultTasks: ['Run electrical wire', 'Install boxes', 'Install conduit', 'Rough-in inspection']
    },
    {
      name: 'Panel Installation',
      defaultDays: 1,
      description: 'Electrical panel setup',
      defaultTasks: ['Install panel', 'Connect circuits', 'Label breakers']
    },
    {
      name: 'Final Installation',
      defaultDays: 2,
      description: 'Fixtures and final connections',
      defaultTasks: ['Install switches and outlets', 'Install light fixtures', 'Install specialty items']
    },
    {
      name: 'Testing & Inspection',
      defaultDays: 1,
      description: 'Code compliance testing',
      defaultTasks: ['Test all circuits', 'Final inspection', 'Correct any issues']
    },
  ],

  // Plumbing specific
  plumbing: [
    {
      name: 'Planning & Permits',
      defaultDays: 2,
      description: 'Planning and permits',
      defaultTasks: ['Create plumbing plan', 'Submit permits', 'Get approval']
    },
    {
      name: 'Rough Plumbing',
      defaultDays: 3,
      description: 'Pipe installation',
      defaultTasks: ['Install supply lines', 'Install drain lines', 'Install vents', 'Rough plumbing inspection']
    },
    {
      name: 'Fixture Installation',
      defaultDays: 2,
      description: 'Installing fixtures',
      defaultTasks: ['Install sinks', 'Install toilets', 'Install tubs/showers', 'Connect fixtures']
    },
    {
      name: 'Testing & Inspection',
      defaultDays: 1,
      description: 'Pressure testing and inspection',
      defaultTasks: ['Pressure test', 'Final inspection', 'Fix any leaks']
    },
  ],

  // Carpentry specific
  carpentry: [
    {
      name: 'Framing',
      defaultDays: 5,
      description: 'Structural framing',
      defaultTasks: ['Frame walls', 'Install headers', 'Set trusses', 'Install sheathing', 'Framing inspection']
    },
    {
      name: 'Rough Carpentry',
      defaultDays: 3,
      description: 'Blocking and backing',
      defaultTasks: ['Install blocking', 'Install backing', 'Install subflooring']
    },
    {
      name: 'Finish Carpentry',
      defaultDays: 5,
      description: 'Trim, doors, and baseboards',
      defaultTasks: ['Install doors', 'Install baseboards', 'Install crown molding', 'Install window trim']
    },
    {
      name: 'Custom Work',
      defaultDays: 4,
      description: 'Cabinets and custom pieces',
      defaultTasks: ['Build cabinets', 'Install cabinets', 'Custom millwork', 'Hardware installation']
    },
  ],

  // Painting
  painting: [
    {
      name: 'Preparation',
      defaultDays: 2,
      description: 'Surface prep and priming',
      defaultTasks: ['Patch holes', 'Sand surfaces', 'Clean surfaces', 'Apply primer']
    },
    {
      name: 'First Coat',
      defaultDays: 2,
      description: 'First coat application',
      defaultTasks: ['Cut in edges', 'Roll walls', 'Paint ceiling', 'Dry time']
    },
    {
      name: 'Second Coat',
      defaultDays: 2,
      description: 'Second coat and touch-ups',
      defaultTasks: ['Apply second coat', 'Touch up areas', 'Inspect finish']
    },
    {
      name: 'Cleanup',
      defaultDays: 1,
      description: 'Final cleanup',
      defaultTasks: ['Remove tape', 'Clean equipment', 'Remove drop cloths', 'Final walkthrough']
    },
  ],

  // Roofing
  roofing: [
    {
      name: 'Tear-Off',
      defaultDays: 1,
      description: 'Remove old roofing',
      defaultTasks: ['Remove old shingles', 'Haul debris', 'Inspect deck']
    },
    {
      name: 'Deck Repair',
      defaultDays: 1,
      description: 'Repair roof deck if needed',
      defaultTasks: ['Replace damaged decking', 'Secure loose boards', 'Inspect repairs']
    },
    {
      name: 'Underlayment',
      defaultDays: 1,
      description: 'Install underlayment',
      defaultTasks: ['Install ice/water shield', 'Install felt paper', 'Secure underlayment']
    },
    {
      name: 'Shingle Installation',
      defaultDays: 2,
      description: 'Install new shingles',
      defaultTasks: ['Install starter course', 'Install shingle courses', 'Install ridge cap']
    },
    {
      name: 'Flashing & Trim',
      defaultDays: 1,
      description: 'Install flashing and trim',
      defaultTasks: ['Install valley flashing', 'Install chimney flashing', 'Install drip edge']
    },
    {
      name: 'Cleanup & Inspection',
      defaultDays: 1,
      description: 'Final cleanup',
      defaultTasks: ['Magnet sweep', 'Haul debris', 'Final inspection', 'Customer walkthrough']
    },
  ],

  // Flooring
  flooring: [
    {
      name: 'Removal',
      defaultDays: 1,
      description: 'Remove old flooring',
      defaultTasks: ['Remove old flooring', 'Haul debris', 'Clean subfloor']
    },
    {
      name: 'Subfloor Prep',
      defaultDays: 1,
      description: 'Prepare subfloor',
      defaultTasks: ['Level subfloor', 'Repair damage', 'Clean and vacuum']
    },
    {
      name: 'Installation',
      defaultDays: 3,
      description: 'Install new flooring',
      defaultTasks: ['Install underlayment', 'Acclimate materials', 'Install flooring', 'Cut and fit']
    },
    {
      name: 'Finishing',
      defaultDays: 2,
      description: 'Trim and finishing',
      defaultTasks: ['Install trim', 'Install transitions', 'Seal/finish', 'Final cleanup']
    },
  ],

  // HVAC
  hvac: [
    {
      name: 'Planning',
      defaultDays: 1,
      description: 'System design and planning',
      defaultTasks: ['Load calculation', 'System design', 'Get permits']
    },
    {
      name: 'Ductwork',
      defaultDays: 3,
      description: 'Install ductwork',
      defaultTasks: ['Install supply ducts', 'Install return ducts', 'Seal connections', 'Insulate ducts']
    },
    {
      name: 'Equipment Installation',
      defaultDays: 2,
      description: 'Install HVAC units',
      defaultTasks: ['Install furnace/air handler', 'Install condenser', 'Connect refrigerant lines', 'Wire thermostat']
    },
    {
      name: 'Testing & Balancing',
      defaultDays: 1,
      description: 'System testing',
      defaultTasks: ['Test system operation', 'Balance airflow', 'Final inspection', 'Customer training']
    },
  ],

  // Landscaping
  landscaping: [
    {
      name: 'Design & Planning',
      defaultDays: 2,
      description: 'Landscape design',
      defaultTasks: ['Site analysis', 'Create design', 'Select materials', 'Get approvals']
    },
    {
      name: 'Site Prep',
      defaultDays: 2,
      description: 'Grading and soil prep',
      defaultTasks: ['Clear site', 'Grade terrain', 'Amend soil', 'Establish drainage']
    },
    {
      name: 'Hardscaping',
      defaultDays: 4,
      description: 'Patios, walkways, walls',
      defaultTasks: ['Excavate areas', 'Install base', 'Lay pavers/stones', 'Build retaining walls']
    },
    {
      name: 'Planting',
      defaultDays: 3,
      description: 'Trees, shrubs, plants',
      defaultTasks: ['Plant trees', 'Plant shrubs', 'Plant perennials', 'Install ground cover']
    },
    {
      name: 'Irrigation',
      defaultDays: 2,
      description: 'Sprinkler system',
      defaultTasks: ['Layout system', 'Dig trenches', 'Install pipes and heads', 'Test system']
    },
    {
      name: 'Final Touches',
      defaultDays: 1,
      description: 'Mulch and cleanup',
      defaultTasks: ['Spread mulch', 'Edge beds', 'Clean up debris', 'Final walkthrough']
    },
  ],

  // Masonry
  masonry: [
    {
      name: 'Foundation',
      defaultDays: 3,
      description: 'Foundation work',
      defaultTasks: ['Excavate footings', 'Pour footings', 'Cure concrete', 'Prep for walls']
    },
    {
      name: 'Block/Brick Laying',
      defaultDays: 5,
      description: 'Wall construction',
      defaultTasks: ['Lay first course', 'Build walls', 'Install rebar', 'Check level/plumb']
    },
    {
      name: 'Finishing',
      defaultDays: 2,
      description: 'Pointing and finishing',
      defaultTasks: ['Joint pointing', 'Clean bricks', 'Apply sealer', 'Final inspection']
    },
    {
      name: 'Cleanup',
      defaultDays: 1,
      description: 'Site cleanup',
      defaultTasks: ['Remove scaffolding', 'Clean tools', 'Haul debris', 'Site cleanup']
    },
  ],

  // Remodeling (general)
  remodeling: [
    {
      name: 'Demo & Removal',
      defaultDays: 2,
      description: 'Demolition',
      defaultTasks: ['Protect areas', 'Demolish old work', 'Remove debris', 'Clean site']
    },
    {
      name: 'Structural Work',
      defaultDays: 3,
      description: 'Framing changes',
      defaultTasks: ['Install beams', 'Frame new walls', 'Remove/add openings', 'Structural inspection']
    },
    {
      name: 'Rough-Ins',
      defaultDays: 4,
      description: 'Electrical, plumbing, HVAC',
      defaultTasks: ['Electrical rough-in', 'Plumbing rough-in', 'HVAC rough-in', 'Rough-in inspection']
    },
    {
      name: 'Drywall',
      defaultDays: 3,
      description: 'Drywall and taping',
      defaultTasks: ['Hang drywall', 'Tape and mud', 'Sand smooth', 'Prime walls']
    },
    {
      name: 'Finishes',
      defaultDays: 5,
      description: 'Paint, flooring, fixtures',
      defaultTasks: ['Paint walls', 'Install flooring', 'Install fixtures', 'Install trim', 'Final walkthrough']
    },
  ],
};

/**
 * Get phase templates for a specific trade
 * @param {string} tradeId - Trade identifier
 * @returns {Array} Array of phase templates
 */
export const getPhaseTemplates = (tradeId) => {
  return PHASE_TEMPLATES[tradeId] || PHASE_TEMPLATES.construction;
};

/**
 * Get phase templates for multiple trades (combined)
 * @param {Array<string>} tradeIds - Array of trade identifiers
 * @returns {Array} Combined array of phase templates (deduplicated)
 */
export const getCombinedPhaseTemplates = (tradeIds) => {
  if (!tradeIds || tradeIds.length === 0) {
    return PHASE_TEMPLATES.construction;
  }

  if (tradeIds.length === 1) {
    return getPhaseTemplates(tradeIds[0]);
  }

  // For multiple trades, combine and deduplicate
  const allPhases = [];
  const seenNames = new Set();

  tradeIds.forEach(tradeId => {
    const phases = getPhaseTemplates(tradeId);
    phases.forEach(phase => {
      if (!seenNames.has(phase.name)) {
        allPhases.push(phase);
        seenNames.add(phase.name);
      }
    });
  });

  return allPhases;
};

/**
 * Create a custom phase object
 * @param {string} name - Phase name
 * @param {number} defaultDays - Default duration in days
 * @param {string} description - Phase description
 * @returns {object} Phase template object
 */
export const createCustomPhase = (name, defaultDays = 5, description = '') => {
  return {
    name,
    defaultDays,
    description,
  };
};
