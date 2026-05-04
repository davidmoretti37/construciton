/**
 * Single source of truth for notification + alert tap routing.
 *
 * Both the in-app bell (NotificationsScreen) and the push notification
 * tap handler (NotificationContext) call this. Morning Brief / AlertsWidget
 * use a different shape but the deep-link helpers below are reused.
 *
 * Routing rules (in order):
 *   1. If notification.action_data.screen is set, trust it. Wrap tab-bar
 *      screens in MainTabs so navigate() actually mounts the tab.
 *   2. Otherwise, switch on notification.type for the Class B/C types
 *      whose action_data carries IDs but no `screen`.
 *   3. Default: open the Notifications list so the user always sees
 *      something — never a silent no-op.
 */

const TAB_SCREENS = new Set(['Home', 'Projects', 'Workers', 'Chat', 'More']);

function navTo(navigation, screen, params) {
  if (!screen) return;
  if (TAB_SCREENS.has(screen)) {
    navigation.navigate('MainTabs', { screen, params: params || undefined });
  } else {
    navigation.navigate(screen, params || undefined);
  }
}

export function routeForNotification(notification, navigation) {
  if (!notification || !navigation) return;
  const type = notification.type;
  const a = notification.action_data || {};

  // 1) Backend already specified a destination — trust it.
  if (a.screen) {
    navTo(navigation, a.screen, a.params);
    return;
  }

  // 2) Type-based map for Class B/C types (no `screen` field but IDs exist).
  switch (type) {
    case 'sub_bid_submitted':
      return navTo(navigation, 'BidResponseDetail', {
        bidRequestId: a.bid_request_id,
        bidId: a.bid_id,
      });

    case 'sub_bid_accepted':
    case 'sub_payment_received':
    case 'sub_invoice_paid':
    case 'sub_task_assigned':
    case 'project_doc_added':
      return navTo(navigation, 'SubEngagementDetail', {
        engagementId: a.engagement_id,
      });

    case 'sub_invoice_sent':
    case 'sub_invoice_received':
      return navTo(navigation, 'EngagementDetail', {
        engagement_id: a.engagement_id,
      });

    case 'sub_doc_expiring':
    case 'sub_doc_expired':
      // Best-effort. After the backend fix attaches sub_organization_id +
      // document_id, this opens the sub's compliance docs scoped to the
      // expiring one. Until then the IDs may be missing and we land on
      // the subs list.
      if (a.sub_organization_id) {
        return navTo(navigation, 'SubDetail', {
          subId: a.sub_organization_id,
          focusDocId: a.document_id,
        });
      }
      return navTo(navigation, 'Subcontractors');

    case 'appointment_reminder':
      // Land in Schedule with the event focused — NOT in Chat with an
      // AI prompt (the old behavior).
      return navTo(navigation, 'MainTabs', undefined) ||
        navigation.navigate('MainTabs', {
          screen: 'Home',
          params: { focusEventId: a.appointment_id || a.event_id },
        });

    case 'signature_declined':
      // Document-specific destination by documentType
      if (a.documentType === 'estimate' || a.document_type === 'estimate') {
        return navTo(navigation, 'EstimatesDetail', { estimateId: a.documentId || a.document_id });
      }
      if (a.documentType === 'invoice' || a.document_type === 'invoice') {
        return navTo(navigation, 'InvoicesDetail', { invoiceId: a.documentId || a.document_id });
      }
      if (a.documentType === 'change_order' || a.document_type === 'change_order') {
        return navTo(navigation, 'ChangeOrdersList', {
          changeOrderId: a.documentId || a.document_id,
        });
      }
      return navTo(navigation, 'Notifications');

    default:
      // Safe fallback — open the Notifications list. The user always
      // sees something rather than a silent no-op.
      return navTo(navigation, 'Notifications');
  }
}

/**
 * Used by Morning Brief / AlertsWidget — they don't have a notification
 * row, just a kind + ref_id + detail object. Mirrors the same destinations.
 */
export function routeForBriefItem(item, navigation) {
  if (!item || !navigation) return;
  switch (item.kind) {
    case 'forgotten_clock_out':
      return navTo(navigation, 'ClockOuts');
    case 'worker_silent':
      return navTo(navigation, 'WorkerDetailHistory', {
        worker: { id: item.ref_id, full_name: item.detail?.worker_name },
      });
    case 'budget_burn':
    case 'project_stale':
      return navTo(navigation, 'ProjectDetail', { projectId: item.ref_id });
    case 'invoice_overdue':
      return navTo(navigation, 'ARAging', {
        clientFilter: item.detail?.client_name || null,
      });
    default:
      return navTo(navigation, 'Notifications');
  }
}
