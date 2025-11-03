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
    ]
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
