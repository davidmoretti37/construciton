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

  {
    type: 'function',
    function: {
      name: 'update_project',
      description: 'Update project details like contract amount, status, budget, or dates. Use when user wants to modify project information.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'The project UUID (from search_projects or get_project_details)'
          },
          contract_amount: {
            type: 'number',
            description: 'New contract amount (optional)'
          },
          status: {
            type: 'string',
            enum: ['draft', 'on-track', 'behind', 'over-budget', 'completed'],
            description: 'New project status (optional)'
          },
          budget: {
            type: 'number',
            description: 'New budget amount (optional)'
          },
          start_date: {
            type: 'string',
            description: 'New start date in YYYY-MM-DD format (optional)'
          },
          end_date: {
            type: 'string',
            description: 'New end date in YYYY-MM-DD format (optional)'
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
      description: 'Record an expense or income transaction for a project or service plan. Call this when the user wants to log materials purchased, labor costs, payments received, deposits, etc. Provide either project_id OR service_plan_name — not both.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name or UUID to record the transaction against. Names are resolved automatically.'
          },
          service_plan_name: {
            type: 'string',
            description: 'Service plan name to record the transaction against. Use this instead of project_id for service plan expenses. Resolved automatically.'
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
          subcategory: {
            type: 'string',
            description: 'Optional subcategory for detailed tracking. For expenses: wages, overtime, payroll_taxes, workers_comp, benefits (labor); lumber, concrete_cement, plumbing_supplies, electrical_supplies, drywall, paint, hardware, roofing, flooring, fixtures (materials); rental, purchase, fuel_gas, maintenance_repair, small_tools (equipment); sub_plumbing, sub_electrical, sub_hvac, sub_painting, sub_concrete, sub_framing, sub_roofing, sub_landscaping, sub_demolition (subcontractor); building_permit, inspection_fee, impact_fee, utility_connection (permits); office_supplies, vehicle_transport, insurance, cleanup_disposal, professional_fees (misc). For income: contract_payment, change_order, deposit, retainage_release, income_other.'
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

  {
    type: 'function',
    function: {
      name: 'delete_expense',
      description: 'Delete an expense transaction by description, amount, or UUID. OWNER-ONLY. Automatically finds and matches the transaction - just provide enough detail to identify it (e.g., "Home Depot", "$53.22", "drywall screws"). Requires explicit user confirmation before deleting. Returns updated project totals.',
      parameters: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'Description, amount, or partial match of the expense. Examples: "Home Depot", "drywall screws", "$53.22", or UUID if you have it. Will automatically find and match the transaction - you do NOT need to call get_transactions first.'
          },
          project_id: {
            type: 'string',
            description: 'Project name or UUID (optional, helps with ambiguous transaction descriptions)'
          }
        },
        required: ['transaction_id']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'update_expense',
      description: 'Update an existing expense transaction by description or UUID. OWNER-ONLY. Automatically finds the transaction - just provide enough detail to identify it. Use to correct amount, category, description, or date of an expense. All fields are optional - only provided fields will be updated.',
      parameters: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'Description, amount, or UUID of the transaction. Examples: "Home Depot", "$53.22", or UUID. Will automatically find and match the transaction.'
          },
          amount: {
            type: 'number',
            description: 'New expense amount'
          },
          category: {
            type: 'string',
            enum: ['materials', 'labor', 'permits', 'equipment', 'subcontractor', 'misc', 'other'],
            description: 'New expense category'
          },
          description: {
            type: 'string',
            description: 'New description for the expense'
          },
          date: {
            type: 'string',
            description: 'New date in YYYY-MM-DD format'
          },
          subcategory: {
            type: 'string',
            description: 'New subcategory for detailed tracking (see record_expense for valid values)'
          }
        },
        required: ['transaction_id']
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

  // ==================== PHASE & CHECKLIST MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'add_project_checklist',
      description: 'Add tasks to a project\'s Additional Tasks list. This is the DEFAULT tool for "add tasks to the project". Use whenever the user wants to add items to a project\'s task list or says "add these tasks". Handles many items at once. Tasks can be completed by the owner, supervisor, or workers. Do NOT use create_worker_task for this — that tool is only for standalone reminders.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name or UUID. Names are resolved automatically.'
          },
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of task descriptions (e.g., ["Site prep and protection", "Remove existing fixtures", "Rough plumbing inspection"])'
          }
        },
        required: ['project_id', 'items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_project_phase',
      description: 'Create a new phase/stage for an existing project with optional checklist tasks. Use when user says "add a demolition phase" or "create a plumbing phase with these tasks".',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name or UUID. Names are resolved automatically.'
          },
          phase_name: {
            type: 'string',
            description: 'Name of the phase (e.g., "Demolition", "Rough Plumbing", "Finish Work")'
          },
          planned_days: {
            type: 'number',
            description: 'Estimated number of working days for this section. Defaults to 5.'
          },
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional array of checklist task descriptions for this phase'
          },
          budget: { type: 'number', description: 'Dollar budget allocated to this phase (optional, default 0).' }
        },
        required: ['project_id', 'phase_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_phase_budget',
      description: "Update the budget allocated to a specific phase of a project. Use when the owner says 'set the demo phase to $3000' or 'demo phase should be $5k'.",
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project name or UUID.' },
          phase_name: { type: 'string', description: 'Phase name (fuzzy match).' },
          budget: { type: 'number', description: 'New budget amount in dollars.' }
        },
        required: ['project_id', 'phase_name', 'budget']
      }
    }
  },

  // ==================== TASK MUTATIONS ====================
  {
    type: 'function',
    function: {
      name: 'create_worker_task',
      description: 'Create a single standalone reminder or to-do item in a project\'s Additional Tasks list. Use ONLY for one-off reminders like "remind me to call the inspector" or "pick up tile from supplier". For adding multiple tasks at once, use add_project_checklist instead.',
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
            description: 'Project name or UUID to filter transactions. Names are resolved automatically (e.g., "Mark", "Kitchen Remodel").'
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

  // ==================== CLOCK IN/OUT ====================
  {
    type: 'function',
    function: {
      name: 'clock_in_worker',
      description: 'Clock in a worker to a project. Creates a new time tracking entry. Use when user says "clock in [worker] to [project]".',
      parameters: {
        type: 'object',
        properties: {
          worker_id: {
            type: 'string',
            description: 'The worker UUID to clock in'
          },
          project_id: {
            type: 'string',
            description: 'The project UUID to clock into'
          },
          clock_in_time: {
            type: 'string',
            description: 'Optional custom clock-in time (ISO format or HH:MM). Defaults to now.'
          }
        },
        required: ['worker_id', 'project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clock_out_worker',
      description: 'Clock out a worker who is currently clocked in. Finds their active session and closes it. Use when user says "clock out [worker]".',
      parameters: {
        type: 'object',
        properties: {
          worker_id: {
            type: 'string',
            description: 'The worker UUID to clock out'
          },
          clock_out_time: {
            type: 'string',
            description: 'Optional custom clock-out time (ISO format or HH:MM). Defaults to now.'
          },
          notes: {
            type: 'string',
            description: 'Optional notes for the clock-out'
          }
        },
        required: ['worker_id']
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
  },
  // ==================== PROJECT DOCUMENTS ====================
  {
    type: 'function',
    function: {
      name: 'get_project_documents',
      description: "Get all documents uploaded to a project. Use when user asks about project files, blueprints, permits, documents, PDFs, or attachments. Returns document names, types, categories, upload dates, and visibility status.",
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name or UUID'
          },
          category: {
            type: 'string',
            enum: ['general', 'scope', 'permit', 'blueprint'],
            description: 'Optional: filter by document category'
          }
        },
        required: ['project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_business_contracts',
      description: "Get all business-level contract documents uploaded by the user in their Settings > Contracts section. Use when user asks about their contracts, business documents, uploaded documents, templates, or files they saved in settings. These are NOT project-specific documents — they are general business contracts and templates.",
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
      name: 'upload_project_document',
      description: "Upload document(s) attached in the current chat message to a project. The user must have attached files (PDFs, images) in this message. Use when user says 'upload this to project X', 'save these documents', or 'add this file to the kitchen project'. If no project is specified, ask which project.",
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name or UUID to upload documents to'
          },
          category: {
            type: 'string',
            enum: ['general', 'scope', 'permit', 'blueprint'],
            description: 'Document category. Defaults to general.'
          },
          visible_to_workers: {
            type: 'boolean',
            description: 'Whether workers can see these documents. Defaults to false.'
          }
        },
        required: ['project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_project_document',
      description: "Update a project document's metadata — name, category, or worker visibility. Use when user wants to rename a document, change its category, or toggle visibility.",
      parameters: {
        type: 'object',
        properties: {
          document_id: {
            type: 'string',
            description: 'UUID of the document to update'
          },
          file_name: {
            type: 'string',
            description: 'New file name'
          },
          category: {
            type: 'string',
            enum: ['general', 'scope', 'permit', 'blueprint'],
            description: 'New category'
          },
          visible_to_workers: {
            type: 'boolean',
            description: 'Whether workers can see this document'
          }
        },
        required: ['document_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_project_document',
      description: "Delete a document from a project. Removes both the file from storage and the database record. Use when user asks to remove or delete a specific document.",
      parameters: {
        type: 'object',
        properties: {
          document_id: {
            type: 'string',
            description: 'UUID of the document to delete'
          }
        },
        required: ['document_id']
      }
    }
  },
  // ==================== BANK RECONCILIATION ====================
  {
    type: 'function',
    function: {
      name: 'get_bank_transactions',
      description: 'Get bank/card transactions pulled from connected accounts. Filter by match status, date range, or account. Use when owner asks about unmatched transactions, bank reconciliation, or card spending. Returns transaction list with match status and linked project info.',
      parameters: {
        type: 'object',
        properties: {
          match_status: {
            type: 'string',
            enum: ['auto_matched', 'suggested_match', 'manually_matched', 'unmatched', 'ignored', 'created'],
            description: 'Filter by reconciliation status. Use "unmatched" for transactions not yet assigned to projects.'
          },
          start_date: {
            type: 'string',
            description: 'Start date filter (YYYY-MM-DD)'
          },
          end_date: {
            type: 'string',
            description: 'End date filter (YYYY-MM-DD)'
          },
          bank_account_id: {
            type: 'string',
            description: 'Filter by specific connected bank account UUID'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_bank_transaction',
      description: 'Assign an unmatched bank/card transaction to a project as an expense. Creates a new project_transaction and links it to the bank transaction. Use when owner says "put that Home Depot charge on the Smith project" or "assign the $432 transaction to the kitchen remodel".',
      parameters: {
        type: 'object',
        properties: {
          bank_transaction_id: {
            type: 'string',
            description: 'Bank transaction description, merchant name, amount, or UUID. Will auto-resolve to the best match.'
          },
          project_id: {
            type: 'string',
            description: 'Project name or UUID to assign the expense to.'
          },
          category: {
            type: 'string',
            enum: ['materials', 'labor', 'equipment', 'permits', 'subcontractor', 'misc'],
            description: 'Expense category. Suggest based on merchant name if possible.'
          },
          description: {
            type: 'string',
            description: 'Optional override for the expense description. Defaults to bank transaction description.'
          },
          subcategory: {
            type: 'string',
            description: 'Optional subcategory for detailed tracking (see record_expense for valid values)'
          }
        },
        required: ['bank_transaction_id', 'project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_reconciliation_summary',
      description: 'Get a summary of bank reconciliation status: how many transactions are matched, unmatched, or need review. Also shows total unmatched spending amount. Use when owner asks "how is my reconciliation looking?" or "are there unmatched transactions?" or "bank summary".',
      parameters: {
        type: 'object',
        properties: {
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

  // ==================== FINANCIAL REPORTS ====================
  {
    type: 'function',
    function: {
      name: 'get_ar_aging',
      description: 'Get accounts receivable aging report — shows all unpaid invoices bucketed by how overdue they are (current, 1-30 days, 31-60, 61-90, 90+), grouped by client. Use when user asks about overdue invoices, outstanding payments, who owes them money, aging report, or accounts receivable.',
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
      name: 'get_tax_summary',
      description: 'Get annual tax summary with revenue, deductions by IRS Schedule C category, net profit, and 1099 contractor summary. Use when user asks about taxes, deductions, Schedule C, 1099 contractors, tax report, or annual summary.',
      parameters: {
        type: 'object',
        properties: {
          tax_year: {
            type: 'integer',
            description: 'The tax year to summarize (e.g., 2025, 2026). Defaults to current year.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_payroll_summary',
      description: 'Get payroll summary showing worker pay totals for a period. Shows each worker\'s name, trade, hours worked, rate, gross pay, and projects worked. Use when user asks about payroll, worker pay, labor costs, or how much they owe workers.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date (YYYY-MM-DD). Defaults to start of current month.'
          },
          end_date: {
            type: 'string',
            description: 'End date (YYYY-MM-DD). Defaults to today.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_flow',
      description: 'Get cash flow data showing money in vs money out by month for the trailing 6 months. Also includes outstanding receivables. Use when user asks about cash flow, money coming in and going out, or how their cash position looks.',
      parameters: {
        type: 'object',
        properties: {
          months: {
            type: 'integer',
            description: 'Number of trailing months to include (default 6, max 12)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_recurring_expenses',
      description: 'Get all recurring expenses (equipment rentals, insurance, subscriptions, etc). Shows description, amount, frequency, category, next due date, and associated project. Use when user asks about recurring costs, regular payments, subscriptions, or upcoming bills.',
      parameters: {
        type: 'object',
        properties: {
          active_only: {
            type: 'boolean',
            description: 'If true, only return active recurring expenses. Defaults to true.'
          }
        },
        required: []
      }
    }
  },
  // ==================== SERVICE PLAN TOOLS ====================
  {
    type: 'function',
    function: {
      name: 'get_service_plans',
      description: 'Get all service plans for the user. Use when user asks about service plans, recurring services, or clients on service contracts. Returns plans with location counts and visit stats.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'paused', 'cancelled'], description: 'Filter by plan status. Omit for all.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_route',
      description: 'Get the daily route/visit schedule for a specific date. Shows routes with stops, visit details, locations, and checklist completion. Use for "what\'s my route today?", "where do I go?", or daily scheduling questions.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today.' },
          worker_id: { type: 'string', description: 'Worker name or UUID to filter by. Omit for all routes.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_visit',
      description: 'Mark a service visit as completed. Use when worker or owner says they finished a visit/stop.',
      parameters: {
        type: 'object',
        properties: {
          visit_id: { type: 'string', description: 'The visit UUID to complete.' },
          notes: { type: 'string', description: 'Optional completion notes.' }
        },
        required: ['visit_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_billing_summary',
      description: 'Get billing summary showing unbilled visit counts and estimated revenue for service plans. Use for "how much do I bill?", "unbilled visits", or billing/revenue questions about recurring services.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'Service plan name or UUID. Omit for summary across all plans.' },
          month: { type: 'string', description: 'Month in YYYY-MM format. Defaults to current month.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_service_visit',
      description: 'Create a one-off service visit for a location. Use when owner wants to add an extra visit outside the normal schedule.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'Service plan name or UUID.' },
          location_id: { type: 'string', description: 'Location name or UUID within the plan.' },
          date: { type: 'string', description: 'Visit date in YYYY-MM-DD format.' },
          worker_id: { type: 'string', description: 'Worker name or UUID to assign.' },
          notes: { type: 'string', description: 'Optional notes for the visit.' }
        },
        required: ['plan_id', 'location_id', 'date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_service_plan',
      description: 'Update fields on an existing service plan: name, status (active/paused/cancelled), billing_cycle (per_visit/monthly), price_per_visit, monthly_rate, service_type, or notes. Only provide the fields you want to change.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'Service plan name or UUID.' },
          name: { type: 'string', description: 'New plan name.' },
          status: { type: 'string', enum: ['active', 'paused', 'cancelled'], description: 'New status.' },
          billing_cycle: { type: 'string', enum: ['per_visit', 'monthly'], description: 'How the plan bills.' },
          price_per_visit: { type: 'number', description: 'Per-visit price (for per_visit plans).' },
          monthly_rate: { type: 'number', description: 'Monthly rate (for monthly plans).' },
          service_type: { type: 'string', description: 'pest control, cleaning, landscaping, pool, hvac, lawn care, other.' },
          notes: { type: 'string', description: 'Free-form notes.' }
        },
        required: ['plan_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_service_location',
      description: 'Add a new service location (recurring service stop) to an existing service plan. Each location is a place the crew visits — house, office, building.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'Service plan name or UUID.' },
          name: { type: 'string', description: 'Location name, e.g. "Smith Residence" or "Main Office".' },
          address: { type: 'string', description: 'Full street address.' },
          access_notes: { type: 'string', description: 'Optional access instructions: gate codes, parking, key location, etc.' }
        },
        required: ['plan_id', 'name', 'address']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_worker_to_plan',
      description: 'Assign a worker to all upcoming visits on a service plan. Updates every scheduled (non-cancelled, non-completed) future visit.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'Service plan name or UUID.' },
          worker_id: { type: 'string', description: 'Worker name or UUID.' }
        },
        required: ['plan_id', 'worker_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_service_plan_details',
      description: 'Get full detail for a service plan: locations, recent + upcoming visits (with worker names), and financial summary (income, expenses, profit by category).',
      parameters: {
        type: 'object',
        properties: { plan_id: { type: 'string', description: 'Service plan name or UUID.' } },
        required: ['plan_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_service_plan_summary',
      description: 'Quick health summary for a service plan: active location count, this-month visit stats (total/completed), and lifetime revenue/expenses/profit.',
      parameters: {
        type: 'object',
        properties: { plan_id: { type: 'string', description: 'Service plan name or UUID.' } },
        required: ['plan_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_service_plan',
      description: 'Permanently delete a service plan and cascade-delete its locations and visits. Owners only — supervisors are blocked. ALWAYS confirm with the user before calling.',
      parameters: {
        type: 'object',
        properties: { plan_id: { type: 'string', description: 'Service plan name or UUID.' } },
        required: ['plan_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_service_plan_documents',
      description: 'List documents/files attached to a service plan. Optionally filter by category.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'Service plan name or UUID.' },
          category: { type: 'string', description: 'Optional category filter (e.g. "contract", "photo", "report").' }
        },
        required: ['plan_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'upload_service_plan_document',
      description: 'Upload a file (image, PDF, etc.) to a service plan. Use when the user attaches files and asks to save them to a service plan.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'Service plan name or UUID.' },
          category: { type: 'string', description: 'Category label (default: "general").' },
          visible_to_workers: { type: 'boolean', description: 'Whether workers can see this document. Default: false.' },
          file_name: { type: 'string', description: 'Override the attached filename.' }
        },
        required: ['plan_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_service_location',
      description: 'Update an existing service location: rename, change address, update access notes, or toggle active/inactive.',
      parameters: {
        type: 'object',
        properties: {
          location_id: { type: 'string', description: 'Location UUID.' },
          name: { type: 'string', description: 'New location name.' },
          address: { type: 'string', description: 'New address.' },
          access_notes: { type: 'string', description: 'Access instructions.' },
          is_active: { type: 'boolean', description: 'Whether the location is active.' }
        },
        required: ['location_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_service_plan_revenue',
      description: 'Calculate projected, realized, and unbilled revenue for a service plan (or all active plans) over a date range. Returns per-plan breakdown plus totals. Default range = current month.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'Optional: name or UUID of a single plan. Omit to calculate across all active plans.' },
          start_date: { type: 'string', description: 'Range start, YYYY-MM-DD (default: first day of current month).' },
          end_date: { type: 'string', description: 'Range end, YYYY-MM-DD (default: first day of next month).' }
        }
      }
    }
  },
  // ==================== DAILY CHECKLIST TOOLS ====================
  {
    type: 'function',
    function: {
      name: 'setup_daily_checklist',
      description: 'Set up daily checklist items and labor roles for a project or service plan. Use during creation when the owner says their crew has daily items to log — quantities, materials, safety checks, etc. Takes both checklist items and labor roles in one call.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'UUID of the project (provide this OR service_plan_id, not both)' },
          service_plan_id: { type: 'string', description: 'UUID of the service plan (provide this OR project_id, not both)' },
          checklist_items: {
            type: 'array',
            description: 'Array of daily checklist items the crew will fill out each day',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Item name, e.g. "Fiber spliced", "Safety inspection done", "Debris hauled"' },
                item_type: { type: 'string', enum: ['checkbox', 'quantity'], description: 'checkbox = done/not done, quantity = number + unit. Default: checkbox' },
                quantity_unit: { type: 'string', description: 'Unit label for quantity items, e.g. "feet", "bags", "gallons", "sq ft"' },
                requires_photo: { type: 'boolean', description: 'Whether a photo is required for this item. Default: false' }
              },
              required: ['title']
            }
          },
          labor_roles: {
            type: 'array',
            description: 'Array of labor roles that show up on this job daily',
            items: {
              type: 'object',
              properties: {
                role_name: { type: 'string', description: 'Role name, e.g. "Fiber Splicer", "Laborer", "Flagman", "Foreman"' },
                default_quantity: { type: 'integer', description: 'Default headcount for this role. Default: 1' }
              },
              required: ['role_name']
            }
          }
        },
        required: ['checklist_items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_checklist_report',
      description: 'Get daily checklist reports for a project or service plan. Shows what the crew logged on specific dates — checklist items completed, quantities, labor headcounts, photos, and notes.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'UUID of the project (provide this OR service_plan_id)' },
          service_plan_id: { type: 'string', description: 'UUID of the service plan (provide this OR project_id)' },
          date: { type: 'string', description: 'Specific date in YYYY-MM-DD format. If omitted, returns last 7 days.' },
          start_date: { type: 'string', description: 'Start date for range query (YYYY-MM-DD)' },
          end_date: { type: 'string', description: 'End date for range query (YYYY-MM-DD)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_checklist_summary',
      description: 'Get aggregated checklist summary over time for a project or service plan. Use when owner asks "how much fiber this week?", "show me labor totals", or "what\'s the completion rate?" Returns totals, averages, and trends.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'UUID of the project (provide this OR service_plan_id)' },
          service_plan_id: { type: 'string', description: 'UUID of the service plan (provide this OR project_id)' },
          start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format (default: 30 days ago)' },
          end_date: { type: 'string', description: 'End date in YYYY-MM-DD format (default: today)' }
        }
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
  update_project: 'Updating project...',
  record_expense: 'Recording transaction...',
  delete_expense: 'Deleting expense...',
  update_expense: 'Updating expense...',
  update_phase_progress: 'Updating phase progress...',
  convert_estimate_to_invoice: 'Creating invoice from estimate...',
  update_invoice: 'Updating invoice...',
  void_invoice: 'Voiding invoice...',
  create_work_schedule: 'Creating work schedule...',
  create_worker_task: 'Creating task...',
  add_project_checklist: 'Adding tasks...',
  create_project_phase: 'Creating project phase...',
  update_phase_budget: 'Updating phase budget...',
  update_service_pricing: 'Updating pricing...',
  // Bank reconciliation tools
  get_bank_transactions: 'Checking bank transactions...',
  assign_bank_transaction: 'Assigning transaction to project...',
  get_reconciliation_summary: 'Checking reconciliation status...',
  // Financial report tools
  get_ar_aging: 'Checking overdue invoices...',
  get_tax_summary: 'Pulling tax summary...',
  get_payroll_summary: 'Calculating payroll...',
  get_cash_flow: 'Analyzing cash flow...',
  get_recurring_expenses: 'Checking recurring expenses...',
  // Document management tools
  get_project_documents: 'Fetching project documents...',
  get_business_contracts: 'Fetching your business contracts...',
  upload_project_document: 'Uploading documents...',
  update_project_document: 'Updating document...',
  delete_project_document: 'Deleting document...',
  // Clock in/out tools
  clock_in_worker: 'Clocking in worker...',
  clock_out_worker: 'Clocking out worker...',
  // Service plan tools
  get_service_plans: 'Checking service plans...',
  get_daily_route: 'Loading today\'s route...',
  complete_visit: 'Completing visit...',
  get_billing_summary: 'Calculating billing...',
  create_service_visit: 'Creating visit...',
  update_service_plan: 'Updating service plan...',
  add_service_location: 'Adding service location...',
  update_service_location: 'Updating service location...',
  assign_worker_to_plan: 'Assigning worker to plan...',
  calculate_service_plan_revenue: 'Calculating service plan revenue...',
  get_service_plan_details: 'Loading service plan details...',
  get_service_plan_summary: 'Loading service plan summary...',
  delete_service_plan: 'Deleting service plan...',
  get_service_plan_documents: 'Loading service plan documents...',
  upload_service_plan_document: 'Uploading service plan document...',
  // Daily checklist tools
  setup_daily_checklist: 'Setting up daily checklist...',
  get_daily_checklist_report: 'Pulling daily reports...',
  get_daily_checklist_summary: 'Summarizing daily data...',
};

function getToolStatusMessage(toolName) {
  return TOOL_STATUS_MESSAGES[toolName] || 'Working on it...';
}

module.exports = { toolDefinitions, getToolStatusMessage, TOOL_STATUS_MESSAGES };
