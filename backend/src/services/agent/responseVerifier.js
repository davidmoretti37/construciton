/**
 * Response Verifier — deterministic claim-vs-trace check.
 *
 * The agent reliability sealing layer. Catches the "I sent the estimate"
 * failure mode where the agent claims an action happened without a
 * successful matching tool call.
 *
 * This is pure code. No LLM in the verify loop. The model's text either
 * passes through unchanged (clean) or gets rewritten deterministically
 * from the actual trace (lie or capability gap).
 *
 * Inputs:
 *   responseText        — the agent's final text
 *   executedToolCalls   — [{ name, args, result }] where result may
 *                          include `error` or `blocked`
 *   userMessage         — original user request (used for context only)
 *
 * Output:
 *   {
 *     passed: boolean,
 *     claims: [{ verb, raw_match, capability_label, satisfied, status,
 *                satisfied_by, tool_error }],
 *     mismatches: [...subset of claims where satisfied=false...],
 *     rewrite: string | null,        — truthful replacement if !passed
 *     capabilityGap: { detected, inferred_capability }
 *   }
 */

const CLAIM_RULES = [
  // Send / share / email / deliver
  {
    name: 'send',
    pattern: /\b(?:just\s+)?(?:sent|emailed|shared|messaged|delivered|forwarded)\s+(?:it|that|the|a|an|your|our|over)\b/i,
    tools: [
      /^share_document$/,
      /^send_/,
      /^email_/,
      /^share_/,
      /^request_signature$/,
      /^send_change_order$/,
      /^send_estimate$/,
      /^send_invoice$/,
      /^send_sms$/,
    ],
    capability_label: 'send/share',
  },
  // Create / add new entity
  {
    name: 'create',
    pattern: /\b(?:created|added|set\s+up|made|drafted|started|opened|registered)\s+(?:the|a|an|your|that|it|new)?\s*(?:new\s+)?(?:project|estimate|invoice|service\s*plan|appointment|client|customer|worker|employee|subcontractor|sub|expense|change\s*order|phase|task|visit|template|contract|reminder|note|user|account|location|trade|budget)/i,
    tools: [
      /^create_/,
      /^add_/,
      /^setup_/,
      /^draft_/,
      /^generate_estimate$/,
      /^generate_invoice$/,
      /^new_/,
      /^register_/,
    ],
    capability_label: 'create entity',
  },
  // Update / change / edit
  {
    name: 'update',
    pattern: /\b(?:updated|changed|edited|modified|adjusted|revised|amended)\s+(?:the|that|your|it|its|his|her)\b/i,
    tools: [/^update_/, /^edit_/, /^modify_/, /^set_/, /^change_/, /^revise_/],
    capability_label: 'update entity',
  },
  // Assign person/thing to entity
  {
    name: 'assign',
    pattern: /\b(?:assigned|added)\s+(?:\w+\s+)?(?:\w+\s+)?(?:to|on|onto)\s+(?:the|a|an|your|that)?\s*\w+/i,
    tools: [/^assign_/, /^add_.*_to_/, /^add_worker/, /^add_supervisor/, /^add_subcontractor/],
    capability_label: 'assign person',
  },
  // Unassign / remove from entity
  {
    name: 'unassign',
    pattern: /\b(?:unassigned|removed)\s+\w+\s+from\s+(?:the|a|an|your|that)?\s*\w+/i,
    tools: [/^unassign_/, /^remove_.*_from_/, /^remove_worker/, /^remove_supervisor/, /^remove_subcontractor/],
    capability_label: 'unassign person',
  },
  // Schedule / book appointment
  {
    name: 'schedule',
    pattern: /\b(?:scheduled|booked|set\s+up\s+(?:an?\s+)?(?:appointment|meeting|visit|call|event)|put\s+(?:it|that|him|her)\s+on\s+(?:the|your))\b/i,
    tools: [
      /^schedule_/,
      /^create_appointment/,
      /^create_calendar_event/,
      /^book_/,
      /^add_service_visit/,
      /^create_service_visit/,
      /^add_event/,
      /^calendar_/,
    ],
    capability_label: 'schedule appointment',
  },
  // Clock in/out
  {
    name: 'clock',
    pattern: /\b(?:clocked|punched|signed)\s+(?:in|out)\b/i,
    tools: [/^clock_in$/, /^clock_out$/, /^clock_/],
    capability_label: 'clock worker',
  },
  // Record financial entry (expense, transaction, payment, hours)
  {
    name: 'record',
    pattern: /\b(?:recorded|logged|saved|tracked|booked|noted)\s+(?:the|a|an|that|\$|the\s+\$)?\s*(?:payment|expense|transaction|cost|charge|receipt|hours|time|amount|deposit|payroll)/i,
    tools: [
      /^record_/,
      /^log_/,
      /^create_expense/,
      /^create_transaction/,
      /^create_invoice/,
      /^create_payment/,
      /^save_/,
      /^track_/,
    ],
    capability_label: 'record financial entry',
  },
  // Mark paid / payment
  {
    name: 'pay',
    pattern: /\b(?:marked\s+(?:as\s+)?paid|paid\s+(?:the|that|out)|recorded\s+(?:the\s+)?payment|received\s+(?:the\s+)?payment)\b/i,
    tools: [
      /^mark_.*paid$/,
      /^record_payment$/,
      /^update_invoice/,
      /^pay_invoice$/,
      /^create_payment/,
      /^receive_payment/,
    ],
    capability_label: 'record payment',
  },
  // Delete / void / cancel
  {
    name: 'delete',
    pattern: /\b(?:deleted|removed|voided|cancelled|canceled|killed|wiped)\s+(?:the|that|your|it)\b/i,
    tools: [/^delete_/, /^remove_/, /^void_/, /^cancel_/],
    capability_label: 'delete/void',
  },
  // Approve / sign / send for signature
  {
    name: 'approve',
    pattern: /\b(?:approved|signed|signed\s+off\s+on|got\s+(?:it|that)\s+signed|sent\s+(?:for|out\s+for)\s+(?:signature|signing))\b/i,
    tools: [/^approve_/, /^sign_/, /^request_signature$/, /^esign_/, /^send_for_signature/],
    capability_label: 'approve/sign',
  },
  // Convert (estimate -> invoice, lead -> project)
  {
    name: 'convert',
    pattern: /\b(?:converted|turned)\s+(?:the|that|your|it)\s+\w+\s+(?:into|to)\s+\w+/i,
    tools: [/^convert_/, /^promote_/, /^transform_/],
    capability_label: 'convert entity',
  },
  // Approve change order specifically
  {
    name: 'approve_co',
    pattern: /\b(?:approved|accepted|signed)\s+(?:the|that)\s+change\s*order\b/i,
    tools: [/^approve_change_order/, /^accept_change_order/, /^update_change_order/],
    capability_label: 'approve change order',
  },
];

// Phrases that indicate the agent ISN'T claiming completion (it's
// offering, asking, describing what it CAN'T do, or staging next steps).
// If any negation phrase appears within ±80 chars of the matched verb,
// we treat the match as non-claim and skip it.
const NEGATION_GUARDS = [
  /\b(?:can'?t|cannot|unable\s+to|haven'?t|will\s+not|won'?t|don'?t|do\s+not|didn'?t|did\s+not|couldn'?t|tried\s+to)\b/i,
  /\b(?:would\s+you\s+like|do\s+you\s+want|should\s+i|want\s+me\s+to|let\s+me\s+know|shall\s+i|may\s+i|need\s+(?:you\s+)?to|please)\b/i,
  /\b(?:i'?ll|i\s+will|i\s+can|i\s+could|going\s+to|about\s+to|ready\s+to|happy\s+to|able\s+to)\s+(?:send|create|update|assign|schedule|clock|record|mark|delete|approve|generate|book|email|share|convert|set\s+up|add|remove|void|cancel|pay|sign)/i,
  // Sequence markers — only fire when clearly a staging phrase, not when
  // "next" / "first" appear as adjectives ("next appointment", "first
  // project"). Requires either a comma, sentence start, or "I/we" after.
  /(?:^|[.!?\n]\s*)(?:before|first|next|then)\s+(?:i|we|i'?ll|we'?ll)\b/i,
  /\b(?:before|first|then)\s+(?:i|we|i'?ll|we'?ll)\s+(?:send|create|update|assign|schedule|clock|record|mark|delete|approve|generate|book|email|share|convert|add|remove|void|cancel|pay|sign)/i,
  /\b(?:to\s+(?:send|create|update|assign|schedule|clock|record|mark|delete|approve|generate|book|email|share|convert|add|remove|void|cancel|pay|sign))\b/i,
  /\b(?:if\s+you|once\s+you|when\s+you|after\s+you)\b/i,
  /\?\s*$/, // Whole sentence is a question
];

function isNegated(text, matchIndex, matchLength) {
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(text.length, matchIndex + matchLength + 80);
  const window = text.substring(start, end);

  // Find the sentence containing the match for a question-mark check
  const sentenceStart = Math.max(
    text.lastIndexOf('.', matchIndex),
    text.lastIndexOf('!', matchIndex),
    text.lastIndexOf('?', matchIndex),
    text.lastIndexOf('\n', matchIndex)
  );
  const sentenceEnd = (() => {
    let earliest = text.length;
    for (const ch of ['.', '!', '?', '\n']) {
      const idx = text.indexOf(ch, matchIndex);
      if (idx !== -1 && idx < earliest) earliest = idx;
    }
    return earliest;
  })();
  const sentence = text.substring(sentenceStart + 1, sentenceEnd + 1);
  if (sentence.trim().endsWith('?')) return true;

  return NEGATION_GUARDS.some((g) => g.test(window));
}

function extractClaims(text) {
  const claims = [];
  if (!text || typeof text !== 'string') return claims;
  for (const rule of CLAIM_RULES) {
    const re = new RegExp(rule.pattern.source, (rule.pattern.flags || '').replace('g', '') + 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      if (isNegated(text, m.index, m[0].length)) continue;
      claims.push({
        verb: rule.name,
        raw_match: m[0],
        expected_tools: rule.tools,
        capability_label: rule.capability_label,
        position: m.index,
      });
      // Anti-runaway: same rule won't match the same position twice
      if (re.lastIndex === m.index) re.lastIndex += 1;
    }
  }
  return claims;
}

function classifyToolStatus(result) {
  if (!result) return 'no_result';
  if (typeof result === 'string') return 'success'; // memory tool returns strings
  if (result.blocked) return 'blocked';
  if (result.error) return 'errored';
  return 'success';
}

function findSatisfyingTool(claim, executedToolCalls) {
  // Prefer a successful satisfying tool; if none, return the best non-success match
  // so we can tell the user why it failed.
  let fallback = null;
  for (const tc of executedToolCalls) {
    const name = tc.name || tc.tool || tc.function?.name;
    if (!name) continue;
    if (!claim.expected_tools.some((re) => re.test(name))) continue;
    const status = classifyToolStatus(tc.result);
    if (status === 'success') return { name, status, result: tc.result };
    if (!fallback) fallback = { name, status, result: tc.result };
  }
  return fallback;
}

function buildRewrite({ mismatches, annotatedClaims, executedToolCalls }) {
  const successful = annotatedClaims.filter((c) => c.satisfied);

  const successBits = successful.length
    ? `Here's what I actually did: ${[...new Set(successful.map((s) => s.raw_match.toLowerCase().trim()))].join('; ')}.`
    : '';

  const failureBits = mismatches.map((m) => {
    if (m.status === 'no_tool_called') {
      return `I can't ${m.capability_label} from here yet — that's not something I'm wired to do`;
    }
    if (m.status === 'tool_errored') {
      const errMsg = m.tool_error ? String(m.tool_error).slice(0, 240) : 'something went wrong';
      return `I tried to ${m.capability_label} (via ${m.satisfied_by || 'the relevant tool'}) but it failed: ${errMsg}`;
    }
    if (m.status === 'tool_blocked') {
      return `the ${m.capability_label} action is waiting on your confirmation`;
    }
    return `I couldn't ${m.capability_label}`;
  });

  const allMissing = mismatches.every((m) => m.status === 'no_tool_called');
  const suggestion = allMissing
    ? " You'll need to do this part manually for now — once it's done, let me know and I'll log it on the project."
    : '';

  const parts = [];
  if (successBits) parts.push(successBits);
  if (failureBits.length) parts.push(`But ${failureBits.join('; and ')}.`);
  if (suggestion) parts.push(suggestion);

  return parts.join(' ').trim() || "I wasn't able to complete that action — could you try rephrasing what you need?";
}

function verifyResponse({ responseText, executedToolCalls, userMessage }) {
  const safeCalls = Array.isArray(executedToolCalls) ? executedToolCalls : [];
  const claims = extractClaims(responseText);

  if (claims.length === 0) {
    return {
      passed: true,
      claims: [],
      mismatches: [],
      rewrite: null,
      capabilityGap: { detected: false, inferred_capability: null },
    };
  }

  const mismatches = [];
  const annotatedClaims = [];

  for (const claim of claims) {
    const match = findSatisfyingTool(claim, safeCalls);
    if (!match) {
      const m = { ...claim, status: 'no_tool_called', satisfied_by: null, satisfied: false };
      mismatches.push(m);
      annotatedClaims.push(m);
    } else if (match.status !== 'success') {
      const m = {
        ...claim,
        status: `tool_${match.status}`,
        satisfied_by: match.name,
        satisfied: false,
        tool_error: match.result?.error || null,
      };
      mismatches.push(m);
      annotatedClaims.push(m);
    } else {
      annotatedClaims.push({
        ...claim,
        status: 'success',
        satisfied_by: match.name,
        satisfied: true,
      });
    }
  }

  if (mismatches.length === 0) {
    return {
      passed: true,
      claims: annotatedClaims,
      mismatches: [],
      rewrite: null,
      capabilityGap: { detected: false, inferred_capability: null },
    };
  }

  // Strip expected_tools regexes from the payload — they don't serialize
  // to JSON cleanly and aren't useful downstream.
  const cleanClaim = (c) => {
    const { expected_tools, ...rest } = c;
    return rest;
  };

  const rewrite = buildRewrite({
    mismatches,
    annotatedClaims,
    executedToolCalls: safeCalls,
  });

  const allMissing = mismatches.every((m) => m.status === 'no_tool_called');
  const capabilityGap = allMissing
    ? {
        detected: true,
        inferred_capability: [...new Set(mismatches.map((m) => m.capability_label))].join(', '),
      }
    : { detected: false, inferred_capability: null };

  return {
    passed: false,
    claims: annotatedClaims.map(cleanClaim),
    mismatches: mismatches.map(cleanClaim),
    rewrite,
    capabilityGap,
  };
}

module.exports = {
  verifyResponse,
  extractClaims,
  CLAIM_RULES,
};
