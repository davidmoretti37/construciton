/**
 * Trade definitions and pricing templates
 * Each trade has a custom set of pricing items
 */

export const TRADES = {
  painting: {
    id: 'painting',
    name: 'Painting',
    icon: 'color-palette-outline',
    pricingTemplate: [
      { id: 'interior', label: 'Interior Painting', unit: 'sq ft', defaultPrice: 3.50 },
      { id: 'exterior', label: 'Exterior Painting', unit: 'sq ft', defaultPrice: 4.00 },
      { id: 'trim', label: 'Trim/Molding', unit: 'linear ft', defaultPrice: 2.50 },
      { id: 'labor', label: 'Labor Rate', unit: 'hour', defaultPrice: 45 },
    ],
    phases: [
      {
        phase_name: 'Surface Prep & Primer',
        defaultDays: 2,
        tasks: ['Protect floors and furniture', 'Fill holes and cracks', 'Sand surfaces', 'Clean walls', 'Apply primer coat', 'Safety check and ventilation']
      },
      {
        phase_name: 'Paint Application (Coats 1-2)',
        defaultDays: 3,
        tasks: ['First coat application', 'Drying time between coats', 'Second coat application', 'Check for even coverage', 'Touch up missed spots', 'Quality inspection']
      },
      {
        phase_name: 'Trim, Touch-ups & Final Inspection',
        defaultDays: 1,
        tasks: ['Paint trim and molding', 'Final touch-ups', 'Remove tape and protective coverings', 'Clean up paint supplies', 'Final walkthrough with client', 'Address any concerns']
      }
    ]
  },
  tile: {
    id: 'tile',
    name: 'Tile Installation',
    icon: 'grid-outline',
    pricingTemplate: [
      { id: 'floor', label: 'Floor Tile', unit: 'sq ft', defaultPrice: 6.00 },
      { id: 'backsplash', label: 'Backsplash', unit: 'sq ft', defaultPrice: 8.00 },
      { id: 'shower', label: 'Shower Tile', unit: 'sq ft', defaultPrice: 10.00 },
      { id: 'grout', label: 'Grout/Sealing', unit: 'sq ft', defaultPrice: 2.00 },
    ],
    phases: [
      {
        phase_name: 'Surface Preparation & Layout',
        defaultDays: 1,
        tasks: ['Remove old flooring if needed', 'Check subfloor level', 'Clean and prep surface', 'Measure and plan tile layout', 'Mark reference lines', 'Prepare thin-set mortar']
      },
      {
        phase_name: 'Tile Installation & Setting',
        defaultDays: 3,
        tasks: ['Apply thin-set mortar', 'Lay tiles following pattern', 'Use spacers for consistency', 'Cut edge and corner tiles', 'Check level continuously', 'Allow proper curing time']
      },
      {
        phase_name: 'Grouting & Sealing',
        defaultDays: 2,
        tasks: ['Mix grout to proper consistency', 'Apply grout between tiles', 'Remove excess grout', 'Clean tile surface', 'Apply grout sealer', 'Final inspection and cleanup']
      }
    ]
  },
  carpentry: {
    id: 'carpentry',
    name: 'Carpentry',
    icon: 'hammer-outline',
    pricingTemplate: [
      { id: 'framing', label: 'Framing', unit: 'sq ft', defaultPrice: 4.50 },
      { id: 'finish', label: 'Finish Carpentry', unit: 'hour', defaultPrice: 55 },
      { id: 'cabinets', label: 'Custom Cabinets', unit: 'unit', defaultPrice: 500 },
      { id: 'deck', label: 'Deck Building', unit: 'sq ft', defaultPrice: 15.00 },
    ],
    phases: [
      {
        phase_name: 'Material Selection & Framing',
        defaultDays: 3,
        tasks: ['Review project plans and measurements', 'Select and order lumber', 'Cut framing members to size', 'Install wall frames', 'Check for square and level', 'Secure structural connections']
      },
      {
        phase_name: 'Rough Carpentry Installation',
        defaultDays: 4,
        tasks: ['Install subfloor or decking', 'Frame windows and doors', 'Build structural supports', 'Install headers and beams', 'Quality check all connections', 'Coordinate with other trades']
      },
      {
        phase_name: 'Finish Carpentry & Trim',
        defaultDays: 3,
        tasks: ['Install trim and molding', 'Hang doors and hardware', 'Install baseboards', 'Custom cabinet installation', 'Sand and finish wood surfaces', 'Final inspection and touch-ups']
      }
    ]
  },
  countertops: {
    id: 'countertops',
    name: 'Countertops',
    icon: 'square-outline',
    pricingTemplate: [
      { id: 'granite', label: 'Granite Install', unit: 'sq ft', defaultPrice: 60.00 },
      { id: 'quartz', label: 'Quartz Install', unit: 'sq ft', defaultPrice: 70.00 },
      { id: 'laminate', label: 'Laminate Install', unit: 'sq ft', defaultPrice: 25.00 },
      { id: 'removal', label: 'Demolition/Removal', unit: 'job', defaultPrice: 300 },
    ],
    phases: [
      {
        phase_name: 'Measurement & Template Creation',
        defaultDays: 1,
        tasks: ['Take precise measurements', 'Create digital or physical template', 'Confirm sink and appliance cutouts', 'Review edge profile selections', 'Verify material availability', 'Schedule fabrication']
      },
      {
        phase_name: 'Fabrication & Old Counter Removal',
        defaultDays: 5,
        tasks: ['Fabricate countertop to specifications', 'Polish edges and surfaces', 'Disconnect plumbing fixtures', 'Remove old countertops', 'Prepare and level base cabinets', 'Quality check fabricated pieces']
      },
      {
        phase_name: 'Installation & Sealing',
        defaultDays: 1,
        tasks: ['Transport countertop to site', 'Set and secure countertop', 'Apply seam adhesive if needed', 'Install undermount sink if applicable', 'Seal all edges and seams', 'Reconnect plumbing and cleanup']
      }
    ]
  },
  drywall: {
    id: 'drywall',
    name: 'Drywall',
    icon: 'copy-outline',
    pricingTemplate: [
      { id: 'installation', label: 'Drywall Installation', unit: 'sq ft', defaultPrice: 2.00 },
      { id: 'taping', label: 'Taping/Mudding', unit: 'sq ft', defaultPrice: 1.50 },
      { id: 'texture', label: 'Texture', unit: 'sq ft', defaultPrice: 1.25 },
      { id: 'repair', label: 'Repair Work', unit: 'hour', defaultPrice: 50 },
    ],
    phases: [
      {
        phase_name: 'Drywall Hanging & Installation',
        defaultDays: 2,
        tasks: ['Measure and cut drywall sheets', 'Hang drywall on walls and ceiling', 'Secure with screws at proper spacing', 'Cut openings for outlets and fixtures', 'Check for secure attachment', 'Clean up drywall dust']
      },
      {
        phase_name: 'Taping, Mudding & Sanding',
        defaultDays: 3,
        tasks: ['Apply joint tape to seams', 'First coat of mud compound', 'Second coat after drying', 'Third coat for smooth finish', 'Sand all surfaces smooth', 'Prime for painting']
      },
      {
        phase_name: 'Texture & Final Finishing',
        defaultDays: 1,
        tasks: ['Apply texture if specified', 'Touch up any imperfections', 'Sand texture lightly if needed', 'Wipe down walls', 'Final inspection', 'Prepare surface for paint']
      }
    ]
  },
  plumbing: {
    id: 'plumbing',
    name: 'Plumbing',
    icon: 'water-outline',
    pricingTemplate: [
      { id: 'fixtures', label: 'Fixture Installation', unit: 'unit', defaultPrice: 150 },
      { id: 'repair', label: 'Repair Work', unit: 'hour', defaultPrice: 85 },
      { id: 'pipes', label: 'Pipe Work', unit: 'linear ft', defaultPrice: 12.00 },
      { id: 'drain', label: 'Drain Cleaning', unit: 'job', defaultPrice: 200 },
    ],
    phases: [
      {
        phase_name: 'Rough Plumbing & Pipe Installation',
        defaultDays: 3,
        tasks: ['Plan pipe routing and layout', 'Cut and fit supply lines', 'Install drain and vent pipes', 'Pressure test water lines', 'Install shut-off valves', 'Coordinate with other trades']
      },
      {
        phase_name: 'Fixture & Appliance Installation',
        defaultDays: 2,
        tasks: ['Install sinks and faucets', 'Mount toilets and wax rings', 'Connect water heater', 'Install dishwasher and disposal', 'Connect washing machine lines', 'Test all fixtures for leaks']
      },
      {
        phase_name: 'Testing & Final Inspection',
        defaultDays: 1,
        tasks: ['Turn on water supply', 'Check for leaks at all connections', 'Test drainage and flow', 'Adjust water pressure if needed', 'Clean up work area', 'Walk through with client']
      }
    ]
  },
  electrical: {
    id: 'electrical',
    name: 'Electrical',
    icon: 'flash-outline',
    pricingTemplate: [
      { id: 'outlets', label: 'Outlet Installation', unit: 'unit', defaultPrice: 75 },
      { id: 'lighting', label: 'Light Fixture Install', unit: 'unit', defaultPrice: 125 },
      { id: 'panel', label: 'Panel Work', unit: 'hour', defaultPrice: 95 },
      { id: 'wiring', label: 'Wiring', unit: 'linear ft', defaultPrice: 3.50 },
    ],
    phases: [
      {
        phase_name: 'Rough Electrical & Wiring',
        defaultDays: 3,
        tasks: ['Install electrical boxes', 'Run wire through studs', 'Label all circuits', 'Install junction boxes', 'Ground all connections', 'Rough inspection preparation']
      },
      {
        phase_name: 'Panel & Circuit Installation',
        defaultDays: 2,
        tasks: ['Install electrical panel', 'Connect circuit breakers', 'Label all circuits clearly', 'Install GFCI and AFCI protection', 'Verify proper grounding', 'Test voltage at panel']
      },
      {
        phase_name: 'Fixture Installation & Testing',
        defaultDays: 2,
        tasks: ['Install outlets and switches', 'Mount light fixtures', 'Connect appliance circuits', 'Install smoke detectors', 'Test all circuits', 'Final inspection and cleanup']
      }
    ]
  },
  flooring: {
    id: 'flooring',
    name: 'Flooring',
    icon: 'layers-outline',
    pricingTemplate: [
      { id: 'hardwood', label: 'Hardwood Installation', unit: 'sq ft', defaultPrice: 8.00 },
      { id: 'laminate', label: 'Laminate Installation', unit: 'sq ft', defaultPrice: 4.50 },
      { id: 'vinyl', label: 'Vinyl Installation', unit: 'sq ft', defaultPrice: 3.50 },
      { id: 'removal', label: 'Floor Removal', unit: 'sq ft', defaultPrice: 2.00 },
    ],
    phases: [
      {
        phase_name: 'Subfloor Prep & Old Floor Removal',
        defaultDays: 2,
        tasks: ['Remove existing flooring', 'Inspect subfloor condition', 'Repair any damaged areas', 'Level uneven subfloor', 'Clean thoroughly', 'Acclimate new flooring materials']
      },
      {
        phase_name: 'Underlayment & Floor Installation',
        defaultDays: 4,
        tasks: ['Install moisture barrier', 'Lay underlayment padding', 'Begin floor installation', 'Stagger seams properly', 'Cut and fit around obstacles', 'Maintain expansion gaps']
      },
      {
        phase_name: 'Trim Installation & Finishing',
        defaultDays: 2,
        tasks: ['Install transition strips', 'Add baseboards and quarter round', 'Fill gaps with wood filler', 'Apply finish coat if hardwood', 'Clean flooring surface', 'Final inspection with client']
      }
    ]
  },
  roofing: {
    id: 'roofing',
    name: 'Roofing',
    icon: 'home-outline',
    pricingTemplate: [
      { id: 'shingles', label: 'Shingle Installation', unit: 'sq ft', defaultPrice: 5.50 },
      { id: 'repair', label: 'Roof Repair', unit: 'hour', defaultPrice: 75 },
      { id: 'gutters', label: 'Gutter Installation', unit: 'linear ft', defaultPrice: 8.00 },
      { id: 'removal', label: 'Old Roof Removal', unit: 'sq ft', defaultPrice: 1.50 },
    ],
    phases: [
      {
        phase_name: 'Roof Tear-off & Deck Preparation',
        defaultDays: 1,
        tasks: ['Remove old shingles and materials', 'Inspect roof deck for damage', 'Replace damaged decking', 'Clean debris from roof', 'Install drip edge', 'Set up safety equipment']
      },
      {
        phase_name: 'Underlayment & Shingle Installation',
        defaultDays: 3,
        tasks: ['Install underlayment felt', 'Apply ice and water shield', 'Install starter strip', 'Begin shingle installation', 'Maintain proper overlap', 'Install ridge cap shingles']
      },
      {
        phase_name: 'Flashing, Vents & Final Inspection',
        defaultDays: 1,
        tasks: ['Install chimney and valley flashing', 'Install roof vents', 'Seal all penetrations', 'Clean up all debris', 'Final quality inspection', 'Warranty documentation']
      }
    ]
  },
  concrete: {
    id: 'concrete',
    name: 'Concrete',
    icon: 'apps-outline',
    pricingTemplate: [
      { id: 'slab', label: 'Concrete Slab', unit: 'sq ft', defaultPrice: 6.00 },
      { id: 'driveway', label: 'Driveway', unit: 'sq ft', defaultPrice: 7.50 },
      { id: 'stamped', label: 'Stamped Concrete', unit: 'sq ft', defaultPrice: 12.00 },
      { id: 'repair', label: 'Concrete Repair', unit: 'hour', defaultPrice: 65 },
    ],
    phases: [
      {
        phase_name: 'Site Prep & Formwork',
        defaultDays: 2,
        tasks: ['Excavate and grade site', 'Compact soil base', 'Install gravel base', 'Build and level forms', 'Install rebar or wire mesh', 'Verify slope and drainage']
      },
      {
        phase_name: 'Concrete Pour & Finishing',
        defaultDays: 1,
        tasks: ['Order and schedule concrete delivery', 'Pour concrete into forms', 'Spread and level concrete', 'Float surface smooth', 'Apply finish texture', 'Cut control joints']
      },
      {
        phase_name: 'Curing & Form Removal',
        defaultDays: 4,
        tasks: ['Apply curing compound', 'Cover concrete to retain moisture', 'Monitor curing progress', 'Remove forms carefully', 'Seal concrete surface', 'Final cleanup and inspection']
      }
    ]
  },
  landscaping: {
    id: 'landscaping',
    name: 'Landscaping',
    icon: 'leaf-outline',
    pricingTemplate: [
      { id: 'lawn', label: 'Lawn Installation', unit: 'sq ft', defaultPrice: 1.50 },
      { id: 'plants', label: 'Planting', unit: 'unit', defaultPrice: 45 },
      { id: 'hardscape', label: 'Hardscaping', unit: 'sq ft', defaultPrice: 15.00 },
      { id: 'maintenance', label: 'Maintenance', unit: 'hour', defaultPrice: 40 },
    ],
    phases: [
      {
        phase_name: 'Site Analysis & Design Planning',
        defaultDays: 2,
        tasks: ['Assess soil and drainage', 'Measure landscape areas', 'Plan plant placement', 'Select appropriate plants for climate', 'Design irrigation layout', 'Order materials and plants']
      },
      {
        phase_name: 'Hardscape & Irrigation Installation',
        defaultDays: 4,
        tasks: ['Install pathways and patios', 'Build retaining walls if needed', 'Install irrigation system', 'Test irrigation zones', 'Add landscape edging', 'Prepare soil and add amendments']
      },
      {
        phase_name: 'Planting & Lawn Installation',
        defaultDays: 3,
        tasks: ['Plant trees and shrubs', 'Install ground cover', 'Lay sod or seed lawn', 'Apply mulch to beds', 'Initial watering and fertilization', 'Final cleanup and client walkthrough']
      }
    ]
  },
  hvac: {
    id: 'hvac',
    name: 'HVAC',
    icon: 'thermometer-outline',
    pricingTemplate: [
      { id: 'install', label: 'Unit Installation', unit: 'unit', defaultPrice: 3500 },
      { id: 'repair', label: 'Repair Work', unit: 'hour', defaultPrice: 95 },
      { id: 'ductwork', label: 'Ductwork', unit: 'linear ft', defaultPrice: 15.00 },
      { id: 'maintenance', label: 'Maintenance', unit: 'job', defaultPrice: 150 },
    ],
    phases: [
      {
        phase_name: 'System Design & Ductwork',
        defaultDays: 3,
        tasks: ['Calculate heating and cooling loads', 'Design duct layout', 'Install supply and return ducts', 'Seal all duct connections', 'Insulate ductwork', 'Install registers and grilles']
      },
      {
        phase_name: 'Equipment Installation',
        defaultDays: 2,
        tasks: ['Position and secure indoor unit', 'Install outdoor condenser', 'Connect refrigerant lines', 'Run electrical connections', 'Install thermostat', 'Connect condensate drain']
      },
      {
        phase_name: 'Testing & System Startup',
        defaultDays: 1,
        tasks: ['Vacuum and charge refrigerant', 'Test electrical connections', 'Calibrate thermostat', 'Test airflow at all vents', 'Check for proper operation', 'Program thermostat and train client']
      }
    ]
  },
  generalContractor: {
    id: 'generalContractor',
    name: 'General Contractor',
    icon: 'briefcase-outline',
    isMultiService: true, // Flag to indicate this is a multi-service trade
    pricingTemplate: [], // No direct pricing - manages other services instead
    defaultServices: ['drywall', 'electrical', 'hvac', 'plumbing'], // Default services to suggest
  },
};

// Helper to get all trades as array
export const getAllTrades = () => {
  return Object.values(TRADES);
};

// Helper to get trade by ID
export const getTradeById = (tradeId) => {
  return TRADES[tradeId];
};

// Helper to get default pricing for a trade
export const getDefaultPricing = (tradeId) => {
  const trade = TRADES[tradeId];
  if (!trade) return {};

  const pricing = {};
  trade.pricingTemplate.forEach(item => {
    pricing[item.id] = {
      price: item.defaultPrice,
      unit: item.unit,
    };
  });

  return pricing;
};

// Helper to format pricing for display
export const formatPriceUnit = (price, unit) => {
  const formattedPrice = `$${price.toFixed(2)}`;
  const unitMap = {
    'sq ft': '/sq ft',
    'linear ft': '/linear ft',
    'hour': '/hr',
    'unit': ' each',
    'job': ' per job',
  };

  return `${formattedPrice}${unitMap[unit] || ''}`;
};
