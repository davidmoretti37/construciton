export const SITE = {
  name: 'Sylk',
  domain: 'sylkapp.ai',
  tagline: 'Run Your Business Smarter',
  description:
    'The AI-powered platform that helps service businesses create estimates, manage projects, and grow revenue.',
  url: 'https://sylkapp.ai',
  privacyUrl: 'https://construciton-production.up.railway.app/privacy',
  termsUrl: 'https://construciton-production.up.railway.app/terms',
} as const;

export const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
] as const;

export const STATS = [
  { label: 'Service Professionals', value: 500, suffix: '+' },
  { label: 'AI Tools', value: 60, suffix: '+' },
  { label: 'App Rating', value: 4.9, suffix: '', decimals: 1 },
  { label: 'Months to Build', value: 5, suffix: '' },
] as const;

export const INDUSTRIES = [
  'General Contracting',
  'Remodeling',
  'Roofing',
  'HVAC',
  'Plumbing',
  'Electrical',
  'Landscaping',
  'Painting',
  'Fiber Optic',
  'Cleaning',
  'Pool Service',
  'Flooring',
] as const;

export const TEAM_FEATURES = [
  {
    role: 'Owner',
    color: 'blue',
    description: 'Full business visibility',
    capabilities: [
      'Create projects, estimates, and invoices',
      'View all financials and bank reconciliation',
      'Manage workers, supervisors, and pricing',
      'See every daily report and time entry',
    ],
  },
  {
    role: 'Supervisor',
    color: 'violet',
    description: 'Site-level management',
    capabilities: [
      'Manage assigned projects and workers',
      'Submit supervisor-level daily reports',
      'Clock in/out with GPS verification',
      'Assign and track tasks on their sites',
    ],
  },
  {
    role: 'Worker',
    color: 'emerald',
    description: 'Simple, focused workflow',
    capabilities: [
      'Clock in/out with one tap',
      'Submit daily reports with photos',
      'View assigned tasks and schedule',
      'Track their own hours and expenses',
    ],
  },
] as const;

export const TESTIMONIALS = [
  {
    quote:
      "This app saved me 10+ hours every week on estimates alone. I used to spend 3 hours on each quote — now it's 5 minutes.",
    author: 'Mike Rodriguez',
    role: 'General Contractor, Austin TX',
    rating: 5,
    metric: '10+ hrs saved/week',
  },
  {
    quote:
      'Finally, an app that understands construction workflows. My team actually uses it!',
    author: 'Sarah Thompson',
    role: 'Remodeling Specialist, Denver',
    rating: 5,
    metric: '3x team adoption',
  },
  {
    quote:
      "The AI estimates are surprisingly accurate. It's like having a senior estimator on staff 24/7.",
    author: 'Carlos Martinez',
    role: 'Roofing Contractor, Miami',
    rating: 5,
    metric: '24/7 AI estimator',
  },
] as const;

export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    description: 'Solo operators',
    benefits: [
      '3 active projects',
      'AI estimates (20/mo)',
      'Invoice creation & tracking',
      'Time clock for your crew',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 79,
    description: 'Growing teams',
    isBest: true,
    benefits: [
      '10 active projects',
      'Unlimited AI estimates',
      'Team management (all roles)',
      'Financial tracking & reports',
      'Bank account connection',
      'Priority support',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 149,
    description: 'Large companies',
    benefits: [
      'Unlimited projects',
      'Unlimited AI estimates',
      'Unlimited team members',
      'Advanced analytics & reports',
      'AR aging & payroll tracking',
      'Phone support',
    ],
  },
] as const;

