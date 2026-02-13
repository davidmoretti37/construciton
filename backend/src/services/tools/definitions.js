/**
 * Tool definitions for the unified AI agent.
 * These are READ-ONLY tools that let Claude search/fetch data from Supabase.
 * All write operations happen through the action system on the frontend.
 *
 * Format: OpenAI function-calling compatible (works with OpenRouter + Claude)
 */

const toolDefinitions = [
  // ==================== PROJECTS ====================
  {
    type: 'function',
    function: {
      name: 'search_projects',
      description: 'Search for projects by name, client name, or status. Use this when the user mentions a project by name, asks about their projects, or you need to find a project before updating it. Returns a list of matching projects with basic info.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term to match against project name or client name. Leave empty to get all projects.'
          },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'archived', 'draft', 'on-track', 'behind', 'over-budget'],
            description: 'Filter by project status. Omit to include all statuses.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_details',
      description: 'Get full details of a specific project including phases, tasks, budget breakdown, assigned workers, and timeline. Use this after finding a project via search to get complete information.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'The project name or UUID. You can pass a name like "Smith kitchen" and it will be resolved automatically.'
          }
        },
        required: ['project_id']
      }
    }
  },

  // ==================== PROJECT MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'delete_project',
      description: 'Permanently delete a project. ONLY call this after the user has explicitly confirmed they want the project deleted. Returns success or error.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'The project name or UUID to delete. Names are resolved automatically.'
          }
        },
        required: ['project_id']
      }
    }
  },

  // ==================== FINANCIAL MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'record_expense',
      description: 'Record an expense or income transaction for a project. Call this when the user wants to log materials purchased, labor costs, payments received, deposits, etc. Returns the transaction and updated project totals.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name or UUID to record the transaction against. Names are resolved automatically.'
          },
          type: {
            type: 'string',
            enum: ['expense', 'income'],
            description: 'Whether this is an expense (money spent) or income (money received/deposit)'
          },
          amount: {
            type: 'number',
            description: 'Dollar amount of the transaction'
          },
          category: {
            type: 'string',
            enum: ['materials', 'labor', 'equipment', 'permits', 'subcontractor', 'misc', 'payment', 'deposit'],
            description: 'Transaction category'
          },
          description: {
            type: 'string',
            description: 'Description of the transaction (e.g., "Home Depot - drywall materials")'
          },
          date: {
            type: 'string',
            description: 'Transaction date in YYYY-MM-DD format. Defaults to today if not specified.'
          }
        },
        required: ['project_id', 'type', 'amount', 'category', 'description']
      }
    }
  },

  // ==================== PHASE MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'update_phase_progress',
      description: 'Update the completion percentage of a project phase. Call this when the user says things like "demo is 75% done" or "mark painting as complete". Automatically updates phase status based on percentage.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name or UUID. Names are resolved automatically.'
          },
          phase_name: {
            type: 'string',
            description: 'Name of the phase to update (e.g., "Demo", "Rough Plumbing", "Painting")'
          },
          percentage: {
            type: 'number',
            description: 'Completion percentage (0-100). Use 100 to mark as complete.'
          }
        },
        required: ['project_id', 'phase_name', 'percentage']
      }
    }
  },

  // ==================== INVOICE MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'convert_estimate_to_invoice',
      description: 'Convert an accepted estimate into an invoice. Copies all line items, client info, and pricing from the estimate. Invoice number is auto-generated. Call this when the user says "convert the estimate to an invoice" or "invoice the Smith estimate".',
      parameters: {
        type: 'object',
        properties: {
          estimate_id: {
            type: 'string',
            description: 'Estimate number, client name, or UUID. Names are resolved automatically (e.g., "Smith" or "EST-2026-001").'
          }
        },
        required: ['estimate_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_invoice',
      description: 'Update an existing invoice. Use to change status, due date, payment terms, record a payment, or add notes. Call this when the user says "mark the invoice as paid" or "extend the due date".',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: {
            type: 'string',
            description: 'Invoice number, client name, or UUID. Names are resolved automatically (e.g., "Smith" or "INV-2026-001").'
          },
          status: {
            type: 'string',
            enum: ['unpaid', 'partial', 'paid', 'overdue', 'cancelled'],
            description: 'New invoice status'
          },
          due_date: {
            type: 'string',
            description: 'New due date in YYYY-MM-DD format'
          },
          payment_terms: {
            type: 'string',
            description: 'Payment terms (e.g., "Net 30", "Due on receipt")'
          },
          notes: {
            type: 'string',
            description: 'Invoice notes'
          },
          amount_paid: {
            type: 'number',
            description: 'Total amount paid so far. Status auto-derives: paid >= total → "paid", paid > 0 → "partial"'
          },
          payment_method: {
            type: 'string',
            description: 'Payment method (e.g., "cash", "check", "transfer", "card")'
          }
        },
        required: ['invoice_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'void_invoice',
      description: 'Void/cancel an invoice. Sets the status to cancelled. Call this when the user says "void the invoice" or "cancel invoice INV-001". ONLY call after user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: {
            type: 'string',
            description: 'Invoice number, client name, or UUID. Names are resolved automatically.'
          }
        },
        required: ['invoice_id']
      }
    }
  },

  // ==================== SCHEDULE MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'create_work_schedule',
      description: 'Create a work schedule entry for a worker on a project. Use when the user says "schedule Jose on the bathroom project next week" or "put Carlos on site Monday through Friday".',
      parameters: {
        type: 'object',
        properties: {
          worker: {
            type: 'string',
            description: 'Worker name or UUID. Names are resolved automatically.'
          },
          project: {
            type: 'string',
            description: 'Project name or UUID. Names are resolved automatically.'
          },
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format'
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format. Defaults to start_date for single-day schedules.'
          },
          start_time: {
            type: 'string',
            description: 'Start time (e.g., "07:00", "8:00 AM"). Optional.'
          },
          end_time: {
            type: 'string',
            description: 'End time (e.g., "16:00", "4:00 PM"). Optional.'
          },
          notes: {
            type: 'string',
            description: 'Optional notes about this schedule entry'
          }
        },
        required: ['worker', 'project', 'start_date']
      }
    }
  },

  // ==================== TASK MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'create_worker_task',
      description: 'Create a task linked to a project. Use when the user says "add a task to the kitchen project: pick up tile" or "remind me to call the inspector for the Smith job".',
      parameters: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: 'Project name or UUID. Names are resolved automatically.'
          },
          title: {
            type: 'string',
            description: 'Task title/description (e.g., "Pick up tile from supplier")'
          },
          description: {
            type: 'string',
            description: 'Optional detailed description'
          },
          start_date: {
            type: 'string',
            description: 'Task start date in YYYY-MM-DD format. Defaults to today.'
          },
          end_date: {
            type: 'string',
            description: 'Task end date in YYYY-MM-DD format. Defaults to start_date.'
          }
        },
        required: ['project', 'title']
      }
    }
  },

  // ==================== SERVICE PRICING MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'update_service_pricing',
      description: 'Update pricing for a service item in the user\'s service catalog. Use when the user says "change interior painting to $5 per sq ft" or "update my tile price to $8".',
      parameters: {
        type: 'object',
        properties: {
          service_name: {
            type: 'string',
            description: 'Service category name (e.g., "Painting", "Tile Installation", "Plumbing")'
          },
          item_name: {
            type: 'string',
            description: 'Specific item within the service (e.g., "Interior Painting", "Floor Tile", "Fixture Installation")'
          },
          price: {
            type: 'number',
            description: 'New price per unit'
          },
          unit: {
            type: 'string',
            description: 'Price unit (e.g., "sq ft", "hour", "job", "unit", "linear ft"). Optional — keeps existing unit if not specified.'
          }
        },
        required: ['service_name', 'item_name', 'price']
      }
    }
  },

  // ==================== ESTIMATES ====================
  {
    type: 'function',
    function: {
      name: 'search_estimates',
      description: 'Search for estimates by client name, project name, or status. Use when user asks about estimates, wants to find a specific estimate, or needs estimate data.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term to match against client name or project name. Leave empty for all estimates.'
          },
          status: {
            type: 'string',
            enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'],
            description: 'Filter by estimate status'
          },
          project_id: {
            type: 'string',
            description: 'Filter by linked project ID'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_estimate_details',
      description: 'Get full estimate with all line items, client info, pricing, and linked project. Use after search to get complete estimate data.',
      parameters: {
        type: 'object',
        properties: {
          estimate_id: {
            type: 'string',
            description: 'The estimate number, client name, or UUID. You can pass "Smith" or "EST-001" and it will be resolved automatically.'
          }
        },
        required: ['estimate_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_estimate',
      description: 'Update an estimate - link it to a project or change its status. Use when user wants to associate an estimate with a project.',
      parameters: {
        type: 'object',
        properties: {
          estimate_id: {
            type: 'string',
            description: 'The estimate UUID (from search_estimates)'
          },
          project_id: {
            type: 'string',
            description: 'The project UUID to link this estimate to (optional)'
          },
          status: {
            type: 'string',
            enum: ['draft', 'sent', 'accepted', 'rejected'],
            description: 'New status (optional)'
          }
        },
        required: ['estimate_id']
      }
    }
  },

  // ==================== INVOICES ====================
  {
    type: 'function',
    function: {
      name: 'search_invoices',
      description: 'Search for invoices by client name, status, or project. Use when user asks about invoices, payments, or billing.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term to match against client name or invoice number. Leave empty for all invoices.'
          },
          status: {
            type: 'string',
            enum: ['unpaid', 'partial', 'paid', 'overdue', 'cancelled'],
            description: 'Filter by invoice status'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice_details',
      description: 'Get full invoice with line items, payment history, and linked estimate/project.',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: {
            type: 'string',
            description: 'The invoice number, client name, or UUID. You can pass "Smith" or "INV-001" and it will be resolved automatically.'
          }
        },
        required: ['invoice_id']
      }
    }
  },

  // ==================== WORKERS ====================
  {
    type: 'function',
    function: {
      name: 'get_workers',
      description: 'Get all workers with their status, trade, rates, and current clock-in status. Use when user asks about workers, who is working, or needs worker info for scheduling/assignments.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'pending', 'inactive'],
            description: 'Filter by worker status. Omit for all workers.'
          },
          trade: {
            type: 'string',
            description: 'Filter by trade (e.g., "Electrician", "Plumber")'
          },
          include_clock_status: {
            type: 'boolean',
            description: 'Include current clock-in/out status for each worker. Default true.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_worker_details',
      description: 'Get full details for a specific worker including assignments, recent time entries, hours worked, and payment info. Use when user asks about a specific worker.',
      parameters: {
        type: 'object',
        properties: {
          worker_id: {
            type: 'string',
            description: 'The worker name or UUID. You can pass a name like "Jose" and it will be resolved automatically.'
          }
        },
        required: ['worker_id']
      }
    }
  },

  // ==================== SCHEDULE ====================
  {
    type: 'function',
    function: {
      name: 'get_schedule_events',
      description: 'Get calendar events (meetings, appointments, site visits) for a date range. Also returns work schedules and worker tasks for those dates.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format'
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format. Defaults to start_date if not provided.'
          },
          worker_id: {
            type: 'string',
            description: 'Filter events for a specific worker'
          },
          project_id: {
            type: 'string',
            description: 'Filter events for a specific project'
          }
        },
        required: ['start_date']
      }
    }
  },

  // ==================== FINANCIALS ====================
  {
    type: 'function',
    function: {
      name: 'get_project_financials',
      description: 'Get detailed financial data for a specific project: budget, total expenses by category, total income, profit/loss, and recent transactions.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'The project name or UUID. You can pass a name like "Smith kitchen" and it will be resolved automatically.'
          }
        },
        required: ['project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_financial_overview',
      description: 'Get overall business financial summary across all projects: total income, total expenses, profit, and per-project breakdown. Use when user asks about overall finances, profit, or business performance.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date for the financial period (YYYY-MM-DD). Omit for all-time.'
          },
          end_date: {
            type: 'string',
            description: 'End date for the financial period (YYYY-MM-DD). Omit for all-time.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Get individual financial transactions (income and expenses) with optional filters. Use when user asks about specific expenses, payments, or transaction history.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Filter by project'
          },
          type: {
            type: 'string',
            enum: ['income', 'expense'],
            description: 'Filter by transaction type'
          },
          category: {
            type: 'string',
            description: 'Filter by category (e.g., "materials", "labor", "permits", "subcontractor")'
          },
          start_date: {
            type: 'string',
            description: 'Start date filter (YYYY-MM-DD)'
          },
          end_date: {
            type: 'string',
            description: 'End date filter (YYYY-MM-DD)'
          }
        },
        required: []
      }
    }
  },

  // ==================== DAILY REPORTS & PHOTOS ====================
  {
    type: 'function',
    function: {
      name: 'get_daily_reports',
      description: 'Get daily work reports with filters. Reports include worker notes, completed tasks, photos, and issues. Use when user asks about daily reports, work progress, or site activity.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Filter by project'
          },
          worker_id: {
            type: 'string',
            description: 'Filter by worker who submitted the report'
          },
          start_date: {
            type: 'string',
            description: 'Start date filter (YYYY-MM-DD)'
          },
          end_date: {
            type: 'string',
            description: 'End date filter (YYYY-MM-DD)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_photos',
      description: 'Get project photos with filters. Use when user asks to see photos, progress pictures, or site images.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Filter by project'
          },
          phase_id: {
            type: 'string',
            description: 'Filter by project phase'
          },
          start_date: {
            type: 'string',
            description: 'Start date filter (YYYY-MM-DD)'
          },
          end_date: {
            type: 'string',
            description: 'End date filter (YYYY-MM-DD)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_time_records',
      description: 'Get time tracking records (clock-ins/outs) for workers. Use when user asks about worker hours, who worked today, time tracking, clock-ins, or timesheet data. Returns time entries with calculated hours.',
      parameters: {
        type: 'object',
        properties: {
          worker_id: {
            type: 'string',
            description: 'Filter by specific worker name or ID'
          },
          project_id: {
            type: 'string',
            description: 'Filter by specific project name or ID'
          },
          start_date: {
            type: 'string',
            description: 'Start date (YYYY-MM-DD). Defaults to today if not specified.'
          },
          end_date: {
            type: 'string',
            description: 'End date (YYYY-MM-DD). Defaults to start_date if not specified.'
          },
          include_active: {
            type: 'boolean',
            description: 'Include currently active clock-ins (not clocked out yet). Default true.'
          }
        },
        required: []
      }
    }
  },

  // ==================== SETTINGS ====================
  {
    type: 'function',
    function: {
      name: 'get_business_settings',
      description: 'Get user business settings including: business info (name, phone, address), service catalog with pricing, profit margins, phase templates, and invoice template. Use when user asks about their settings, pricing, or business info.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  // ==================== INTELLIGENT TOOLS ====================
  {
    type: 'function',
    function: {
      name: 'global_search',
      description: 'Universal search across all data — projects, estimates, invoices, and workers in one call. Use this for broad searches like "find the Smith job" or "anything related to kitchen" instead of calling multiple individual search tools.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text to search for across all entities (names, client names, invoice numbers, trades, etc.)'
          },
          limit: {
            type: 'integer',
            description: 'Max results per category. Default 5.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_briefing',
      description: "Generate a morning briefing for the business owner. Returns today's schedule, overdue invoices, at-risk projects, and team clock-in status. Use when user says things like 'What's happening today?', 'morning update', 'give me a rundown', or 'daily briefing'.",
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_summary',
      description: "Get a synthesized, high-level project summary in one call — status, phase progress, financials, team, and recent activity. More efficient than calling get_project_details + get_project_financials separately. Use when user asks 'How is the project going?' or 'Give me a status update on X'.",
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'The project name or UUID. You can pass a name like "Smith kitchen" and it will be resolved automatically.'
          }
        },
        required: ['project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_pricing',
      description: "Suggest pricing for estimate line items based on this user's historical project data and service catalog. Use when creating estimates to provide data-backed pricing instead of guessing. Returns average, high, low prices and the data source.",
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of service/work descriptions to get pricing for (e.g., ["Install porcelain tile", "Rough plumbing for shower", "Paint walls 2 coats"])'
          },
          complexity: {
            type: 'string',
            enum: ['simple', 'moderate', 'complex'],
            description: 'Job complexity — used to adjust pricing suggestions up or down'
          }
        },
        required: ['items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_worker',
      description: "Assign a worker to a project for the project's entire duration. Creates a project assignment record. Simpler than creating a detailed work schedule when you just need to add someone to a project. Use when user says 'put Jose on the kitchen project' or 'assign Carlos to the Smith job'.",
      parameters: {
        type: 'object',
        properties: {
          worker_id: {
            type: 'string',
            description: 'The worker name or UUID. You can pass a name like "Jose" and it will be resolved automatically.'
          },
          project_id: {
            type: 'string',
            description: 'The project name or UUID. You can pass a name like "Smith kitchen" and it will be resolved automatically.'
          }
        },
        required: ['worker_id', 'project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_summary_report',
      description: 'Generate a summary of all work completed on a project over a date range. Compiles notes, photos, and completed tasks from all daily reports into a single client-ready summary. Use when user wants a progress update for a client or a weekly/monthly recap.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'The project to generate the report for'
          },
          start_date: {
            type: 'string',
            description: 'Start of reporting period (YYYY-MM-DD)'
          },
          end_date: {
            type: 'string',
            description: 'End of reporting period (YYYY-MM-DD)'
          }
        },
        required: ['project_id', 'start_date', 'end_date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'share_document',
      description: "Look up a client's contact info and determine the best way to share a document (estimate or invoice). Returns the client's phone/email and suggests the appropriate send action. Use when user says 'send the estimate to Carolyn' or 'share the invoice with the client'.",
      parameters: {
        type: 'object',
        properties: {
          document_id: {
            type: 'string',
            description: 'The UUID of the estimate or invoice to share'
          },
          document_type: {
            type: 'string',
            enum: ['estimate', 'invoice'],
            description: 'Whether this is an estimate or invoice'
          },
          recipient_id: {
            type: 'string',
            description: 'Optional: the client UUID. If not provided, uses the contact info on the document itself.'
          },
          method: {
            type: 'string',
            enum: ['sms', 'whatsapp', 'email'],
            description: "Optional: force a specific delivery method. If omitted, auto-selects based on client's available contact info."
          }
        },
        required: ['document_id', 'document_type']
      }
    }
  }
];

/**
 * Status messages shown to user during tool execution
 */
const TOOL_STATUS_MESSAGES = {
  // Granular tools
  search_projects: 'Looking up your projects...',
  get_project_details: 'Getting project details...',
  search_estimates: 'Searching estimates...',
  get_estimate_details: 'Loading estimate details...',
  update_estimate: 'Updating estimate...',
  search_invoices: 'Searching invoices...',
  get_invoice_details: 'Loading invoice details...',
  get_workers: 'Checking your workers...',
  get_worker_details: 'Loading worker info...',
  get_schedule_events: 'Checking the schedule...',
  get_project_financials: 'Reviewing project finances...',
  get_financial_overview: 'Analyzing your finances...',
  get_transactions: 'Looking up transactions...',
  get_daily_reports: 'Retrieving daily reports...',
  get_photos: 'Finding project photos...',
  get_time_records: 'Checking time tracking records...',
  get_business_settings: 'Checking your settings...',
  // Intelligent tools
  global_search: 'Searching across everything...',
  get_daily_briefing: 'Preparing your daily briefing...',
  get_project_summary: 'Summarizing project status...',
  suggest_pricing: 'Analyzing your pricing history...',
  assign_worker: 'Assigning worker to project...',
  generate_summary_report: 'Compiling project report...',
  share_document: 'Preparing document to share...',
  // Mutation tools
  delete_project: 'Deleting project...',
  record_expense: 'Recording transaction...',
  update_phase_progress: 'Updating phase progress...',
  convert_estimate_to_invoice: 'Creating invoice from estimate...',
  update_invoice: 'Updating invoice...',
  void_invoice: 'Voiding invoice...',
  create_work_schedule: 'Creating work schedule...',
  create_worker_task: 'Creating task...',
  update_service_pricing: 'Updating pricing...',
};

function getToolStatusMessage(toolName) {
  return TOOL_STATUS_MESSAGES[toolName] || 'Working on it...';
}

module.exports = { toolDefinitions, getToolStatusMessage, TOOL_STATUS_MESSAGES };
