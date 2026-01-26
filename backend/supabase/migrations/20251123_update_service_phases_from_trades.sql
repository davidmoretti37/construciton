-- ============================================================
-- UPDATE SERVICE PHASE TEMPLATES WITH CORRECT PHASES
-- ============================================================
-- This migration updates the service_phase_templates table
-- with the correct, detailed phases from the TRADES constants
-- ============================================================

DO $$
DECLARE
  painting_id UUID;
  tile_id UUID;
  carpentry_id UUID;
  countertops_id UUID;
  drywall_id UUID;
  plumbing_id UUID;
  electrical_id UUID;
  flooring_id UUID;
  roofing_id UUID;
  concrete_id UUID;
  landscaping_id UUID;
  hvac_id UUID;
BEGIN
  -- Get category IDs
  SELECT id INTO painting_id FROM public.service_categories WHERE name = 'Painting' LIMIT 1;
  SELECT id INTO tile_id FROM public.service_categories WHERE name = 'Tile Installation' LIMIT 1;
  SELECT id INTO carpentry_id FROM public.service_categories WHERE name = 'Carpentry' LIMIT 1;
  SELECT id INTO countertops_id FROM public.service_categories WHERE name = 'Countertops' LIMIT 1;
  SELECT id INTO drywall_id FROM public.service_categories WHERE name = 'Drywall' LIMIT 1;
  SELECT id INTO plumbing_id FROM public.service_categories WHERE name = 'Plumbing' LIMIT 1;
  SELECT id INTO electrical_id FROM public.service_categories WHERE name = 'Electrical' LIMIT 1;
  SELECT id INTO flooring_id FROM public.service_categories WHERE name = 'Flooring' LIMIT 1;
  SELECT id INTO roofing_id FROM public.service_categories WHERE name = 'Roofing' LIMIT 1;
  SELECT id INTO concrete_id FROM public.service_categories WHERE name = 'Concrete' LIMIT 1;
  SELECT id INTO landscaping_id FROM public.service_categories WHERE name = 'Landscaping' LIMIT 1;
  SELECT id INTO hvac_id FROM public.service_categories WHERE name = 'HVAC' LIMIT 1;

  -- Delete existing phase templates to replace with correct ones
  DELETE FROM public.service_phase_templates;

  -- Painting phases (from TRADES)
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (painting_id, 'Surface Prep & Primer', '', 2, json_build_array('Protect floors and furniture', 'Fill holes and cracks', 'Sand surfaces', 'Clean walls', 'Apply primer coat', 'Safety check and ventilation'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (painting_id, 'Paint Application (Coats 1-2)', '', 3, json_build_array('First coat application', 'Drying time between coats', 'Second coat application', 'Check for even coverage', 'Touch up missed spots', 'Quality inspection'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (painting_id, 'Trim, Touch-ups & Final Inspection', '', 1, json_build_array('Paint trim and molding', 'Final touch-ups', 'Remove tape and protective coverings', 'Clean up paint supplies', 'Final walkthrough with client', 'Address any concerns'), 2);

  -- Tile Installation phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (tile_id, 'Surface Preparation & Layout', '', 1, json_build_array('Remove old flooring if needed', 'Check subfloor level', 'Clean and prep surface', 'Measure and plan tile layout', 'Mark reference lines', 'Prepare thin-set mortar'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (tile_id, 'Tile Installation & Setting', '', 3, json_build_array('Apply thin-set mortar', 'Lay tiles following pattern', 'Use spacers for consistency', 'Cut edge and corner tiles', 'Check level continuously', 'Allow proper curing time'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (tile_id, 'Grouting & Sealing', '', 2, json_build_array('Mix grout to proper consistency', 'Apply grout between tiles', 'Remove excess grout', 'Clean tile surface', 'Apply grout sealer', 'Final inspection and cleanup'), 2);

  -- Carpentry phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (carpentry_id, 'Material Selection & Framing', '', 3, json_build_array('Review project plans and measurements', 'Select and order lumber', 'Cut framing members to size', 'Install wall frames', 'Check for square and level', 'Secure structural connections'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (carpentry_id, 'Rough Carpentry Installation', '', 4, json_build_array('Install subfloor or decking', 'Frame windows and doors', 'Build structural supports', 'Install headers and beams', 'Quality check all connections', 'Coordinate with other trades'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (carpentry_id, 'Finish Carpentry & Trim', '', 3, json_build_array('Install trim and molding', 'Hang doors and hardware', 'Install baseboards', 'Custom cabinet installation', 'Sand and finish wood surfaces', 'Final inspection and touch-ups'), 2);

  -- Countertops phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (countertops_id, 'Measurement & Template Creation', '', 1, json_build_array('Take precise measurements', 'Create digital or physical template', 'Confirm sink and appliance cutouts', 'Review edge profile selections', 'Verify material availability', 'Schedule fabrication'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (countertops_id, 'Fabrication & Old Counter Removal', '', 5, json_build_array('Fabricate countertop to specifications', 'Polish edges and surfaces', 'Disconnect plumbing fixtures', 'Remove old countertops', 'Prepare and level base cabinets', 'Quality check fabricated pieces'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (countertops_id, 'Installation & Sealing', '', 1, json_build_array('Transport countertop to site', 'Set and secure countertop', 'Apply seam adhesive if needed', 'Install undermount sink if applicable', 'Seal all edges and seams', 'Reconnect plumbing and cleanup'), 2);

  -- Drywall phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (drywall_id, 'Drywall Hanging & Installation', '', 2, json_build_array('Measure and cut drywall sheets', 'Hang drywall on walls and ceiling', 'Secure with screws at proper spacing', 'Cut openings for outlets and fixtures', 'Check for secure attachment', 'Clean up drywall dust'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (drywall_id, 'Taping, Mudding & Sanding', '', 3, json_build_array('Apply joint tape to seams', 'First coat of mud compound', 'Second coat after drying', 'Third coat for smooth finish', 'Sand all surfaces smooth', 'Prime for painting'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (drywall_id, 'Texture & Final Finishing', '', 1, json_build_array('Apply texture if specified', 'Touch up any imperfections', 'Sand texture lightly if needed', 'Wipe down walls', 'Final inspection', 'Prepare surface for paint'), 2);

  -- Plumbing phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (plumbing_id, 'Rough Plumbing & Pipe Installation', '', 3, json_build_array('Plan pipe routing and layout', 'Cut and fit supply lines', 'Install drain and vent pipes', 'Pressure test water lines', 'Install shut-off valves', 'Coordinate with other trades'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (plumbing_id, 'Fixture & Appliance Installation', '', 2, json_build_array('Install sinks and faucets', 'Mount toilets and wax rings', 'Connect water heater', 'Install dishwasher and disposal', 'Connect washing machine lines', 'Test all fixtures for leaks'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (plumbing_id, 'Testing & Final Inspection', '', 1, json_build_array('Turn on water supply', 'Check for leaks at all connections', 'Test drainage and flow', 'Adjust water pressure if needed', 'Clean up work area', 'Walk through with client'), 2);

  -- Electrical phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (electrical_id, 'Rough Electrical & Wiring', '', 3, json_build_array('Install electrical boxes', 'Run wire through studs', 'Label all circuits', 'Install junction boxes', 'Ground all connections', 'Rough inspection preparation'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (electrical_id, 'Panel & Circuit Installation', '', 2, json_build_array('Install electrical panel', 'Connect circuit breakers', 'Label all circuits clearly', 'Install GFCI and AFCI protection', 'Verify proper grounding', 'Test voltage at panel'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (electrical_id, 'Fixture Installation & Testing', '', 2, json_build_array('Install outlets and switches', 'Mount light fixtures', 'Connect appliance circuits', 'Install smoke detectors', 'Test all circuits', 'Final inspection and cleanup'), 2);

  -- Flooring phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (flooring_id, 'Subfloor Prep & Old Floor Removal', '', 2, json_build_array('Remove existing flooring', 'Inspect subfloor condition', 'Repair any damaged areas', 'Level uneven subfloor', 'Clean thoroughly', 'Acclimate new flooring materials'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (flooring_id, 'Underlayment & Floor Installation', '', 4, json_build_array('Install moisture barrier', 'Lay underlayment padding', 'Begin floor installation', 'Stagger seams properly', 'Cut and fit around obstacles', 'Maintain expansion gaps'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (flooring_id, 'Trim Installation & Finishing', '', 2, json_build_array('Install transition strips', 'Add baseboards and quarter round', 'Fill gaps with wood filler', 'Apply finish coat if hardwood', 'Clean flooring surface', 'Final inspection with client'), 2);

  -- Roofing phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (roofing_id, 'Roof Tear-off & Deck Preparation', '', 1, json_build_array('Remove old shingles and materials', 'Inspect roof deck for damage', 'Replace damaged decking', 'Clean debris from roof', 'Install drip edge', 'Set up safety equipment'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (roofing_id, 'Underlayment & Shingle Installation', '', 3, json_build_array('Install underlayment felt', 'Apply ice and water shield', 'Install starter strip', 'Begin shingle installation', 'Maintain proper overlap', 'Install ridge cap shingles'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (roofing_id, 'Flashing, Vents & Final Inspection', '', 1, json_build_array('Install chimney and valley flashing', 'Install roof vents', 'Seal all penetrations', 'Clean up all debris', 'Final quality inspection', 'Warranty documentation'), 2);

  -- Concrete phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (concrete_id, 'Site Prep & Formwork', '', 2, json_build_array('Excavate and grade site', 'Compact soil base', 'Install gravel base', 'Build and level forms', 'Install rebar or wire mesh', 'Verify slope and drainage'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (concrete_id, 'Concrete Pour & Finishing', '', 1, json_build_array('Order and schedule concrete delivery', 'Pour concrete into forms', 'Spread and level concrete', 'Float surface smooth', 'Apply finish texture', 'Cut control joints'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (concrete_id, 'Curing & Form Removal', '', 4, json_build_array('Apply curing compound', 'Cover concrete to retain moisture', 'Monitor curing progress', 'Remove forms carefully', 'Seal concrete surface', 'Final cleanup and inspection'), 2);

  -- Landscaping phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (landscaping_id, 'Site Analysis & Design Planning', '', 2, json_build_array('Assess soil and drainage', 'Measure landscape areas', 'Plan plant placement', 'Select appropriate plants for climate', 'Design irrigation layout', 'Order materials and plants'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (landscaping_id, 'Hardscape & Irrigation Installation', '', 4, json_build_array('Install pathways and patios', 'Build retaining walls if needed', 'Install irrigation system', 'Test irrigation zones', 'Add landscape edging', 'Prepare soil and add amendments'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (landscaping_id, 'Planting & Lawn Installation', '', 3, json_build_array('Plant trees and shrubs', 'Install ground cover', 'Lay sod or seed lawn', 'Apply mulch to beds', 'Initial watering and fertilization', 'Final cleanup and client walkthrough'), 2);

  -- HVAC phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (hvac_id, 'System Design & Ductwork', '', 3, json_build_array('Calculate heating and cooling loads', 'Design duct layout', 'Install supply and return ducts', 'Seal all duct connections', 'Insulate ductwork', 'Install registers and grilles'), 0);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (hvac_id, 'Equipment Installation', '', 2, json_build_array('Position and secure indoor unit', 'Install outdoor condenser', 'Connect refrigerant lines', 'Run electrical connections', 'Install thermostat', 'Connect condensate drain'), 1);

  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index)
  VALUES (hvac_id, 'Testing & System Startup', '', 1, json_build_array('Vacuum and charge refrigerant', 'Test electrical connections', 'Calibrate thermostat', 'Test airflow at all vents', 'Check for proper operation', 'Program thermostat and train client'), 2);

END $$;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
