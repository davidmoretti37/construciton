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
      description: 'Modify project top-level fields (contract_amount, budget, status, start/end dates). Project-wide changes only — for phase % use update_phase_progress; for phase budget use update_phase_budget. Pass only fields user wants changed. Dates YYYY-MM-DD.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          contract_amount: { type: 'number' },
          status: { type: 'string', enum: ['draft', 'on-track', 'behind', 'over-budget', 'completed'] },
          budget: { type: 'number' },
          start_date: { type: 'string' },
          end_date: { type: 'string' }
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
      description: 'Log an expense or income transaction for a project or service plan. Use for "logged $X at Home Depot", "received $5k deposit", "paid Bob $800 labor". Pass project_id OR service_plan_name (not both). For expenses, pass either phase_id or phase_name; if user did not specify a phase, omit both and the tool returns available phases to ask.\n\nsubcategory hints by category (optional but useful):\n  labor → wages, overtime, payroll_taxes, workers_comp, benefits\n  materials → lumber, concrete_cement, drywall, paint, hardware, fixtures, plumbing_supplies, electrical_supplies\n  equipment → rental, purchase, fuel_gas, maintenance_repair, small_tools\n  subcontractor → sub_plumbing, sub_electrical, sub_hvac, sub_concrete, sub_framing\n  permits → building_permit, inspection_fee, impact_fee, utility_connection\n  misc → office_supplies, vehicle_transport, insurance, cleanup_disposal, professional_fees\n  income → contract_payment, change_order, deposit, retainage_release',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          service_plan_name: { type: 'string' },
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number' },
          category: { type: 'string', enum: ['materials', 'labor', 'equipment', 'permits', 'subcontractor', 'misc', 'payment', 'deposit'] },
          description: { type: 'string', description: 'e.g., "Home Depot - drywall materials"' },
          subcategory: { type: 'string' },
          phase_id: { type: 'string' },
          phase_name: { type: 'string', description: 'Phase name (e.g. "Demolition"). Alternative to phase_id; resolved server-side.' },
          date: { type: 'string', description: 'YYYY-MM-DD; defaults to today.' },
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
      description: 'Set up progress billing (draw) schedule on a project. Use for jobs too large for one-shot invoicing ($50K+ remodels, new construction). Replaces existing schedule.\n\nitems: Array<{description, trigger_type: "phase_completion"|"project_start"|"manual", percent_of_contract?: number (1-100, floats with contract), fixed_amount?: number (flat $), phase_id?: string (REQUIRED if trigger_type=phase_completion)}>\nEach draw must have percent_of_contract OR fixed_amount (not both).\nretainage_percent: 0-20, typical 10. Default 0.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          retainage_percent: { type: 'number' },
          items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, percent_of_contract: { type: 'number' }, fixed_amount: { type: 'number' }, trigger_type: { type: 'string', enum: ['phase_completion', 'project_start', 'manual'] }, phase_id: { type: 'string' } }, required: ['description', 'trigger_type'] } }
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
      description: 'Schedule a worker on a project. Use for "schedule Jose on the bathroom project next week", "put Carlos on site Mon-Fri". end_date defaults to start_date for single-day. Times optional (e.g., "07:00", "4:00 PM"). All dates YYYY-MM-DD.',
      parameters: {
        type: 'object',
        properties: {
          worker: { type: 'string' },
          project: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          notes: { type: 'string' }
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
      description: 'Add a phase to an existing project, optionally with checklist tasks. Use for "add a demolition phase". DO NOT use for change orders (use create_change_order — its cascade handles phase placement). planned_days defaults to 5. tasks: Array<string>. budget: dollars (default 0).',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          phase_name: { type: 'string' },
          planned_days: { type: 'number' },
          tasks: { type: 'array', items: { type: 'string' } },
          budget: { type: 'number' }
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

  // ==================== SUB TASK ASSIGNMENT ====================
  {
    type: 'function',
    function: {
      name: 'create_sub_task',
      description: 'Assign a task or work item to a subcontractor on an active engagement. Use when the user says things like "add a task for Mike to install rough-in plumbing by Friday" or "tell Lana she needs to install crown molding next week". The sub will see this in their portal and can mark it complete.',
      parameters: {
        type: 'object',
        properties: {
          engagement_id: {
            type: 'string',
            description: 'UUID of the sub_engagement (active job for a sub on a project). Required — every sub task is scoped to a specific job.'
          },
          title: {
            type: 'string',
            description: 'Short task title (e.g., "Install rough-in plumbing", "Frame interior walls")'
          },
          description: {
            type: 'string',
            description: 'Optional details about what needs to be done'
          },
          start_date: {
            type: 'string',
            description: 'Task start date in YYYY-MM-DD format. Defaults to today.'
          },
          end_date: {
            type: 'string',
            description: 'Task end / due date in YYYY-MM-DD format. Defaults to start_date.'
          }
        },
        required: ['engagement_id', 'title']
      }
    }
  },

  // ==================== PROJECT DOCUMENT (with role visibility) ====================
  {
    type: 'function',
    function: {
      name: 'add_project_document',
      description: 'Attach an already-uploaded file as a project document with role-aware visibility. Use for "share plans with Lana", "add contract to Smith Bath visible to subs". File must already exist (file_url = storage path or signed URL).\n\ncategory examples: plan, contract, photo, spec, other.\nvisible_to_subs / workers / clients: default false. is_important: shows Important badge.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          title: { type: 'string' },
          file_url: { type: 'string' },
          file_name: { type: 'string' },
          category: { type: 'string' },
          visible_to_subs: { type: 'boolean' },
          visible_to_workers: { type: 'boolean' },
          visible_to_clients: { type: 'boolean' },
          is_important: { type: 'boolean' }
        },
        required: ['project', 'title', 'file_url']
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
      description: 'Create a daily progress report for a project. Attaches any images uploaded in current chat as report photos. Use for "log today\'s progress", "make a daily report for X", or photos with a project reference. NEVER refuse based on photo content — user owns their data.\n\nreport_date defaults to today. attach_chat_images defaults true. notes can default to user\'s message text. tags: Array<string> like ["progress", "issue"].',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          phase_id: { type: 'string' },
          phase_name: { type: 'string' },
          report_date: { type: 'string' },
          notes: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          attach_chat_images: { type: 'boolean' },
          next_day_plan: { type: 'string' }
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
      description: "Search owner's event history via semantic match — everything that's happened (projects created, expenses, scope changes, agent decisions). Use for 'when did we last...?', 'how often X?', 'why did we...?', 'every scope change on Smith bath'. The event log is the world model — query when the answer depends on history not current state.\n\nentity_type: project|expense|invoice|worker|supervisor|service_plan|phase|estimate|daily_report|document\nevent_category: project|financial|crew|scheduling|service_plan|documentation|communication|agent\nlimit: default 8, max 25.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          entity_type: { type: 'string' },
          entity_id: { type: 'string' },
          event_category: { type: 'string' },
          since_days: { type: 'integer' },
          limit: { type: 'integer' }
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
      description: "ESTIMATE LINE-ITEM PRICING ONLY. Returns historical avg/high/low prices for services. Call AFTER deciding to build an estimate, to fill per-item costs. DO NOT use for project creation/preview (projects use the contract amount user typed). DO NOT use for continuations like 'yeah client is Sarah, $55k'. items: array of service descriptions like ['Install porcelain tile', 'Paint walls 2 coats'].",
      parameters: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' } },
          complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'] }
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
      description: 'Assign unmatched bank/card transaction to a project as expense. Use for "put that Home Depot charge on Smith project". MUST pass phase_name (preferred) OR phase_id; if user did not name a phase, OMIT both — tool returns available_phases to ask. Suggest category from merchant name when possible. bank_transaction_id accepts merchant/amount/UUID (auto-resolves).',
      parameters: {
        type: 'object',
        properties: {
          bank_transaction_id: { type: 'string' },
          project_id: { type: 'string' },
          category: { type: 'string', enum: ['materials', 'labor', 'equipment', 'permits', 'subcontractor', 'misc'] },
          description: { type: 'string' },
          subcategory: { type: 'string' },
          phase_id: { type: 'string' },
          phase_name: { type: 'string' }
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
      description: 'Generate P&L report for a date range. Returns revenue, costs by category, gross profit/margin, prorated overhead, net profit, outstanding receivables, per-project breakdown. Use for "P&L", "profit and loss", "what we netted", "show me the numbers". Response includes pnl-report visualElement — render it.\n\ndates: YYYY-MM-DD (parse natural language: "Q1" → 2026-01-01, "last month" → first day prev month).\nproject_id: optional, scopes to one project. Omit for company-wide.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          project_id: { type: 'string' },
          include_projects: { type: 'boolean' }
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
      description: 'Configure recurring daily checklist + labor roles for a project/service plan. Items the crew checks EVERY workday: head counts, PPE, daily quantities (linear ft, bags), site photos, cleanup. NEVER use for phase milestones ("Pressure test passed", "Rough-in complete") — those belong in phase tasks.\n\nchecklist_items: Array<{title, item_type?: "checkbox"|"quantity" (default checkbox), quantity_unit?: string, requires_photo?: boolean}>\nlabor_roles: Array<{role_name, default_quantity?: int}>\nProvide project_id OR service_plan_id (not both).',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          service_plan_id: { type: 'string' },
          checklist_items: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, item_type: { type: 'string', enum: ['checkbox', 'quantity'] }, quantity_unit: { type: 'string' }, requires_photo: { type: 'boolean' } }, required: ['title'] } },
          labor_roles: { type: 'array', items: { type: 'object', properties: { role_name: { type: 'string' }, default_quantity: { type: 'integer' } }, required: ['role_name'] } }
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
      name: 'import_qbo_expense_history',
      description: 'Import historical QuickBooks Bills as project_transactions (expense type). Best-effort vendor → worker → project linking. Bills without a clear project link fall into an unallocated bucket the user can re-categorize from the UI later. Default last 12 months.',
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
      description: 'Create a draft change order on a project. CO# auto-increments. Use for mid-project additions / scope changes beyond the original contract. Always draft — call send_change_order separately.\n\nline_items: Array<{description, unit_price, quantity?=1, unit?, category?}>\nbilling_strategy: invoice_now (separate invoice on approval) | add_to_contract (rolls into contract_amount) | final_invoice (lumped into final). Default invoice_now.\nphase_placement: inside_phase | before_phase | after_phase. REQUIRED when CO has tasks or schedule_impact_days != 0. Ask user if unspecified. target_phase_id pairs with this. new_phase_name optional (defaults to CO title) for before/after.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          line_items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' }, unit_price: { type: 'number' }, category: { type: 'string' } }, required: ['description', 'unit_price'] } },
          schedule_impact_days: { type: 'number' },
          tax_rate: { type: 'number' },
          signature_required: { type: 'boolean' },
          billing_strategy: { type: 'string', enum: ['invoice_now', 'add_to_contract', 'final_invoice'] },
          phase_placement: { type: 'string', enum: ['inside_phase', 'before_phase', 'after_phase'] },
          target_phase_id: { type: 'string' },
          new_phase_name: { type: 'string' },
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
      name: 'delete_change_order',
      description: 'Delete a change order completely, including all its side effects. Use this when the user wants to REMOVE a CO entirely — including the duplicate $X expense entry it added to a project, the contract bump, the schedule extension, and any spawned draws. This is the right tool for: "delete the duplicate $1600 tile expense" (when the expense came from a duplicated approved CO), "remove that change order", "kill CO-003". For approved COs, this reverses the cascade: removes the projects.extras entry (contract auto-recalculates), deletes spawned draw_schedule_items, reverses end_date shift. Phase placements (inserted/extended phases) are NOT auto-removed since the user may have tasks under them — a note is returned if manual cleanup is needed.',
      parameters: {
        type: 'object',
        properties: {
          change_order_id: { type: 'string', description: 'UUID of the CO, "CO-002"/"2", or a title fragment to resolve.' },
        },
        required: ['change_order_id'],
      },
      examples: [
        { user: 'delete the duplicate $1600 tile expense — it was a CO that got created twice',
          call: { name: 'delete_change_order', args: { change_order_id: '<id-of-the-duplicate-CO>' } } },
        { user: 'remove CO-003',
          call: { name: 'delete_change_order', args: { change_order_id: 'CO-003' } } },
      ],
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
      description: 'List ALL subcontractor organizations the GC has worked with or invited (across every project). Returns name, trade, contact, and engagement count per sub. Use when the user asks "what subs do I have", "show me my plumbers", "list active subs". For ONE specific sub use get_sub. For sub × project work units (engagements) use list_engagements instead.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return. Default 25, max 100.' }
        }
      },
      examples: [
        { user: 'show me all my plumbers', call: { name: 'list_subs', args: {} } },
        { user: 'who have I worked with as a sub?', call: { name: 'list_subs', args: { limit: 50 } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sub',
      description: 'Fetch the full profile for ONE subcontractor: contact info, primary trade, certifications, payment terms history, total billed, engagement count. Use after list_subs when you need detail on one sub by id, or when the user names a specific sub ("tell me about ABC Plumbing"). Use get_sub_compliance instead if you specifically need their COI / W9 / license expiry data.',
      parameters: {
        type: 'object',
        required: ['sub_organization_id'],
        properties: {
          sub_organization_id: { type: 'string', description: 'UUID of the sub_organizations row, or pass a name and it will be resolved.' }
        }
      },
      examples: [
        { user: "what's ABC Plumbing's contact info", call: { name: 'get_sub', args: { sub_organization_id: 'ABC Plumbing' } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sub_compliance',
      description: "Fetch all compliance documents for ONE sub (COI general liability, COI auto, W9, contractor license, etc.) with current status and expiry dates. Use when the user asks 'is ABC Plumbing covered?', 'what's the status on Smith's COI', 'when does the license expire'. For an across-the-board scan of expiring docs use list_expiring_compliance instead.",
      parameters: {
        type: 'object',
        required: ['sub_organization_id'],
        properties: {
          sub_organization_id: { type: 'string', description: 'UUID of the sub_organizations row, or a sub name to resolve.' }
        }
      },
      examples: [
        { user: "is ABC Plumbing's COI current?", call: { name: 'get_sub_compliance', args: { sub_organization_id: 'ABC Plumbing' } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_engagements',
      description: 'List sub × project work units (sub_engagements rows). One engagement = one sub awarded one trade scope on one project. Filter by project_id (every sub on the Smith job) or status (every sub still bidding). Use for "who is doing the plumbing on Smith?" or "what bids are still open?". For ALL the GC\'s subs across every project use list_subs.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Optional. Filter engagements to one project (UUID or project name to resolve).' },
          status: { type: 'string', enum: ['invited','bidding','awarded','contracted','mobilized','in_progress','substantially_complete','closed_out','cancelled'], description: 'Optional. Filter by engagement lifecycle status.' }
        }
      },
      examples: [
        { user: 'who is doing the plumbing on the Smith job?', call: { name: 'list_engagements', args: { project_id: 'Smith', status: 'awarded' } } },
        { user: 'what bids are still open?', call: { name: 'list_engagements', args: { status: 'bidding' } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_engagement',
      description: "Fetch ONE engagement with full detail: scope, contract amount, payment terms, current status, and a computed compliance check (passes/blockers/warnings — does the sub have valid COI, signed MSA, current license for this trade?). Use when the user names a specific sub × project ('how is ABC Plumbing doing on Smith?', 'is Bob cleared to start framing on Henderson?'). For all engagements on a project use list_engagements.",
      parameters: {
        type: 'object',
        required: ['engagement_id'],
        properties: {
          engagement_id: { type: 'string', description: 'UUID of the sub_engagements row.' }
        }
      },
      examples: [
        { user: 'is ABC cleared to start on the Smith job?', call: { name: 'get_engagement', args: { engagement_id: '<uuid>' } } },
      ],
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
      description: 'Create a new sub_engagement that links an EXISTING sub to a project for a specific trade. The sub must already exist in sub_organizations — call list_subs first to find them, or onboard them through the UI before this tool. Use when the user says "add ABC Plumbing to the Smith job for plumbing", "put Bob on Henderson framing". For sending out a bid request use send_bid_invitation instead.',
      parameters: {
        type: 'object',
        required: ['sub_organization_id', 'project_id', 'trade'],
        properties: {
          sub_organization_id: { type: 'string', description: 'UUID of the existing sub_organizations row, or sub name to resolve.' },
          project_id: { type: 'string', description: 'UUID of the project, or project name to resolve.' },
          trade: { type: 'string', description: 'Trade scope (e.g., plumbing, electrical, HVAC, framing, drywall).' },
          scope_summary: { type: 'string', description: 'One-line scope description (e.g., "rough-in + finish plumbing for 3 baths").' },
          contract_amount: { type: 'number', description: 'Agreed contract dollar amount for this engagement.' },
          payment_terms: { type: 'string', enum: ['fifty_fifty','milestones','net_30','custom'], description: 'Payment cadence. Default net_30.' }
        }
      },
      examples: [
        { user: 'add ABC Plumbing to Smith for plumbing, $12k, net 30',
          call: { name: 'add_sub_to_project', args: { sub_organization_id: 'ABC Plumbing', project_id: 'Smith', trade: 'plumbing', contract_amount: 12000, payment_terms: 'net_30' } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'record_compliance_doc',
      description: 'Manually record a compliance document for a sub (COI general liability, COI auto, W9, contractor license, etc.) when the GC has the file in hand and types in the metadata. Use for "I have ABC\'s COI, expires 6/30/27", "log the W9 from Bob". For requesting a sub UPLOAD a doc themselves use request_compliance_doc_from_sub. Updates the sub\'s computed compliance status used by get_sub_compliance.',
      parameters: {
        type: 'object',
        required: ['sub_organization_id','doc_type'],
        properties: {
          sub_organization_id: { type: 'string', description: 'UUID of the sub_organizations row, or sub name to resolve.' },
          doc_type: { type: 'string', description: "Document category: 'coi_gl' (general liability), 'coi_auto' (auto liability), 'w9', 'license_state' (contractor license), 'license_local', 'workers_comp'." },
          doc_subtype: { type: 'string', description: 'Optional refinement when doc_type alone is ambiguous.' },
          file_url: { type: 'string', description: 'Optional URL to the stored file (uploaded via UI).' },
          issuer: { type: 'string', description: 'Insurance carrier or issuing agency name.' },
          policy_number: { type: 'string', description: 'Policy / license number from the document.' },
          expires_at: { type: 'string', description: 'Expiration date in YYYY-MM-DD format.' },
          coverage_limits: { type: 'object', description: 'Coverage limits as JSON (e.g., {gl_each_occurrence: 1000000, gl_aggregate: 2000000}).' },
          endorsements: { type: 'array', items: { type: 'string' }, description: 'List of named endorsements present (e.g., "additional insured", "waiver of subrogation").' },
          notes: { type: 'string', description: 'Free-text notes for human review.' }
        }
      },
      examples: [
        { user: "I have ABC Plumbing's COI, expires June 30 2027",
          call: { name: 'record_compliance_doc', args: { sub_organization_id: 'ABC Plumbing', doc_type: 'coi_gl', expires_at: '2027-06-30' } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'record_payment',
      description: 'Record a manual payment the GC made to a sub against a specific engagement (check, ACH, Zelle, etc.). Updates the sub\'s billed/paid totals and notifies the sub. Use when the user says "I paid ABC $5k via check for the Smith job", "record the Zelle transfer to Bob on the Henderson job". For RECEIVING a payment from a client use the financial flow instead.',
      parameters: {
        type: 'object',
        required: ['engagement_id','amount','paid_at','method'],
        properties: {
          engagement_id: { type: 'string', description: 'UUID of the sub_engagements row this payment is against.' },
          amount: { type: 'number', description: 'Payment dollar amount.' },
          paid_at: { type: 'string', description: 'Payment date in YYYY-MM-DD format.' },
          method: { type: 'string', enum: ['check','ach','zelle','venmo','wire','cash','other'], description: 'Payment method.' },
          reference: { type: 'string', description: 'Check number, ACH transaction id, Zelle confirmation, etc.' },
          sub_invoice_id: { type: 'string', description: 'Optional UUID of the sub_invoice this pays against.' },
          notes: { type: 'string', description: 'Free-text notes about the payment.' }
        }
      },
      examples: [
        { user: 'paid ABC $5000 via check for the Smith job, check #1240',
          call: { name: 'record_payment', args: { engagement_id: '<uuid>', amount: 5000, paid_at: '2026-05-01', method: 'check', reference: '1240' } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_compliance_doc_from_sub',
      description: 'EXTERNAL_WRITE — emails the sub a magic link to upload a specific compliance document themselves (COI, W9, license, etc.). Requires user approval before sending. Use when the user says "ask ABC for their COI", "send Bob a link to upload his W9". For manually entering a doc the GC already has use record_compliance_doc instead.',
      parameters: {
        type: 'object',
        required: ['sub_organization_id','doc_type'],
        properties: {
          sub_organization_id: { type: 'string', description: 'UUID of the sub_organizations row, or sub name to resolve.' },
          doc_type: { type: 'string', description: "What to request: 'coi_gl' for general liability COI, 'w9', 'license_state', etc." }
        }
      },
      examples: [
        { user: "ask ABC Plumbing for their COI",
          call: { name: 'request_compliance_doc_from_sub', args: { sub_organization_id: 'ABC Plumbing', doc_type: 'coi_gl' } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_msa_signature',
      description: 'EXTERNAL_WRITE — generates a Master Subcontract Agreement for an engagement and emails the sub for e-signature. Requires user approval before sending. Use when the user says "send the MSA to ABC", "get Bob to sign the contract on Henderson". The signed MSA gates many other actions (payments, work start) — see get_engagement compliance status.',
      parameters: {
        type: 'object',
        required: ['engagement_id'],
        properties: {
          engagement_id: { type: 'string', description: 'UUID of the sub_engagements row to generate the MSA against.' },
          title: { type: 'string', description: 'Optional contract title. Default: "Master Subcontract Agreement".' }
        }
      },
      examples: [
        { user: 'send the MSA to ABC for the Smith job',
          call: { name: 'request_msa_signature', args: { engagement_id: '<uuid>' } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_bid_invitation',
      description: 'EXTERNAL_WRITE — creates a bid request for a project trade scope and emails multiple subs to invite them to bid. Requires user approval before sending. Use when the user says "send out the plumbing bids on Smith", "invite three framers to bid Henderson". For ADDING an awarded sub directly without bidding use add_sub_to_project instead.',
      parameters: {
        type: 'object',
        required: ['project_id','trade','scope_summary','sub_organization_ids'],
        properties: {
          project_id: { type: 'string', description: 'UUID or name of the project being bid out.' },
          trade: { type: 'string', description: 'Trade being bid (e.g., plumbing, electrical, HVAC).' },
          scope_summary: { type: 'string', description: 'Scope description for the bid packet (e.g., "rough-in + finish plumbing for 3 bathrooms, ~120 fixtures").' },
          sub_organization_ids: { type: 'array', items: { type: 'string' }, description: 'UUIDs of subs being invited (typically 3-5).' },
          due_at: { type: 'string', description: 'Bid due date in YYYY-MM-DD format. Default 7 days out.' },
          payment_terms: { type: 'string', enum: ['fifty_fifty','milestones','net_30','custom'], description: 'Proposed payment terms in the bid packet.' }
        }
      },
      examples: [
        { user: 'send out plumbing bids for Smith to ABC, XYZ, and Acme',
          call: { name: 'send_bid_invitation', args: { project_id: 'Smith', trade: 'plumbing', scope_summary: 'rough + finish plumbing', sub_organization_ids: ['<abc>', '<xyz>', '<acme>'] } } },
      ],
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_bid_request',
      description: 'Get one bid request with every submitted bid, sorted lowest-first. Use after send_bid_invitation when the user wants to review responses ("how are the bids on the plumbing job?", "compare the framing bids"). Returns each bid\'s amount, timeline, exclusions, alternates, and status so the agent can recommend a winner.',
      parameters: {
        type: 'object',
        required: ['bid_request_id'],
        properties: {
          bid_request_id: { type: 'string', description: 'UUID of the bid request.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'accept_bid',
      description: 'EXTERNAL_WRITE — award a specific bid. The accepted sub gets notified, the bid_request is marked awarded, a sub_engagement is created linking the sub to the project at the bid amount, other bids on this request flip to declined automatically. **You MUST get explicit confirmation in the SAME TURN before calling.** Show "Award the [trade] job to [sub] for $[amount]? Other bidders will be auto-declined." and wait for explicit yes.',
      parameters: {
        type: 'object',
        required: ['bid_id'],
        properties: {
          bid_id: { type: 'string', description: 'UUID of the sub_bid to accept.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'decline_bid',
      description: 'Decline a single submitted bid (other bids stay alive). Use to thin the field before picking a winner, or to reject obviously-uncompetitive bids. The sub gets notified.',
      parameters: {
        type: 'object',
        required: ['bid_id'],
        properties: {
          bid_id: { type: 'string', description: 'UUID of the sub_bid to decline.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verify_compliance_doc',
      description: 'Mark a recorded compliance document (COI, W-9, license, etc.) as verified or rejected after manual review. Use when the user says "the COI checks out" / "verify Smith Plumbing\'s insurance" or after a doc upload they want approved. Reject path requires a reason. Logs verified_by + verified_at for audit.',
      parameters: {
        type: 'object',
        required: ['document_id', 'verification_status'],
        properties: {
          document_id: { type: 'string', description: 'UUID of the compliance_documents row.' },
          verification_status: { type: 'string', enum: ['verified', 'rejected'] },
          rejection_reason: { type: 'string', description: 'Required when rejecting. Free text explaining why (e.g. "expired", "wrong named insured", "not a notarized W-9").' },
          verification_method: { type: 'string', description: "Default 'manual_review'. Use 'automated' if you used a verification API, 'auto_scan' if pulled from OCR, etc." }
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
  get_bid_request: 'Loading bids...',
  accept_bid: 'Awarding bid + notifying winner...',
  decline_bid: 'Declining bid...',
  verify_compliance_doc: 'Updating verification status...',
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
  import_qbo_expense_history: 'Pulling vendor bill history...',
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
