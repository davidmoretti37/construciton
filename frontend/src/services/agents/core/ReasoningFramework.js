/**
 * ReasoningFramework - Structured thinking prompts for agents
 *
 * Provides Chain-of-Thought reasoning templates that make agents
 * think through problems step-by-step before responding.
 * This catches conflicts, validates constraints, and improves accuracy.
 */

/**
 * Get reasoning prompt section for a specific task type
 * @param {string} taskType - The type of task (scheduling, financial, etc.)
 * @returns {string} - Reasoning prompt to inject into agent system prompt
 */
export function getReasoningPrompt(taskType) {
  const frameworks = {

    // For scheduling workers to projects
    scheduling: `
## THINK BEFORE SCHEDULING

Before assigning any worker, reason through these checks:

1. **WORKER ANALYSIS**
   - What skills/trade does this worker have?
   - What is their hourly/daily rate?
   - What days do they typically work?

2. **TASK REQUIREMENTS**
   - What skills does this task actually need?
   - How long will it realistically take?
   - Are there dependencies (must wait for other work)?

3. **AVAILABILITY CHECK**
   - Is this worker already scheduled on the requested days?
   - Any conflicts with other projects?
   - Consider travel time if multiple job sites

4. **CONSTRAINT VALIDATION**
   - Does worker's skill match what the task needs?
   - Is the timeline realistic for the scope?
   - Any budget concerns (rate x hours)?

5. **DECISION**
   - If all checks pass: Schedule with confidence
   - If skill mismatch: Explain and suggest who CAN do it
   - If scheduling conflict: Explain and offer alternative dates or workers
   - If unclear: Ask clarifying question

**IMPORTANT:** When you catch a conflict or mismatch, explain it clearly to the user.
Example: "I noticed Jose is already on the Smith kitchen job Tuesday-Wednesday. I can schedule him Thursday-Friday instead, or would you prefer a different worker?"
`,

    // For financial tracking (income/expenses)
    financial: `
## THINK BEFORE RECORDING TRANSACTIONS

Before recording any income or expense, verify:

1. **AMOUNT VALIDATION**
   - Does this amount make sense for this type of transaction?
   - Is it within expected range for this project?
   - For spoken amounts, interpret naturally (e.g., "fifteen hundred" = $1,500)

2. **PROJECT CONTEXT**
   - Which project does this belong to?
   - What's the current financial state?
     - Total contract value
     - Income collected so far
     - Expenses spent so far
     - Current profit/loss

3. **IMPACT CALCULATION**
   - If income: New total = current collected + this amount
   - If expense: New total = current expenses + this amount
   - Updated profit = total collected - total expenses

4. **FLAG CONCERNS PROACTIVELY**
   - If expenses will exceed income: Warn about negative cash flow
   - If expenses will exceed contract: Alert that job is losing money
   - If unusually large/small amount: Confirm before recording

5. **DECISION**
   - If amounts check out and no concerns: Record and confirm with summary
   - If budget concerns exist: State them clearly, then ask if user wants to proceed
   - If missing info (payment method, project): Ask before recording
`,

    // For creating new projects
    project_creation: `
## THINK BEFORE CREATING PROJECT

Before building a project, reason through:

1. **SCOPE UNDERSTANDING**
   - What specific work is the user requesting?
   - Is this similar to past projects I know about?
   - What's the expected complexity level?

2. **PHASE PLANNING**
   - What phases are needed for this type of work?
   - What's the logical sequence? (e.g., can't tile before plumbing)
   - Realistic duration for each phase based on scope?

3. **TIMELINE LOGIC**
   - Total working days needed for all phases?
   - Are the requested start/end dates realistic?
   - Any known constraints (permits, material lead times)?

4. **REQUIRED INFORMATION**
   What I MUST know to create a valid project:
   - Client name (who is this for?)
   - Project location/address
   - General scope of work
   - Working days (which days of the week?)

5. **SMART DEFAULTS vs QUESTIONS**
   - What can I reasonably assume? (standard phases for this work type)
   - What MUST I ask? (location, client name if not provided)
   - Don't over-ask - use common sense for obvious details
`,

    // For creating estimates and invoices
    estimating: `
## THINK BEFORE ESTIMATING

Before generating an estimate or invoice, reason through:

1. **SCOPE ANALYSIS**
   - What exactly is being quoted?
   - Have I done similar work before? (check pricing history)
   - What's included vs explicitly excluded?

2. **LINE ITEM BREAKDOWN**
   - Materials: What's needed and approximate cost?
   - Labor: How many hours/days at what rate?
   - Equipment: Any rentals or special tools needed?
   - Subcontractors: Any specialized work to outsource?

3. **PRICING VALIDATION**
   - Does total match what similar jobs cost?
   - Is the profit margin healthy (typically 15-30%)?
   - Any market factors affecting price?

4. **CONTINGENCY & PRESENTATION**
   - Add appropriate contingency (typically 10-15%)
   - Round to professional-looking numbers
   - Group items logically for client readability

5. **DECISION**
   - If I have enough info: Generate detailed estimate
   - If scope unclear: Ask specific questions about what's needed
   - Reference past similar work when relevant
`,

    // For general questions and lookups
    general: `
## THINK BEFORE ANSWERING

Before responding to a question:

1. **INTENT UNDERSTANDING**
   - What is the user actually asking?
   - Is there context from the recent conversation?
   - What would be most helpful to them?

2. **DATA CHECK**
   - Do I have the data needed to answer accurately?
   - Is my information current/complete?
   - Any ambiguity that needs clarification?

3. **RESPONSE QUALITY**
   - Am I answering the actual question asked?
   - Is my response clear and actionable?
   - Should I proactively include relevant related info?
`
  };

  return frameworks[taskType] || frameworks.general;
}

/**
 * Map agent tasks to their appropriate reasoning framework
 */
export const TASK_REASONING_MAP = {
  // WorkersSchedulingAgent tasks
  'schedule_workers': 'scheduling',
  'check_availability': 'scheduling',
  'assign_worker': 'scheduling',
  'manage_schedule': 'scheduling',
  'add_worker': 'general',
  'update_worker': 'general',

  // FinancialAgent tasks
  'record_transaction': 'financial',
  'answer_financial_question': 'financial',
  'query_transactions': 'financial',
  'analyze_financials': 'financial',

  // ProjectAgent tasks
  'start_project_creation': 'project_creation',
  'continue_project_creation': 'project_creation',
  'modify_project': 'project_creation',
  'update_project': 'project_creation',

  // EstimateInvoiceAgent tasks
  'create_estimate': 'estimating',
  'create_invoice': 'estimating',
  'modify_estimate': 'estimating',
  'modify_invoice': 'estimating',
  'answer_estimate_question': 'estimating',

  // DocumentAgent / General tasks
  'answer_general_question': 'general',
  'lookup_project': 'general',
  'search_data': 'general',
  'get_project_details': 'general',
};

/**
 * Get the appropriate reasoning framework for a specific task
 * @param {string} task - The task name
 * @returns {string} - The reasoning prompt for that task type
 */
export function getReasoningForTask(task) {
  const frameworkType = TASK_REASONING_MAP[task] || 'general';
  return getReasoningPrompt(frameworkType);
}

/**
 * Get a condensed reasoning reminder (for mid-conversation injection)
 * @param {string} taskType - The type of task
 * @returns {string} - Brief reasoning reminder
 */
export function getReasoningReminder(taskType) {
  const reminders = {
    scheduling: 'Remember: Check worker skills, availability, and conflicts before scheduling.',
    financial: 'Remember: Validate amounts and flag budget concerns before recording.',
    project_creation: 'Remember: Ensure you have location, client, and scope before creating.',
    estimating: 'Remember: Break down materials, labor, and validate against similar work.',
    general: 'Remember: Answer the actual question clearly and helpfully.'
  };

  return reminders[taskType] || reminders.general;
}
