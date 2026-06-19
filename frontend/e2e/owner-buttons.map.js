/**
 * Every-button QA map: per reachable owner screen, the stay-on-screen safe
 * buttons to tap + screenshot, with each button's expected behavior for review.
 * Generated from the button-inventory workflow. See owner-buttons.test.js.
 */
/* eslint-disable */
module.exports = {
  "ownerDashboard": [
    {
      "id": "ownerDashboard.customizeButton",
      "expected": "Enters edit mode, showing edit header and draggable widget grid with remove badges and reorder handles"
    },
    {
      "id": "ownerDashboard.resetButton",
      "expected": "Resets dashboard to default widget layout"
    },
    {
      "id": "ownerDashboard.doneButton",
      "expected": "Exits edit mode, saves pending layout changes, returns to view mode"
    },
    {
      "id": "ownerDashboard.addWidgetButton",
      "expected": "Opens AddWidgetSheet showing available widgets to add to dashboard"
    }
  ],
  "work": [
    {
      "id": "work.filterButton",
      "expected": "toggles filter visibility state and changes icon color between #1E40AF (active) and secondary text color (inactive)"
    },
    {
      "id": "work.projectsTab",
      "expected": "switches active segment to Projects (0), animates pill width expansion, saves tab state to AsyncStorage, animates text size and opacity chan"
    },
    {
      "id": "work.servicesTab",
      "expected": "switches active segment to Services (1), animates pill width expansion, saves tab state to AsyncStorage, animates text size and opacity chan"
    }
  ],
  "ownerProjects": [
    {
      "id": "ownerProjects.filterButton",
      "expected": "Opens or closes the filter dropdown menu"
    },
    {
      "id": "ownerProjects.filterOption.all",
      "expected": "Filters projects to show all projects and closes dropdown"
    },
    {
      "id": "ownerProjects.filterOption.active",
      "expected": "Filters projects to show only active projects and closes dropdown"
    },
    {
      "id": "ownerProjects.filterOption.mine",
      "expected": "Filters projects to show only owner's direct projects and closes dropdown"
    },
    {
      "id": "ownerProjects.filterOption.assigned",
      "expected": "Filters projects to show supervisor-assigned projects and closes dropdown"
    },
    {
      "id": "ownerProjects.filterOption.completed",
      "expected": "Filters projects to show completed projects and closes dropdown"
    },
    {
      "id": "ownerProjects.filterOption.draft",
      "expected": "Filters projects to show draft projects and closes dropdown"
    }
  ],
  "projectDetail": [
    {
      "id": "projectDetail.editButton",
      "expected": "enters edit mode and shows save button"
    },
    {
      "id": "projectDetail.statusBadge",
      "expected": "opens status picker to change project status"
    },
    {
      "id": "projectDetail.statusText",
      "expected": "displays current project status (active/completed/paused)"
    },
    {
      "id": "projectDetail.title",
      "expected": "displays the project name"
    },
    {
      "id": "projectDetail.scrollView",
      "expected": "allows scrolling through project details content"
    },
    {
      "id": "projectDetail.contractValue",
      "expected": "displays formatted contract amount"
    },
    {
      "id": "projectDetail.contractVisibilityToggle",
      "expected": "toggles contract visibility from supervisors on/off"
    },
    {
      "id": "projectDetail.incomeAmount",
      "expected": "displays total income collected"
    },
    {
      "id": "projectDetail.expensesAmount",
      "expected": "displays total project expenses"
    },
    {
      "id": "projectDetail.profitAmount",
      "expected": "displays calculated profit (income - expenses)"
    },
    {
      "id": "projectDetail.progressPercent",
      "expected": "displays overall project completion percentage"
    },
    {
      "id": "projectDetail.budgetBreakdownToggle",
      "expected": "expands/collapses budget breakdown and trade details section"
    },
    {
      "id": "projectDetail.overallBudgetValue",
      "expected": "displays spent vs contract amount"
    },
    {
      "id": "projectDetail.shiftTasksButton",
      "expected": "opens bulk task shift modal to reschedule multiple tasks"
    },
    {
      "id": "projectDetail.addTradeBudgetButton",
      "expected": "opens modal to add a new trade budget"
    },
    {
      "id": "projectDetail.assignedCount",
      "expected": "displays count of assigned workers and supervisor"
    },
    {
      "id": "projectDetail.assignSupervisorButton",
      "expected": "opens supervisor assignment modal"
    },
    {
      "id": "projectDetail.assignWorkerButton",
      "expected": "opens worker assignment modal"
    },
    {
      "id": "projectDetail.supervisorName",
      "expected": "displays the assigned supervisor business name"
    },
    {
      "id": "projectDetail.dailyReportsCount",
      "expected": "displays count of daily reports"
    },
    {
      "id": "projectDetail.startDateButton",
      "expected": "opens date picker to set project start date"
    },
    {
      "id": "projectDetail.endDateButton",
      "expected": "opens date picker to set project end date"
    },
    {
      "id": "projectDetail.deleteProjectLink",
      "expected": "opens delete confirmation modal with type-to-confirm"
    },
    {
      "id": "projectDetail.documentVisibilityOption",
      "expected": "toggles document visibility to workers on/off"
    },
    {
      "id": "projectDetail.documentUploadCancelButton",
      "expected": "closes document upload visibility modal"
    },
    {
      "id": "projectDetail.datePickerBackdrop",
      "expected": "closes the date picker modal when tapped outside"
    },
    {
      "id": "projectDetail.datePickerCancelButton",
      "expected": "closes date picker without saving changes"
    },
    {
      "id": "projectDetail.estimateModalCloseButton",
      "expected": "closes the estimate preview modal"
    },
    {
      "id": "projectDetail.deleteCancelButton",
      "expected": "closes delete confirmation modal"
    },
    {
      "id": "projectDetail.cancelEditButton",
      "expected": "exits edit mode and reverts all unsaved changes"
    }
  ],
  "manualProjectCreate": [
    {
      "id": "manualProjectCreate.section.client",
      "expected": "expands/collapses Client Info section"
    },
    {
      "id": "manualProjectCreate.section.timeline",
      "expected": "expands/collapses Timeline section"
    },
    {
      "id": "manualProjectCreate.section.financial",
      "expected": "expands/collapses Financial section"
    },
    {
      "id": "manualProjectCreate.section.phases",
      "expected": "expands/collapses Phases & Tasks section"
    },
    {
      "id": "manualProjectCreate.section.checklist",
      "expected": "expands/collapses Daily Checklist section"
    },
    {
      "id": "manualProjectCreate.section.labor",
      "expected": "expands/collapses Labor Roles section"
    },
    {
      "id": "manualProjectCreate.section.team",
      "expected": "expands/collapses Team section"
    },
    {
      "id": "manualProjectCreate.section.settings",
      "expected": "expands/collapses Settings section"
    },
    {
      "id": "manualProjectCreate.startDateButton",
      "expected": "opens date picker for start date selection"
    },
    {
      "id": "manualProjectCreate.endDateButton",
      "expected": "opens date picker for end date selection"
    },
    {
      "id": "manualProjectCreate.startDateDoneButton",
      "expected": "closes start date picker and confirms date selection"
    },
    {
      "id": "manualProjectCreate.endDateDoneButton",
      "expected": "closes end date picker and confirms date selection"
    },
    {
      "id": "manualProjectCreate.useServicesTotalButton",
      "expected": "populates contract amount field with sum of all services"
    },
    {
      "id": "manualProjectCreate.addServiceButton",
      "expected": "adds new empty service/line item row"
    },
    {
      "id": "manualProjectCreate.addPhaseButton",
      "expected": "adds new phase from input field"
    },
    {
      "id": "manualProjectCreate.addChecklistItemButton",
      "expected": "adds new empty checklist item row"
    },
    {
      "id": "manualProjectCreate.addLaborRoleButton",
      "expected": "adds new empty labor role row"
    },
    {
      "id": "manualProjectCreate.statusOption.active",
      "expected": "sets project status to active"
    },
    {
      "id": "manualProjectCreate.statusOption.draft",
      "expected": "sets project status to draft"
    },
    {
      "id": "manualProjectCreate.aiResponsesSwitch",
      "expected": "toggles AI auto-response feature on/off"
    }
  ],
  "ownerWorkers": [
    {
      "id": "ownerWorkers.scheduleTab",
      "expected": "Switches to Schedule tab showing worker schedule view"
    },
    {
      "id": "ownerWorkers.reportsTab",
      "expected": "Switches to Reports tab showing worker reports view"
    },
    {
      "id": "ownerWorkers.teamTab",
      "expected": "Switches to Team tab showing supervisors, workers, and subcontractors"
    },
    {
      "id": "ownerWorkers.searchButton",
      "expected": "Opens search input field for Team tab filtering"
    },
    {
      "id": "ownerWorkers.searchCloseButton",
      "expected": "Clears search query and closes search bar"
    },
    {
      "id": "ownerWorkers.filterButton",
      "expected": "Opens filter menu to show/hide supervisors, workers, subcontractors"
    },
    {
      "id": "ownerWorkers.filterOption.all",
      "expected": "Shows all team members (supervisors, workers, subcontractors)"
    },
    {
      "id": "ownerWorkers.filterOption.supervisors",
      "expected": "Shows only supervisors in Team tab"
    },
    {
      "id": "ownerWorkers.filterOption.workers",
      "expected": "Shows only workers in Team tab"
    },
    {
      "id": "ownerWorkers.filterOption.subcontractors",
      "expected": "Shows only subcontractors in Team tab"
    },
    {
      "id": "ownerWorkers.addTeamMemberButton",
      "expected": "Opens role picker modal to add supervisor, worker, or subcontractor"
    },
    {
      "id": "ownerWorkers.scrollView",
      "expected": "Allows scrolling through list of supervisors, workers, and subcontractors"
    },
    {
      "id": "ownerWorkers.retryButton",
      "expected": "Retries loading failed section (supervisors, workers, or subcontractors)"
    },
    {
      "id": "ownerWorkers.rolePickerCancel",
      "expected": "Closes the role picker modal"
    },
    {
      "id": "ownerWorkers.supervisorModalCancel",
      "expected": "Closes Add Supervisor modal and returns to Team tab"
    },
    {
      "id": "ownerWorkers.supervisorModalTitle",
      "expected": "Displays 'Add Supervisor' title text in modal header"
    },
    {
      "id": "ownerWorkers.supervisorPaymentType.hourly",
      "expected": "Selects hourly payment type for supervisor"
    },
    {
      "id": "ownerWorkers.supervisorPaymentType.daily",
      "expected": "Selects daily payment type for supervisor"
    },
    {
      "id": "ownerWorkers.supervisorPaymentType.weekly",
      "expected": "Selects weekly payment type for supervisor"
    },
    {
      "id": "ownerWorkers.supervisorPaymentType.project_based",
      "expected": "Selects project-based payment type for supervisor"
    },
    {
      "id": "ownerWorkers.workerModalCancel",
      "expected": "Closes Add Worker modal and returns to Team tab"
    },
    {
      "id": "ownerWorkers.workerModalTitle",
      "expected": "Displays 'Add Worker' title text in modal header"
    },
    {
      "id": "ownerWorkers.workerPaymentType.hourly",
      "expected": "Selects hourly payment type for worker"
    },
    {
      "id": "ownerWorkers.workerPaymentType.daily",
      "expected": "Selects daily payment type for worker"
    },
    {
      "id": "ownerWorkers.workerPaymentType.weekly",
      "expected": "Selects weekly payment type for worker"
    },
    {
      "id": "ownerWorkers.workerPaymentType.project_based",
      "expected": "Selects project-based payment type for worker"
    }
  ],
  "ownerSettings": [
    {
      "id": "ownerSettings.aiPersonalityToggle",
      "expected": "expands or collapses AI Personality section to show/hide input fields"
    },
    {
      "id": "ownerSettings.appearanceItem",
      "expected": "toggles dark/light theme and updates theme toggle switch display"
    },
    {
      "id": "ownerSettings.helpSupportItem",
      "expected": "opens email client with support@sylkapp.ai"
    }
  ],
  "financialReport": [
    {
      "id": "financialReport.viewCompany",
      "expected": "switches to company-wide financial view"
    },
    {
      "id": "financialReport.viewProject",
      "expected": "switches to project-by-project financial breakdown"
    },
    {
      "id": "financialReport.scrollView",
      "expected": "allows scrolling through financial report content"
    }
  ],
  "invoiceBuilder": [
    {
      "id": "invoiceBuilder.retryButton",
      "expected": "retries bootstrap and reloads invoice data"
    },
    {
      "id": "invoiceBuilder.section.basics",
      "expected": "expands or collapses the Invoice basics section"
    },
    {
      "id": "invoiceBuilder.section.lineItems",
      "expected": "expands or collapses the Line items section"
    },
    {
      "id": "invoiceBuilder.section.pricing",
      "expected": "expands or collapses the Pricing & tax section"
    },
    {
      "id": "invoiceBuilder.section.terms",
      "expected": "expands or collapses the Terms & notes section"
    },
    {
      "id": "invoiceBuilder.section.review",
      "expected": "expands or collapses the Review & send section"
    },
    {
      "id": "invoiceBuilder.projectPickerButton",
      "expected": "opens project picker modal"
    },
    {
      "id": "invoiceBuilder.dueDateButton",
      "expected": "opens date picker modal for due date selection"
    },
    {
      "id": "invoiceBuilder.projectPickerClose",
      "expected": "closes the project picker modal"
    },
    {
      "id": "invoiceBuilder.termsPickerClose",
      "expected": "closes the payment terms picker modal"
    },
    {
      "id": "invoiceBuilder.datePickerClose",
      "expected": "closes the date picker modal"
    },
    {
      "id": "invoiceBuilder.paymentTermsButton",
      "expected": "opens payment terms picker modal"
    }
  ],
  "estimateBuilder": [
    {
      "id": "estimateBuilder.sectionHeader.basics",
      "expected": "Expand/collapse Estimate basics section showing client info fields"
    },
    {
      "id": "estimateBuilder.sectionHeader.lineItems",
      "expected": "Expand/collapse Line items section showing line item editor"
    },
    {
      "id": "estimateBuilder.sectionHeader.pricing",
      "expected": "Expand/collapse Pricing & tax section showing tax rate and summary"
    },
    {
      "id": "estimateBuilder.sectionHeader.terms",
      "expected": "Expand/collapse Terms section showing payment terms field"
    },
    {
      "id": "estimateBuilder.sectionHeader.review",
      "expected": "Expand/collapse Review & send section showing preview, signature switch, and send button"
    },
    {
      "id": "estimateBuilder.linkedProjectButton",
      "expected": "Open project picker modal to select/link a project"
    },
    {
      "id": "estimateBuilder.dateIssuedButton",
      "expected": "Open date picker modal for 'Date issued' field"
    },
    {
      "id": "estimateBuilder.validUntilButton",
      "expected": "Open date picker modal for 'Valid until' field"
    },
    {
      "id": "estimateBuilder.extractFromPhotoButton",
      "expected": "Open alert dialog with options to take photo or choose from gallery to extract line items via AI"
    },
    {
      "id": "estimateBuilder.projectPickerCloseButton",
      "expected": "Close the project picker modal"
    },
    {
      "id": "estimateBuilder.datePickerCloseButton",
      "expected": "Close the date picker modal"
    },
    {
      "id": "estimateBuilder.datePickerDoneButton",
      "expected": "Confirm date selection and close date picker modal (iOS platforms)"
    },
    {
      "id": "estimateBuilder.signatureRequiredSwitch",
      "expected": "Toggle signature_required flag on/off"
    }
  ],
  "clients": [
    {
      "id": "clients.searchClearButton",
      "expected": "clears the search input field and resets client list filter"
    }
  ],
  "payrollSummary": [
    {
      "id": "payrollSummary.period.week",
      "expected": "switches payroll view to this week and loads week's data"
    },
    {
      "id": "payrollSummary.period.month",
      "expected": "switches payroll view to this month and loads month's data"
    },
    {
      "id": "payrollSummary.groupByProjectToggle",
      "expected": "toggles between grouping workers by name only vs. by name and project, reloads data"
    }
  ],
  "projectDocuments": [
    {
      "id": "projectDocuments.addButton",
      "expected": "opens the add document modal"
    },
    {
      "id": "projectDocuments.searchClearButton",
      "expected": "clears the search input text"
    },
    {
      "id": "projectDocuments.retryButton",
      "expected": "retries loading documents when load error occurs"
    },
    {
      "id": "projectDocuments.modalCloseButton",
      "expected": "closes the add document modal"
    },
    {
      "id": "projectDocuments.pickFileButton",
      "expected": "opens document picker to select PDF or file"
    },
    {
      "id": "projectDocuments.pickPhotoButton",
      "expected": "opens image picker to select a photo"
    },
    {
      "id": "projectDocuments.removeFileButton",
      "expected": "clears the selected file from the form"
    },
    {
      "id": "projectDocuments.visSubsCheck",
      "expected": "toggles visibility for subcontractors"
    },
    {
      "id": "projectDocuments.visWorkersCheck",
      "expected": "toggles visibility for workers"
    },
    {
      "id": "projectDocuments.visClientsCheck",
      "expected": "toggles visibility for clients"
    },
    {
      "id": "projectDocuments.importantCheck",
      "expected": "toggles important flag for the document"
    }
  ],
  "estimatesDetail": [
    {
      "id": "estimatesDetail.searchInput",
      "expected": "filters estimates list by client or project name as user types"
    },
    {
      "id": "estimatesDetail.clearSearchButton",
      "expected": "clears search query and shows all filtered estimates"
    },
    {
      "id": "estimatesDetail.filter.all",
      "expected": "filters to show all estimates regardless of status"
    },
    {
      "id": "estimatesDetail.filter.draft",
      "expected": "filters to show only draft estimates"
    },
    {
      "id": "estimatesDetail.filter.sent",
      "expected": "filters to show only sent estimates"
    },
    {
      "id": "estimatesDetail.filter.accepted",
      "expected": "filters to show only accepted estimates"
    },
    {
      "id": "estimatesDetail.filter.rejected",
      "expected": "filters to show only rejected estimates"
    },
    {
      "id": "estimatesDetail.modalCloseButton",
      "expected": "closes estimate detail modal and returns to list"
    }
  ],
  "invoicesDetail": [
    {
      "id": "invoicesDetail.modalCloseButton",
      "expected": "closes invoice detail modal"
    }
  ],
  "contracts": [
    {
      "id": "contracts.uploadButton",
      "expected": "opens alert with source options (Take Photo, Choose from Photos, Choose Document, Cancel)"
    }
  ],
  "invoiceTemplate": [
    {
      "id": "invoiceTemplate.logoPicker",
      "expected": "Opens image picker to select logo from photo library"
    },
    {
      "id": "invoiceTemplate.removeLogoButton",
      "expected": "Clears the selected logo image (only shown when logo is set)"
    },
    {
      "id": "invoiceTemplate.previewCloseButton",
      "expected": "Closes the template preview modal and returns to main screen"
    },
    {
      "id": "invoiceTemplate.previewToggleInvoice",
      "expected": "Switches preview to show invoice type rendering"
    },
    {
      "id": "invoiceTemplate.previewToggleEstimate",
      "expected": "Switches preview to show estimate type rendering"
    }
  ],
  "editBusinessInfo": [
    {
      "id": "editBusinessInfo.logoUploadButton",
      "expected": "opens image picker to select and upload a business logo"
    }
  ],
  "notificationSettings": [
    {
      "id": "notificationSettings.allowAllSwitch",
      "expected": "toggles both push_enabled and inapp_enabled in sync, showing/hiding conditional category toggles below"
    },
    {
      "id": "notificationSettings.appointmentRemindersSwitch",
      "expected": "toggles both push_appointment_reminders and inapp_appointment_reminders in sync"
    },
    {
      "id": "notificationSettings.dailyReportsSwitch",
      "expected": "toggles both push_daily_reports and inapp_daily_reports in sync"
    },
    {
      "id": "notificationSettings.projectWarningsSwitch",
      "expected": "toggles both push_project_warnings and inapp_project_warnings in sync"
    },
    {
      "id": "notificationSettings.financialUpdatesSwitch",
      "expected": "toggles both push_financial_updates and inapp_financial_updates in sync"
    },
    {
      "id": "notificationSettings.workerUpdatesSwitch",
      "expected": "toggles both push_worker_updates and inapp_worker_updates in sync"
    },
    {
      "id": "notificationSettings.reminderSlider",
      "expected": "adjusts appointment_reminder_minutes value; updates the displayed reminder time value in real-time"
    },
    {
      "id": "notificationSettings.includeTravelSwitch",
      "expected": "toggles appointment_reminder_with_travel boolean"
    },
    {
      "id": "notificationSettings.quietHoursSwitch",
      "expected": "toggles quiet_hours_enabled; shows/hides start and end time picker buttons below"
    },
    {
      "id": "notificationSettings.quietHoursStartButton",
      "expected": "opens time picker modal (iOS) or native time picker (Android) to set quiet_hours_start"
    },
    {
      "id": "notificationSettings.quietHoursEndButton",
      "expected": "opens time picker modal (iOS) or native time picker (Android) to set quiet_hours_end"
    },
    {
      "id": "notificationSettings.timePickerBackdrop",
      "expected": "closes the time picker modal without saving the selected time"
    },
    {
      "id": "notificationSettings.timePickerCancelButton",
      "expected": "closes the time picker modal without saving the selected time"
    },
    {
      "id": "notificationSettings.timePickerDoneButton",
      "expected": "closes the time picker modal after DateTimePicker onChange already committed the time to preferences"
    }
  ]
};
