/**
 * Seed Trade Phases Script
 * Adds phase templates to existing service categories in the database
 * Run this to populate phases for all trades
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase credentials
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Trade phases from trades.js
const TRADE_PHASES = {
  painting: [
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
  ],
  tile: [
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
  ],
  carpentry: [
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
  ],
  countertops: [
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
  ],
  drywall: [
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
  ],
  plumbing: [
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
  ],
  electrical: [
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
  ],
  flooring: [
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
  ],
  roofing: [
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
  ],
  concrete: [
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
  ],
  landscaping: [
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
  ],
  hvac: [
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
  ],
};

// Map trade IDs to service names in database
const TRADE_TO_SERVICE_NAME = {
  painting: 'Painting',
  tile: 'Tile Installation',
  carpentry: 'Carpentry',
  countertops: 'Countertops',
  drywall: 'Drywall',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  flooring: 'Flooring',
  roofing: 'Roofing',
  concrete: 'Concrete',
  landscaping: 'Landscaping',
  hvac: 'HVAC',
};

async function seedPhases() {
  console.log('🌱 Starting phase seeding...\n');

  for (const [tradeId, serviceName] of Object.entries(TRADE_TO_SERVICE_NAME)) {
    try {
      // Find the service category by name
      const { data: services, error: findError } = await supabase
        .from('service_categories')
        .select('id')
        .ilike('name', serviceName)
        .limit(1);

      if (findError) {
        console.error(`❌ Error finding ${serviceName}:`, findError.message);
        continue;
      }

      if (!services || services.length === 0) {
        console.log(`⚠️  Service not found: ${serviceName} - skipping`);
        continue;
      }

      const serviceId = services[0].id;
      const phases = TRADE_PHASES[tradeId];

      if (!phases || phases.length === 0) {
        console.log(`⚠️  No phases defined for ${serviceName} - skipping`);
        continue;
      }

      // Delete existing phases for this service
      const { error: deleteError } = await supabase
        .from('service_phase_templates')
        .delete()
        .eq('category_id', serviceId);

      if (deleteError) {
        console.error(`❌ Error deleting old phases for ${serviceName}:`, deleteError.message);
        continue;
      }

      // Insert new phases
      const phasesToInsert = phases.map((phase, index) => ({
        category_id: serviceId,
        phase_name: phase.phase_name,
        default_days: phase.defaultDays,
        tasks: phase.tasks, // This is already an array, will be converted to JSONB
        order_index: index,
      }));

      const { error: insertError } = await supabase
        .from('service_phase_templates')
        .insert(phasesToInsert);

      if (insertError) {
        console.error(`❌ Error inserting phases for ${serviceName}:`, insertError.message);
        continue;
      }

      console.log(`✅ ${serviceName}: Added ${phases.length} phases`);
    } catch (error) {
      console.error(`❌ Unexpected error for ${serviceName}:`, error.message);
    }
  }

  console.log('\n✨ Phase seeding complete!');
}

// Run the seeding
seedPhases().catch(console.error);
