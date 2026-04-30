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
      description: 'List/find EXISTING projects by client name, project name, or status. Returns name + status + start/end dates only — no phases or financials. Call before updating an existing project, or to answer "do I have a project for X?". **DO NOT call before creating a NEW project** — if the user said "create a project for Smith", they know it doesn\'t exist yet; emit a `project-preview` card directly. For full detail on one specific project use `get_project_details` instead.',
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
      description: 'Fetch ONE project\'s full state: phases (with progress %), tasks, budget by phase, assigned workers, supervisor, timeline. Use when the user names a specific project and you need to answer about its details ("how is the Smith bathroom going?"). For listing/searching multiple projects use `search_projects`. For just the financials use `get_project_financials`. For an executive-style summary use `get_project_summary`.',
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
      description: 'IRREVERSIBLE. Permanently delete a project and cascade-delete its phases, tasks, transactions, and assignments. **You MUST get explicit user confirmation in the SAME TURN before calling — phrases like "yes delete it" / "confirm" / "go ahead" after you described what would be deleted.** If the user just says "delete X" without prior confirmation, do NOT call this tool — instead show what will be deleted and ask "Are you sure? This cannot be undone." Only call after explicit yes. Owner-only.',
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
      description: 'Modify a project\'s top-level fields: contract amount, budget, status, start/end dates. Use for changes that apply to the WHOLE project, not a specific phase. For phase-level changes use `update_phase_progress` (mark a phase % done) or `update_phase_budget` (change one phase\'s budget allocation). Always include project_id; only include the fields the user actually wants changed.',
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
          phase_id: {
            type: 'string',
            description: 'UUID of the project phase this transaction belongs to. REQUIRED for expenses (unless subcategory is provided). Use phase_name instead if you only have the phase name — the backend will resolve it.'
          },
          phase_name: {
            type: 'string',
            description: 'Name of the project phase this transaction belongs to (e.g. "Demolition", "Framing", "Drywall"). Alternative to phase_id — the backend resolves the name to an id. If the name matches multiple phases, the tool returns the options so you can ask the user which one. If the user did NOT tell you which phase, do NOT guess — omit this and the tool will return the list of phases for you to ask.'
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
      description: 'IRREVERSIBLE. Delete a transaction (expense or income) by description, amount, or UUID. Owner-only. **You MUST get explicit confirmation in the SAME TURN before calling.** If the user says "delete the last expense" / "remove that Home Depot charge" without prior confirmation, do NOT fire this tool yet — first call `get_transactions` to find the matching row, show the user "Delete \\$X for Y on date Z?" and wait for explicit yes. Only call this tool AFTER the user confirms.',
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
      description: 'Set how COMPLETE a project phase is, as a percentage (0-100). Use when user says "demo is 75% done" / "rough electrical is finished" / "mark painting complete". This is for PROGRESS, not budget — to change a phase\'s budget allocation use `update_phase_budget` instead. Phase status auto-derives from percentage (0 = not_started, 1-99 = in_progress, 100 = completed).',
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
      description: 'Mark an invoice as voided/cancelled. Visible in invoice history (not deleted) but no longer counted toward A/R. **You MUST get explicit confirmation in the SAME TURN before calling.** If the user says "void invoice INV-001" or "cancel that invoice" without prior confirmation, first show "Void invoice INV-001 for $X to client Y? This won\'t delete it but removes it from A/R." Wait for explicit yes before firing.',
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

  // ==================== DRAWS (PROGRESS BILLING) ====================
  {
    type: 'function',
    function: {
      name: 'create_draw_schedule',
      description: 'Set up a progress billing (draw) schedule on a project — used when a job is too large for one-shot invoicing (new construction, $50K+ remodels). Define the milestones the contractor will bill against (e.g. "25% deposit, 25% rough-in, 25% drywall, 25% final"). Replaces any existing schedule on the project. Call when the user says things like "set up a draw schedule", "bill this in draws", or "this is a $200K job, let\'s do progress draws".',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name, address, or UUID. Names are resolved automatically.'
          },
          retainage_percent: {
            type: 'number',
            description: 'Percent held back per draw (typical: 10). Range 0–20. Defaults to 0 if omitted.'
          },
          items: {
            type: 'array',
            description: 'Ordered list of draws. Each draw must have either percent_of_contract OR fixed_amount (not both), AND a trigger_type that decides when the draw auto-flips to "ready to send".',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Milestone description, e.g. "Deposit at signing", "Foundation complete", "Rough-in (frame/electrical/plumbing)".' },
                percent_of_contract: { type: 'number', description: 'Percent of project contract_amount (1–100). Use this for %-based draws. Floats with the contract so change orders flow through.' },
                fixed_amount: { type: 'number', description: 'Fixed dollar amount for this draw. Use for flat-amount draws like a $5,000 deposit.' },
                trigger_type: {
                  type: 'string',
                  enum: ['phase_completion', 'project_start', 'manual'],
                  description: 'When should this draw auto-flip to ready? phase_completion = when the linked phase completes (default for milestone draws, requires phase_id). project_start = when the project becomes active (use for deposits). manual = owner flips it themselves (last resort — needs daily-briefing reminders).'
                },
                phase_id: { type: 'string', description: 'UUID of the project phase this draw is tied to. REQUIRED when trigger_type = phase_completion.' }
              },
              required: ['description', 'trigger_type']
            }
          }
        },
        required: ['project_id', 'items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_draw_invoice',
      description: 'Convert ONE pending draw schedule item into a real invoice. Computes the gross amount (percent_of_contract × current contract, or fixed_amount), applies retainage hold-back, marks the draw as "invoiced", and links the new invoice. Call when the user says things like "send draw 2", "bill the foundation draw", or "the rough-in is done, generate the invoice". For listing what draws exist, use get_draw_schedule first.',
      parameters: {
        type: 'object',
        properties: {
          schedule_item_id: {
            type: 'string',
            description: 'UUID of the draw_schedule_items row to invoice.'
          },
          due_in_days: {
            type: 'number',
            description: 'Days until invoice due date. Defaults to 30. Use 14 for bank-funded jobs.'
          }
        },
        required: ['schedule_item_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_draw_schedule',
      description: 'Show a project\'s draw schedule with the status of each item, total drawn vs contract, retainage held, and linked invoices. Use for "where are we on draws for the Smith job", "show me the draw schedule", or as a precursor to generate_draw_invoice.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name, address, or UUID. Names are resolved automatically.'
          }
        },
        required: ['project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_ready_draws',
      description: 'List ALL draws across ALL projects that are ready to send (status = "ready" — i.e. their linked phase has completed or the project just went active). Use this as the first call when the owner asks "what do I need to bill?", "anything ready to invoice?", or as part of a morning briefing. Returns one row per ready draw with project name, description, computed amount, and the schedule_item_id you would pass to generate_draw_invoice.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_billing',
      description: 'Get the unified billing rollup for ONE project — every billable event (estimates, draws, change orders, invoices) normalized into a single feed with status/amount/zone (action/upcoming/history). Use when the owner asks "what\'s the billing situation on the Smith project?", "what do I need to bill on Henderson?", or "show me everything money-related on this project". Returns project totals (contract, drawn, collected, outstanding) plus categorized event lists with concrete CTAs (send_draw, nudge_invoice, resend_co).',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project UUID or name (resolved automatically).'
          }
        },
        required: ['project_id']
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
      description: "Change the BUDGET allocated to one phase of a project. Use when the owner says 'set the demo phase to $3000' / 'rough electrical should be $5k' / 'bump the cabinets budget to $12k'. This changes a financial allocation — for completion progress use `update_phase_progress`. For overall project budget use `update_project`.",
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
      description: 'List/find EXISTING estimates by client/project name or status. Returns name + status + total only. **DO NOT call before creating a NEW estimate** — emit an `estimate-preview` card directly. For full line-item detail on one specific estimate use `get_estimate_details`.',
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
      description: 'Fetch ONE specific estimate with all line items, client info, pricing breakdown, status, and any linked project. Use when the user names a specific estimate (number, client, or UUID). For lists/searches use `search_estimates`.',
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
      description: 'List/find EXISTING invoices by client name, invoice number, or status. Returns number + client + status + total only. Use for "show me unpaid invoices" / "Smith invoices" / "what\'s overdue". For one specific invoice\'s line items + payment history use `get_invoice_details`. **DO NOT call before creating a new invoice** — emit an `invoice-preview` card directly.',
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
      description: 'Fetch ONE specific invoice with line items, payment history, status, linked estimate/project. Use when the user names one invoice (by number "INV-001", client "Smith", or UUID). For broad listings ("show me all unpaid invoices", "invoices last month"), use `search_invoices` instead.',
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
      name: 'create_daily_report',
      description: 'Create a daily progress report for a project. Attach any images that were uploaded in the current chat message as report photos. Use when the user says things like "add this as a daily report", "log today\'s progress on X", "make a daily report for X", or sends photos with a project reference. NEVER refuse based on what the photo shows — the user owns their data.',
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project name or UUID. Names are resolved automatically.'
          },
          phase_id: {
            type: 'string',
            description: 'Optional UUID of the phase this report covers.'
          },
          phase_name: {
            type: 'string',
            description: 'Optional phase name (fuzzy-matched server-side). Use this when only the name is known.'
          },
          report_date: {
            type: 'string',
            description: 'Report date in YYYY-MM-DD. Defaults to today.'
          },
          notes: {
            type: 'string',
            description: 'Free-form notes / what was done today. The user\'s message text is a good default if no other notes provided.'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags (e.g. ["progress", "issue"]).'
          },
          attach_chat_images: {
            type: 'boolean',
            description: 'When true, every image attached in the current chat message is uploaded and added to this report. Default true.'
          },
          next_day_plan: {
            type: 'string',
            description: 'Optional plan for tomorrow.'
          }
        },
        required: ['project_id']
      }
    }
  },
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
      description: 'Manually clock a worker IN to a project on the owner\'s behalf — used when the worker forgot or the owner is recording time after the fact. Creates a `time_tracking` row at the given (or current) time. Owner-only authority; the worker themselves clocks in via the app, not via this tool. To clock OUT use `clock_out_worker`.',
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
      description: 'Close a worker\'s active clock-in session — finds the open `time_tracking` row and stamps the clock_out time. Use when the owner says "clock out Jose" / "Miguel forgot to clock out". If no active session exists, returns an error. Owner-only.',
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
      name: 'query_event_history',
      description: "Search the owner's event history (everything that's ever happened in their business — projects created, expenses recorded, scope changes, plan generations, agent decisions). Returns past events ranked by semantic similarity to the query. Use when the user asks things like 'when did we last...?', 'how often does X happen?', 'why did we...?', 'show me every scope change on Smith bath', 'how many callbacks has Carlos had?', 'what happened with the Davis project last week?'. The event log is the world model — query it whenever the answer depends on history rather than current state.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural-language description of what to look for. Will be embedded and matched against past event summaries.'
          },
          entity_type: {
            type: 'string',
            description: "Optional filter — restrict to events about one entity type ('project', 'expense', 'invoice', 'worker', 'supervisor', 'service_plan', 'phase', 'estimate', 'daily_report', 'document')."
          },
          entity_id: {
            type: 'string',
            description: 'Optional filter — restrict to events about one specific entity (UUID).'
          },
          event_category: {
            type: 'string',
            description: "Optional filter — restrict to a category ('project', 'financial', 'crew', 'scheduling', 'service_plan', 'documentation', 'communication', 'agent')."
          },
          since_days: {
            type: 'integer',
            description: 'Optional — only return events from the last N days. Omit for all-time.'
          },
          limit: {
            type: 'integer',
            description: 'Max events to return. Default 8, max 25.'
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
      description: "ESTIMATE LINE-ITEM PRICING ONLY. Returns historical average/high/low prices for specific services (e.g. 'install porcelain tile', 'rough plumbing for shower'). Call this AFTER you've decided to build an estimate and need to fill in per-item costs. DO NOT call this for project creation, project setup, or anything that produces a project-preview card — projects use a contract amount the user typed, not historical line-item averages. If the user says 'create a project for X' or is confirming details on a project (continuations like 'yeah the client name is Sarah, $55k, starts Monday'), DO NOT call this tool. If the user said 'create an ESTIMATE for X', this is the right tool to enrich the line items.",
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
      description: "Assign a WORKER (not a supervisor) to a project for the project's entire duration. Creates a project_assignments row. Use when user says 'put Jose on the kitchen project' or 'assign Carlos to the Smith job' AND the named person is a worker. If the user says 'assign [name] as supervisor' or the name matches a supervisor profile, use `assign_supervisor` instead. If a name matches both, this tool returns an `ambiguous` result with suggestions — show the options to the user and pick the right tool on the next call.",
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
      name: 'assign_supervisor',
      description: "Assign a SUPERVISOR to a project. Sets projects.assigned_supervisor_id, granting that supervisor full access to the project. Use when the user says 'make [name] the supervisor on X', 'assign [name] as supervisor', or names a person who is a supervisor profile (not a worker record). Owner-only — supervisors cannot call this. If the same name also exists as a worker, prefer this tool only when the user explicitly said 'supervisor'; otherwise ask the user to disambiguate.",
      parameters: {
        type: 'object',
        properties: {
          supervisor_id: {
            type: 'string',
            description: 'The supervisor name or profile UUID. Names like "Lana Moretti" are resolved against profiles where role=supervisor under the current owner.'
          },
          project_id: {
            type: 'string',
            description: 'The project name or UUID.'
          }
        },
        required: ['supervisor_id', 'project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unassign_worker',
      description: "Remove a WORKER from a project. Deletes the project_assignments row. Use when the user says 'take Jose off the kitchen project', 'unassign Carlos from the Smith job', 'remove [name] from [project]'. Idempotent — if the worker wasn't assigned, returns a friendly message instead of an error. For supervisors, use `unassign_supervisor` instead.",
      parameters: {
        type: 'object',
        properties: {
          worker_id: {
            type: 'string',
            description: 'The worker name or UUID. Names like "Jose" are resolved automatically.'
          },
          project_id: {
            type: 'string',
            description: 'The project name or UUID.'
          }
        },
        required: ['worker_id', 'project_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unassign_supervisor',
      description: "Remove the SUPERVISOR from a project. Clears projects.assigned_supervisor_id. Use when the user says 'remove the supervisor from X', 'unassign [name] as supervisor', 'take [name] off as supervisor of X'. Owner-only — supervisors cannot call this. Idempotent — if no supervisor was assigned, returns a friendly message instead of an error. Only one supervisor per project, so no supervisor_id is needed.",
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'The project name or UUID.'
          }
        },
        required: ['project_id']
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
      description: 'Assign an unmatched bank/card transaction to a project as an expense. Creates a new project_transaction and links it to the bank transaction. Use when owner says "put that Home Depot charge on the Smith project" or "assign the $432 transaction to the kitchen remodel". For expense assignments you MUST pass either phase_name (preferred) or phase_id. Newly-created phases (via create_project_phase) are immediately valid — no refresh needed.',
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
            description: 'Optional subcategory for detailed tracking (see record_expense for valid values). Only use when no phase fits.'
          },
          phase_id: {
            type: 'string',
            description: 'UUID of the project phase to attach this expense to. REQUIRED for expenses (unless subcategory is supplied). Use phase_name instead if you only have the phase name — the backend will resolve it.'
          },
          phase_name: {
            type: 'string',
            description: 'Name of the project phase to attach this expense to (e.g. "Demolition", "Garage remodel", "Drywall"). Alternative to phase_id — the backend fuzzy-matches it. If the user did NOT name a phase, OMIT this and the tool will return available_phases for you to ask the user. NEVER guess.'
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
      name: 'get_profit_loss',
      description: 'Generate a Profit & Loss report for a date range. Returns revenue, costs by category (labor/materials/subcontractor/equipment/permits/misc), gross profit, gross margin, prorated overhead, net profit, outstanding receivables, and per-project breakdown. Use when the user asks for a "P&L", "profit and loss", "financial report", "what we netted", or "show me the numbers" for a project or for the whole company. The response includes a `visualElement` of type pnl-report — render it so the user can review and download a PDF directly from chat.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start of the reporting window (YYYY-MM-DD). Required. Parse natural language: "Q1" → 2026-01-01, "last month" → first day of previous month, "April 1" → 2026-04-01.'
          },
          end_date: {
            type: 'string',
            description: 'End of the reporting window (YYYY-MM-DD). Required. "today" → today; "Q1" → 2026-03-31; "last month" → last day of previous month.'
          },
          project_id: {
            type: 'string',
            description: 'Optional project name or UUID. If supplied, the report is scoped to that single project. Omit for company-wide P&L.'
          },
          include_projects: {
            type: 'boolean',
            description: 'If true, include the per-project breakdown array even when company-wide. Default behavior: company-wide always includes the breakdown; project-scoped does not.'
          }
        },
        required: ['start_date', 'end_date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_worker_metrics',
      description: 'Pre-computed rolling 30-day metrics per worker: hours worked, days clocked, daily reports submitted, reports-per-day ratio, last clock-in, last report. Use this when the user asks "which worker is most efficient", "who has been working the most", "who hasn\'t submitted reports", or anything comparing workers. Much faster than fetching raw time_tracking + daily_reports and computing yourself.',
      parameters: {
        type: 'object',
        properties: {
          worker_id: { type: 'string', description: 'Optional. Filter to one worker\'s metrics.' },
          limit: { type: 'integer', description: 'Max rows to return (default 25, max 100).' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_health',
      description: 'Pre-computed health snapshot per project: total expenses, total income, budget burn %, days since last activity, contract amount. Use when user asks "which projects are over budget", "projects sitting idle", "where are we burning money", or anything ranking/comparing projects. Faster than computing from project_transactions.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Optional. Filter to one project.' },
          status: { type: 'string', description: 'Optional project status filter (e.g. "active").' },
          limit: { type: 'integer', description: 'Max rows (default 25, max 100).' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_client_health',
      description: 'Pre-computed receivables and payment behavior per client: total billed, total paid, outstanding, overdue invoice count, oldest overdue days, average days late to pay. Use when user asks "which clients owe me money", "who pays late", "biggest receivables", or anything about client payment behavior.',
      parameters: {
        type: 'object',
        properties: {
          client_name: { type: 'string', description: 'Optional. Fuzzy-match a client name.' },
          limit: { type: 'integer', description: 'Max rows (default 25, max 100).' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_business_briefing',
      description: 'Anomaly briefing — returns the top issues across the business right now: forgotten clock-outs (>12h), workers who haven\'t submitted reports recently, projects past 80% budget burn, stale projects with no activity 7+ days, clients with invoices 14+ days overdue. Use this proactively at the start of a conversation when the user says "what\'s up", "what should I look at", "anything I need to know", or when you want to surface what needs attention. Items are sorted high → medium severity.',
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
      description: 'Add ONE EXTRA visit to an EXISTING service plan and location, outside the normal recurring schedule. Use when the user says "add a visit for Smith next Tuesday" or "schedule an extra spray for Anderson this Friday." Requires the service plan to already exist. **DO NOT use this to create a NEW service plan** — for that, emit a `service-plan-preview` visualElement directly (no tool call needed) so the user can confirm and the frontend creates plan + locations + recurring schedule together.',
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
      description: 'Modify fields on an EXISTING service plan (name, status, billing_cycle, price_per_visit, monthly_rate, service_type, notes). Only include fields you want to change. **DO NOT use to create a new plan** — emit a `service-plan-preview` visualElement for that.',
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
      description: 'Add a new recurring stop to an EXISTING service plan. Use when the user says "add the Joneses to my weekly cleaning route" or "include 12 Oak St in the Anderson lawn plan" — the plan already exists, the user is expanding its coverage. **DO NOT use this to create a NEW service plan** — emit a `service-plan-preview` visualElement instead.',
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
      description: 'IRREVERSIBLE. Permanently delete a service plan and cascade-delete its locations + visits + history. Owner-only (supervisors are blocked). **You MUST get explicit confirmation in the SAME TURN before calling.** If the user says "delete the Smith cleaning plan" without prior confirmation, do NOT fire — first show "Delete plan X with N locations and M visits? This cannot be undone." Wait for explicit yes.',
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
      description: 'Set up the RECURRING daily checklist items and labor roles for a project or service plan. These are items the crew checks off EVERY workday for the life of the project — head counts, PPE checks, daily progress quantities (linear ft / sqft / bundles installed today), site photos, end-of-day cleanup, materials staged for tomorrow. NEVER include phase-completion milestones here (e.g. "Pressure test passed", "Rough-in complete", "Cabinets installed") — those belong in phase tasks, not daily checks.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'UUID of the project (provide this OR service_plan_id, not both)' },
          service_plan_id: { type: 'string', description: 'UUID of the service plan (provide this OR project_id, not both)' },
          checklist_items: {
            type: 'array',
            description: 'Array of RECURRING daily checklist items the crew fills out EVERY workday. Forbidden: phase milestones, one-time deliverables, or anything that only happens once per project.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Item name. GOOD: "Crew head count", "PPE check completed", "Site photo — end of day", "Linear feet of pipe installed today", "Work area cleaned & tools secured". BAD (do not use): "All plumbing pressure tested" (milestone), "Rough-in complete" (milestone), "Cabinets installed" (one-time deliverable).' },
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
  },

  // SMS tools (list_unread_sms / read_sms_thread / send_sms) are
  // intentionally omitted — SMS messaging is disabled at the product
  // level for now. Re-enable by restoring the three function entries
  // here, the registry rows, the systemPrompt guidance, and the
  // matching exports in handlers.js.

  // SUB-AGENT DISPATCH (P5) — `dispatch_subagent` is injected at
  // runtime in agentService.js (same pattern as `memory`) rather than
  // statically listed here. Reason: it's an orchestration tool that
  // doesn't have a handler in the TOOL_HANDLERS map, and the
  // tools.test.js coverage assertion expects 1:1 def↔handler parity.
  // The runtime injection is in agentService's toolsWithMemory builder.

  // ==================== AUDIT LOG ====================
  {
    type: 'function',
    function: {
      name: 'get_entity_history',
      description: 'Show every change to one specific entity (project, estimate, invoice, customer, worker, etc.). Use when the user asks "what happened to the Smith estimate?", "show the history of project X", "when did this invoice change?". Returns a chronological list of audit entries with actor, action, before/after diff, and timestamp.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            description: 'Canonical entity name: project, estimate, invoice, change_order, customer, worker, transaction, time_entry, service_plan, visit, phase, document.'
          },
          entity_id: {
            type: 'string',
            description: 'UUID of the entity. If the user said a name, resolve it via search_projects/search_estimates first.'
          },
          limit: { type: 'integer', description: 'Max entries to return (default 50, max 200).' }
        },
        required: ['entity_type', 'entity_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'who_changed',
      description: 'Answer "who edited the Smith estimate?" or "who deleted that invoice?". Returns the most recent actors who modified a specific entity, in reverse-chronological order. Use this for accountability/blame queries before falling back to get_entity_history.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            description: 'Canonical entity name (project, estimate, invoice, etc.)'
          },
          entity_id: {
            type: 'string',
            description: 'UUID of the entity'
          },
          limit: { type: 'integer', description: 'How many recent actors to surface (default 5).' }
        },
        required: ['entity_type', 'entity_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recent_activity',
      description: 'Show the most recent write operations across the whole company. Use when the user asks "what changed today?", "show recent activity", "what did Joe do this week?". Optional filters narrow by user, entity type, action, or date range.',
      parameters: {
        type: 'object',
        properties: {
          actor_user_id: {
            type: 'string',
            description: 'Filter to one user (e.g. "what did Joe do?"). Omit for all users.'
          },
          entity_type: {
            type: 'string',
            description: 'Filter to one entity kind (e.g. "estimates only").'
          },
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete', 'bulk_create', 'bulk_update', 'bulk_delete', 'restore', 'archive', 'void'],
            description: 'Filter to one action verb.'
          },
          start_date: { type: 'string', description: 'ISO 8601 date — only return entries after this.' },
          end_date: { type: 'string', description: 'ISO 8601 date — only return entries before this.' },
          limit: { type: 'integer', description: 'Max entries to return (default 50, max 200).' }
        }
      }
    }
  },

  // ==================== E-SIGNATURE ====================
  {
    type: 'function',
    function: {
      name: 'request_signature',
      description: 'Send a customer signature request for an estimate, invoice, or contract. Generates a single-use signing link, emails it to the signer, and returns the link so the user can also share it via SMS/WhatsApp from their phone. Use phrases like "send the Smith estimate for signature", "get the Johnson invoice signed", "have the customer sign the contract".',
      parameters: {
        type: 'object',
        required: ['document_type', 'document_id', 'signer_email'],
        properties: {
          document_type: {
            type: 'string',
            enum: ['estimate', 'invoice', 'contract'],
            description: 'Which type of document is being signed.'
          },
          document_id: {
            type: 'string',
            description: 'UUID of the estimate, invoice, or contract document.'
          },
          signer_name: {
            type: 'string',
            description: 'Name of the person who will sign (e.g. customer or client).'
          },
          signer_email: {
            type: 'string',
            description: 'Email address to send the signing link to. Required.'
          },
          signer_phone: {
            type: 'string',
            description: 'Optional phone for the user to text the link from their device.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_signature_status',
      description: 'Check the latest signature status (pending / signed / declined / expired) for an estimate, invoice, or contract. Returns the signed PDF URL if signed.',
      parameters: {
        type: 'object',
        required: ['document_type', 'document_id'],
        properties: {
          document_type: {
            type: 'string',
            enum: ['estimate', 'invoice', 'contract']
          },
          document_id: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_signature_request',
      description: 'Cancel a pending signature request. Invalidates the signing link so the customer can no longer sign.',
      parameters: {
        type: 'object',
        required: ['signature_id'],
        properties: {
          signature_id: { type: 'string', description: 'UUID of the signature request to cancel.' }
        }
      }
    }
  },

  // ==================== ONBOARDING IMPORTS ====================
  // High-level orchestrators that combine MCP reads (QBO/Monday) with our
  // Supabase upserts. ALL accept dry_run:true to preview without writing.
  {
    type: 'function',
    function: {
      name: 'qbo_onboarding_summary',
      description: 'STARTING POINT for any QuickBooks import. Fetches counts (customers, vendors, employees, items, classes, projects), 1099-vendor count, last 12 months revenue, and a small sample of each entity. Use this BEFORE any import_qbo_* call so you can present the user with "I see X customers, Y vendors, $Z in revenue — want to import?". Returns company name and verifies connection works.',
      parameters: { type: 'object', properties: {} },
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_qbo_clients',
      description: 'Import QuickBooks Customers into our clients table. Idempotent — re-runs match by qbo_id then email then name+phone, never creates duplicates. Sub-customers are skipped (use import_qbo_projects with mapping=sub_customers if the user organizes jobs that way). Always preview with dry_run:true first.',
      parameters: {
        type: 'object',
        properties: {
          dry_run: { type: 'boolean', description: 'If true, return counts without writing.' },
          include_inactive: { type: 'boolean', description: 'Include archived customers. Default false.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_qbo_subcontractors',
      description: 'Import QuickBooks Vendors marked 1099 into our workers table with is_subcontractor=true. Use only_1099:false to import ALL vendors (suppliers + subs).',
      parameters: {
        type: 'object',
        properties: {
          dry_run: { type: 'boolean', description: 'Preview without writing.' },
          only_1099: { type: 'boolean', description: 'Filter to 1099 vendors only. Default true (recommended).' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_qbo_employees',
      description: 'Import QuickBooks Employees (W-2) into our workers table with is_subcontractor=false.',
      parameters: { type: 'object', properties: { dry_run: { type: 'boolean' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_qbo_service_catalog',
      description: 'Import QuickBooks Items (services + products with prices) into user_services. Catches the contractor up so estimate line items match what their CPA already sees.',
      parameters: {
        type: 'object',
        properties: {
          dry_run: { type: 'boolean' },
          type: { type: 'string', enum: ['Service', 'Inventory', 'NonInventory'], description: 'Filter to one item type. Default Service.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_qbo_projects',
      description: 'Import QuickBooks projects/jobs into our projects table. Three mappings: "projects" (QB native Projects entity), "classes" (Classes used as project codes), or "sub_customers" (sub-customers under a parent). Ask the user which one applies before calling — different contractors organize differently.',
      parameters: {
        type: 'object',
        properties: {
          dry_run: { type: 'boolean' },
          mapping: { type: 'string', enum: ['projects', 'classes', 'sub_customers'], description: 'Which QB structure to import from.' }
        },
        required: ['mapping']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_qbo_invoice_history',
      description: 'Import historical QuickBooks invoices into our invoices table. Populates AR aging on day one. Default last 12 months.',
      parameters: {
        type: 'object',
        properties: {
          dry_run: { type: 'boolean' },
          months_back: { type: 'integer', description: 'How far back. Default 12, max 60.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'preview_monday_board',
      description: 'Preview a Monday board: schema (column titles + types), sample items, and a suggested column→field mapping (name/client/budget/address/dates). Call before import_monday_projects so the user can confirm or correct the mapping.',
      parameters: {
        type: 'object',
        properties: { board_id: { type: 'string', description: 'Monday board id, from monday__list_boards.' } },
        required: ['board_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_monday_projects',
      description: 'Import items from a Monday board as projects. Caller supplies a mapping that ties Monday column ids to our project fields. Idempotent — items are matched by monday_id.',
      parameters: {
        type: 'object',
        properties: {
          board_id: { type: 'string' },
          mapping: {
            type: 'object',
            description: 'Map of project field → Monday column_id. Keys: name, client, budget, address, start_date, end_date.',
            properties: {
              name: { type: 'string' }, client: { type: 'string' }, budget: { type: 'string' },
              address: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' }
            }
          },
          dry_run: { type: 'boolean' }
        },
        required: ['board_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'csv_preview',
      description: 'Parse pasted CSV/Excel-export text and return headers + a sample + a suggested column mapping. Use when the user has data in a spreadsheet rather than QB or Monday. Targets: clients, workers, projects.',
      parameters: {
        type: 'object',
        properties: {
          csv_text: { type: 'string', description: 'Raw CSV. First row must be headers.' },
          target: { type: 'string', enum: ['clients', 'workers', 'projects'] }
        },
        required: ['csv_text', 'target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'csv_import',
      description: 'Import a CSV after the user has confirmed the column mapping (from csv_preview). Always run with dry_run:true first to show the count.',
      parameters: {
        type: 'object',
        properties: {
          csv_text: { type: 'string' },
          target: { type: 'string', enum: ['clients', 'workers', 'projects'] },
          mapping: { type: 'object', description: 'Map of our_field → csv_header_name.' },
          dry_run: { type: 'boolean' }
        },
        required: ['csv_text', 'target', 'mapping']
      }
    }
  },

  // ==================== PUSH TO QUICKBOOKS ====================
  // These keep QB's view in sync as the contractor operates in our app.
  // No-ops when QB isn't connected. Each one is idempotent — sets the
  // local row's qbo_id on success, returns { already_mirrored: true } on
  // re-runs.
  {
    type: 'function',
    function: {
      name: 'mirror_client_to_qbo',
      description: 'Push a local client record into QuickBooks as a Customer. Use after the user creates a new client in our app, or as part of mirror_invoice_to_qbo (which auto-mirrors the client first if needed). No-op when QB not connected.',
      parameters: {
        type: 'object',
        properties: { client_id: { type: 'string', description: 'UUID of the local client.' } },
        required: ['client_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mirror_invoice_to_qbo',
      description: 'Push a local invoice into QuickBooks. The CRITICAL step that keeps the CPA\'s view of revenue accurate. Auto-mirrors the client first if they\'re not in QB yet. Use after generate_draw_invoice or any other invoice creation when the user has QB connected.',
      parameters: {
        type: 'object',
        properties: { invoice_id: { type: 'string', description: 'UUID of the local invoice.' } },
        required: ['invoice_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mirror_expense_to_qbo',
      description: 'Push a local expense (project_transactions row, type=expense) into QuickBooks as a Bill. Requires the linked vendor to be in QB and an expense account_qbo_id. Use sparingly — most contractors prefer entering expenses directly in QB.',
      parameters: {
        type: 'object',
        properties: {
          transaction_id: { type: 'string', description: 'UUID of the local transaction.' },
          account_qbo_id: { type: 'string', description: 'QBO Account.Id of an Expense-type account. Get from qbo__list_accounts.' }
        },
        required: ['transaction_id', 'account_qbo_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mirror_estimate_to_qbo',
      description: 'Push a local estimate into QuickBooks. Auto-mirrors the client first if needed. Useful when the user wants formal QB-numbered quotes.',
      parameters: {
        type: 'object',
        properties: { estimate_id: { type: 'string', description: 'UUID of the local estimate.' } },
        required: ['estimate_id']
      }
    }
  },
  // ==================== CHANGE ORDERS ====================
  // Mid-project work additions priced separately from the original contract.
  // Workflow: create draft → review → send to client → client approves
  // (or you mark applied) → contract_amount adjusts via the project's
  // extras flow. Status lifecycle:
  //   draft → pending_client → approved/rejected → applied
  // (or draft → voided directly).
  {
    type: 'function',
    function: {
      name: 'create_change_order',
      description: 'Create a draft change order on a project. CO_number auto-increments per project. Use for mid-project additions, scope expansions, client requests beyond the original contract. Always created as draft — call send_change_order separately to send it to the client.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project name, address, or UUID. Resolved automatically.' },
          title: { type: 'string', description: 'Short title — e.g. "Extra island cabinets" or "Kitchen rough-in upgrade".' },
          description: { type: 'string', description: 'Optional details about the scope change.' },
          line_items: {
            type: 'array',
            description: 'At least one line item.',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number', description: 'Defaults to 1.' },
                unit: { type: 'string', description: 'Optional ("each", "lf", "sqft", "hr").' },
                unit_price: { type: 'number' },
                category: { type: 'string', description: 'Optional ("labor", "materials", "subcontractor", etc.)' },
              },
              required: ['description', 'unit_price'],
            },
          },
          schedule_impact_days: { type: 'number', description: 'Days the project end_date pushes by. Default 0.' },
          tax_rate: { type: 'number', description: 'Decimal (0.08 for 8%). Default 0.' },
          signature_required: { type: 'boolean', description: 'If true, send_change_order also fires an e-signature request. Default false.' },
          billing_strategy: { type: 'string', enum: ['invoice_now', 'add_to_contract', 'final_invoice'], description: 'invoice_now: separate invoice on approval. add_to_contract: rolls into contract_amount. final_invoice: lumped into the final invoice. Default invoice_now.' },
        },
        required: ['project_id', 'title', 'line_items'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_change_orders',
      description: 'List change orders. Filter by project_id, status (draft / pending_client / approved / rejected / voided / applied), or both. Returns CO number, title, status, total. Use for "show me change orders on the Smith job" or "anything pending client approval?".',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Optional. Project name or UUID.' },
          status: { type: 'string', enum: ['draft', 'pending_client', 'approved', 'rejected', 'voided', 'applied'] },
          limit: { type: 'integer', description: 'Default 25, max 100.' },
        },
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_change_order',
      description: 'Fetch ONE change order with line items, status, schedule impact, applied delta. Use when the user references a specific CO ("CO-002", "the cabinets change order", or by UUID).',
      parameters: {
        type: 'object',
        properties: {
          change_order_id: { type: 'string', description: 'UUID, "CO-002" / "2", or a title fragment.' },
        },
        required: ['change_order_id'],
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_change_order',
      description: 'Edit a DRAFT change order before sending. Locked once status is anything other than draft (you must recall first via the project detail UI). Pass any subset of fields to update; line_items replace the existing list wholesale when included.',
      parameters: {
        type: 'object',
        properties: {
          change_order_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          line_items: { type: 'array', items: { type: 'object' } },
          schedule_impact_days: { type: 'number' },
          tax_rate: { type: 'number' },
          signature_required: { type: 'boolean' },
          billing_strategy: { type: 'string', enum: ['invoice_now', 'add_to_contract', 'final_invoice'] },
        },
        required: ['change_order_id'],
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_change_order',
      description: 'Send a draft change order to the client by email. Flips status draft → pending_client. Resolves client email from the project (or its linked client). If signature_required is true on the CO, also fires an e-signature request. **You MUST get explicit confirmation in the SAME TURN before calling.** If user says "send CO 2" without prior confirmation, first show "Send CO-002 ($X) to client@... ? Once sent it locks until client responds." Wait for explicit yes before firing.',
      parameters: {
        type: 'object',
        properties: {
          change_order_id: { type: 'string' },
        },
        required: ['change_order_id'],
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'list_import_conflicts',
      description: 'List pending import conflicts — likely-duplicate matches that the importer flagged for user confirmation (e.g. QB has "John Smith" but you already have "John Smith" with no email — same person?). Use to surface them in chat so the user can resolve. Returns at most 100 pending conflicts.',
      parameters: {
        type: 'object',
        properties: {
          source_platform: { type: 'string', enum: ['qbo', 'monday', 'csv', 'manual'], description: 'Optional filter.' },
          target_table: { type: 'string', enum: ['clients', 'workers', 'projects'], description: 'Optional filter.' },
        },
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'resolve_import_conflict',
      description: 'Resolve one import conflict. resolution=merge links the external record to the existing local row (sets qbo_id, fills blanks). resolution=keep_separate creates a brand-new local row from the external data. resolution=skip marks it resolved with no action.',
      parameters: {
        type: 'object',
        properties: {
          conflict_id: { type: 'string', description: 'UUID of the import_conflicts row.' },
          resolution: { type: 'string', enum: ['merge', 'keep_separate', 'skip'] },
          note: { type: 'string', description: 'Optional human-readable reason for the resolution.' },
        },
        required: ['conflict_id', 'resolution']
      }
    }
  },

  // ───── Subcontractors (Phase J) ─────
  {
    type: 'function',
    function: {
      name: 'list_subs',
      description: 'List subcontractors the user has worked with or invited. Use to answer "what subs do I have", "show me my subs", etc.',
      parameters: { type: 'object', properties: { limit: { type: 'integer', description: 'Max rows (default 25)' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sub',
      description: 'Get full profile for a specific subcontractor by ID.',
      parameters: { type: 'object', required: ['sub_organization_id'], properties: { sub_organization_id: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sub_compliance',
      description: "Get a sub's current compliance documents (COI, W9, license, etc.) with expiry status.",
      parameters: { type: 'object', required: ['sub_organization_id'], properties: { sub_organization_id: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_engagements',
      description: 'List subcontractor engagements (sub × project work units). Filter by project_id or status.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          status: { type: 'string', enum: ['invited','bidding','awarded','contracted','mobilized','in_progress','substantially_complete','closed_out','cancelled'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_engagement',
      description: 'Get a specific engagement with computed compliance status (passes/blockers/warnings).',
      parameters: { type: 'object', required: ['engagement_id'], properties: { engagement_id: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_expiring_compliance',
      description: 'List compliance documents (COI/license/W9) expiring within N days across all subs the GC works with. Use for daily briefings.',
      parameters: { type: 'object', properties: { within_days: { type: 'integer', description: 'Default 30' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_open_bids',
      description: 'List open bid requests (the GC sent out, not yet awarded).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_recent_invoices',
      description: 'List recent invoices submitted by subcontractors against the GC’s engagements.',
      parameters: { type: 'object', properties: { limit: { type: 'integer', description: 'Default 25' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_sub_to_project',
      description: 'Create a sub_engagement linking an existing sub to a project. The sub must already exist (use list_subs to find).',
      parameters: {
        type: 'object',
        required: ['sub_organization_id', 'project_id', 'trade'],
        properties: {
          sub_organization_id: { type: 'string' },
          project_id: { type: 'string' },
          trade: { type: 'string', description: 'e.g., plumbing, electrical, HVAC' },
          scope_summary: { type: 'string' },
          contract_amount: { type: 'number' },
          payment_terms: { type: 'string', enum: ['fifty_fifty','milestones','net_30','custom'], description: 'Default net_30' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'record_compliance_doc',
      description: 'Manually record a compliance doc for a sub (when GC has the file in hand and types in metadata).',
      parameters: {
        type: 'object',
        required: ['sub_organization_id','doc_type'],
        properties: {
          sub_organization_id: { type: 'string' },
          doc_type: { type: 'string', description: "e.g., 'coi_gl', 'w9', 'license_state'" },
          doc_subtype: { type: 'string' },
          file_url: { type: 'string' },
          issuer: { type: 'string' },
          policy_number: { type: 'string' },
          expires_at: { type: 'string', description: 'YYYY-MM-DD' },
          coverage_limits: { type: 'object' },
          endorsements: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'record_payment',
      description: 'Record a manual payment from GC to sub against an engagement. Notifies the sub.',
      parameters: {
        type: 'object',
        required: ['engagement_id','amount','paid_at','method'],
        properties: {
          engagement_id: { type: 'string' },
          amount: { type: 'number' },
          paid_at: { type: 'string', description: 'YYYY-MM-DD' },
          method: { type: 'string', enum: ['check','ach','zelle','venmo','wire','cash','other'] },
          reference: { type: 'string', description: 'Check #, ACH ID, etc.' },
          sub_invoice_id: { type: 'string' },
          notes: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_compliance_doc_from_sub',
      description: 'EXTERNAL_WRITE — emails sub a magic link to upload a specific compliance doc. Requires user approval.',
      parameters: {
        type: 'object',
        required: ['sub_organization_id','doc_type'],
        properties: {
          sub_organization_id: { type: 'string' },
          doc_type: { type: 'string', description: "e.g., 'coi_gl' for general liability COI" }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_msa_signature',
      description: 'EXTERNAL_WRITE — generates an MSA subcontract for an engagement and emails sub for signature. Requires user approval.',
      parameters: {
        type: 'object',
        required: ['engagement_id'],
        properties: {
          engagement_id: { type: 'string' },
          title: { type: 'string', description: 'Default: Master Subcontract Agreement' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_bid_invitation',
      description: 'EXTERNAL_WRITE — creates a bid request and invites multiple subs to bid. Requires user approval.',
      parameters: {
        type: 'object',
        required: ['project_id','trade','scope_summary','sub_organization_ids'],
        properties: {
          project_id: { type: 'string' },
          trade: { type: 'string' },
          scope_summary: { type: 'string' },
          sub_organization_ids: { type: 'array', items: { type: 'string' } },
          due_at: { type: 'string' },
          payment_terms: { type: 'string', enum: ['fifty_fifty','milestones','net_30','custom'] }
        }
      }
    }
  }
];

/**
 * Status messages shown to user during tool execution
 */
const TOOL_STATUS_MESSAGES = {
  // Subcontractor module
  list_subs: 'Listing your subcontractors...',
  get_sub: 'Loading subcontractor profile...',
  get_sub_compliance: 'Checking compliance docs...',
  list_engagements: 'Listing engagements...',
  get_engagement: 'Loading engagement details...',
  list_expiring_compliance: 'Scanning expiring compliance docs...',
  list_open_bids: 'Listing open bids...',
  list_recent_invoices: 'Loading recent invoices...',
  add_sub_to_project: 'Adding sub to project...',
  record_compliance_doc: 'Recording compliance doc...',
  record_payment: 'Recording payment...',
  request_compliance_doc_from_sub: 'Sending document request...',
  request_msa_signature: 'Sending MSA for signature...',
  send_bid_invitation: 'Sending bid invitations...',
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
  assign_supervisor: 'Assigning supervisor to project...',
  unassign_worker: 'Removing worker from project...',
  unassign_supervisor: 'Removing supervisor from project...',
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
  create_draw_schedule: 'Setting up draw schedule...',
  generate_draw_invoice: 'Generating draw invoice...',
  get_draw_schedule: 'Loading draw schedule...',
  get_ready_draws: 'Checking for draws ready to send...',
  // Onboarding imports
  qbo_onboarding_summary: 'Scanning your QuickBooks account...',
  import_qbo_clients: 'Importing customers from QuickBooks...',
  import_qbo_subcontractors: 'Importing subcontractors from QuickBooks...',
  import_qbo_employees: 'Importing employees from QuickBooks...',
  import_qbo_service_catalog: 'Importing your service catalog...',
  import_qbo_projects: 'Importing projects from QuickBooks...',
  import_qbo_invoice_history: 'Pulling invoice history...',
  preview_monday_board: 'Previewing Monday board...',
  import_monday_projects: 'Importing projects from Monday...',
  csv_preview: 'Previewing your spreadsheet...',
  csv_import: 'Importing your spreadsheet...',
  mirror_client_to_qbo: 'Pushing client to QuickBooks...',
  mirror_invoice_to_qbo: 'Pushing invoice to QuickBooks...',
  mirror_expense_to_qbo: 'Pushing expense to QuickBooks...',
  mirror_estimate_to_qbo: 'Pushing estimate to QuickBooks...',
  list_import_conflicts: 'Checking import conflicts...',
  resolve_import_conflict: 'Applying resolution...',
  create_change_order: 'Drafting change order...',
  list_change_orders: 'Loading change orders...',
  get_change_order: 'Loading change order...',
  update_change_order: 'Updating change order...',
  send_change_order: 'Sending change order to client...',
  get_project_billing: 'Loading billing summary for the project...',
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
  get_profit_loss: 'Building your P&L report...',
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
  // SMS tools — disabled at the product level for now.
  // list_unread_sms: 'Checking the inbox...',
  // read_sms_thread: 'Loading the thread...',
  // send_sms: 'Sending text...',
  // Sub-agent dispatch (P5) — status message used by the runtime-
  // injected dispatch_subagent tool in agentService.
  dispatch_subagent: 'Delegating to specialist...',
  // Audit log tools
  get_entity_history: 'Pulling change history...',
  who_changed: 'Checking who made changes...',
  recent_activity: 'Looking at recent activity...',
  // E-signature tools
  request_signature: 'Sending signature request...',
  check_signature_status: 'Checking signature status...',
  cancel_signature_request: 'Cancelling signature request...',
};

function getToolStatusMessage(toolName) {
  return TOOL_STATUS_MESSAGES[toolName] || 'Working on it...';
}

module.exports = { toolDefinitions, getToolStatusMessage, TOOL_STATUS_MESSAGES };
