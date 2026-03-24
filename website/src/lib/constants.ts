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
  { label: 'Jobs Managed', value: 10, suffix: 'K+' },
  { label: 'App Rating', value: 4.9, suffix: '', decimals: 1 },
  { label: 'Revenue Tracked', value: 2, prefix: '$', suffix: 'M+' },
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

export const PILLARS = [
  {
    label: 'Win More Jobs',
    title: 'AI Creates Your Estimates in Seconds',
    description:
      'Describe the job by voice or text. Your AI assistant generates a detailed, itemized estimate with labor, materials, and your profit margin built in — priced from your history.',
    bullets: [
      'Voice-to-estimate in under 60 seconds',
      'Learns your pricing from past jobs',
      'Send to clients via SMS or WhatsApp instantly',
      'Clients accept or request changes — you get notified',
    ],
    mock: 'estimate',
  },
  {
    label: 'Manage Every Job',
    title: 'Projects, Phases, Tasks — All Tracked',
    description:
      'Every job is a project with phases, tasks, assigned workers, and a timeline. See progress at a glance. Know which jobs are on track, behind, or over budget.',
    bullets: [
      'Break projects into phases with task checklists',
      'Assign workers and supervisors to specific phases',
      'Track progress automatically as tasks get completed',
      'Visual timeline shows phase durations and milestones',
    ],
    mock: 'project',
  },
  {
    label: 'Get Paid Faster',
    title: 'From Estimate to Invoice to Cash',
    description:
      'Convert accepted estimates to invoices with one tap. Track who owes you, how much, and how late. See your accounts receivable aging so nothing slips through the cracks.',
    bullets: [
      'One-tap estimate-to-invoice conversion',
      'Partial payment tracking (deposits, progress, final)',
      'AR aging buckets: Current, 30, 60, 90+ days',
      'Send payment reminders via SMS or WhatsApp',
    ],
    mock: 'invoice',
  },
  {
    label: 'Know Your Numbers',
    title: 'See Profit Per Job, Per Month, Per Year',
    description:
      'Connect your bank account. Categorize transactions by project. See exactly what each job costs and makes. Track payroll, overhead, and company-wide profitability.',
    bullets: [
      'Bank account sync with automatic transaction import',
      'Profit per job: contract value minus all expenses',
      'Payroll tracking with worker rates and hours',
      'Company overhead management (rent, insurance, trucks)',
    ],
    mock: 'financial',
  },
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

export const AI_CAPABILITIES = [
  { action: '"Create an estimate for the Johnson roof project"', result: 'Full itemized estimate generated in seconds' },
  { action: '"Who\'s working today?"', result: 'Lists all clocked-in workers by project' },
  { action: '"How much have I spent on materials?"', result: 'Filters and totals transactions by category' },
  { action: '"Assign Maria to the bathroom remodel"', result: 'Worker assigned to project instantly' },
  { action: '"Send the estimate to Mark via WhatsApp"', result: 'Formatted estimate sent to client' },
  { action: '"What\'s my profit margin this month?"', result: 'Revenue, expenses, and margin calculated' },
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
