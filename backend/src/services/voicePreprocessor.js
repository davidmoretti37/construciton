// Voice transcript preprocessor.
// Service business owners use voice input heavily — driving between sites,
// hands-on-tools, or just preferring talk over typing. Voice transcripts
// have predictable failure modes the rest of the agent can't easily
// recover from on its own:
//
//   1. Self-corrections: "create a project for John, no I mean Karen"
//      → agent should use Karen, not John.
//   2. Long stacked-intent transcripts: 200-word brain dumps with multiple
//      actions stacked together → agent stalls trying to handle all at once.
//   3. Filler word noise ("um", "uh", "you know", "like").
//
// Rather than relying on prompt rules buried in a 7k-token system prompt
// the model might miss, we DETECT these patterns deterministically and
// inject focused handling instructions directly into the user message
// the planner sees. This is cheap (no extra LLM call) and high-impact.

const FILLER_RE = /\b(um|uh|uhh|er|erm|you know|like(?=\s)|i mean|kinda|sorta|basically)\b/gi;
const SELF_CORRECTION_RE = /\b(no(?:,)?\s+(?:i\s+(?:mean|meant|m\s+sorry)|wait|actually)|(?:i\s*['']?\s*m\s+sorry,?\s+(?:it'?s|the\s+(?:name|client)\s+is))|i\s+meant|wait,?\s+|actually,?\s+|hold on,?\s+)/i;
const ROLE_CORRECTION_RE = /\b(she['']?s\s+my\s+supervisor|he['']?s\s+my\s+supervisor|she['']?s\s+the\s+supervisor|he['']?s\s+the\s+supervisor|not\s+a\s+worker|is\s+my\s+supervisor)\b/i;
const VOICE_GIVEAWAY_RE = /\b(um|uh|uhh|you know)\b|\.\.\.|\b(yeah|so)\s+(?:i|we|the)\b/i;

const LONG_VOICE_THRESHOLD_WORDS = 80;

// Lightweight name-after-correction extractor. Looks for a name following
// "no I mean" / "I'm sorry it's [Name]" / "I meant [Name]" patterns and
// returns it. Conservative — falls back to null when uncertain.
function extractCorrectedReferent(msg) {
  // "no I'm sorry, the name is X" / "no I'm sorry it's X" / "I'm sorry, X"
  const sorryPattern = /(?:no,?\s+)?i['']?\s*m\s+sorry,?\s+(?:the\s+(?:name|client)\s+is\s+|it['']?s\s+(?:for\s+)?)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i;
  const m1 = msg.match(sorryPattern);
  if (m1 && m1[1]) return m1[1].trim();
  // "I meant X" / "no I mean X"
  const meantPattern = /\b(?:no,?\s+)?i\s+meant?\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i;
  const m2 = msg.match(meantPattern);
  if (m2 && m2[1]) return m2[1].trim();
  return null;
}

// Count words once cheaply.
function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

// Returns either null (no preprocessing needed) or an annotation string to
// prepend to the message before the planner / agent see it.
function annotateVoiceTranscript(rawMessage) {
  if (typeof rawMessage !== 'string' || !rawMessage) return null;
  const msg = rawMessage.trim();
  if (msg.length < 30) return null;  // too short to be a voice dump

  const hasFiller = FILLER_RE.test(msg);
  const hasSelfCorrection = SELF_CORRECTION_RE.test(msg);
  const hasRoleCorrection = ROLE_CORRECTION_RE.test(msg);
  const hasVoiceGiveaway = VOICE_GIVEAWAY_RE.test(msg);
  const words = wordCount(msg);
  const isLong = words >= LONG_VOICE_THRESHOLD_WORDS;

  // Reset global regex state so subsequent calls aren't affected.
  FILLER_RE.lastIndex = 0; VOICE_GIVEAWAY_RE.lastIndex = 0;

  const looksLikeVoice = hasFiller || hasSelfCorrection || hasVoiceGiveaway || (isLong && /[.,]\s/.test(msg) === false);
  if (!looksLikeVoice && !hasRoleCorrection) return null;

  const notes = [];

  if (hasSelfCorrection) {
    const corrected = extractCorrectedReferent(msg);
    if (corrected) {
      notes.push(`The user CORRECTED themselves mid-sentence. The actual referent is **${corrected}** — earlier names mentioned (before the correction) are NOT what the user wants. Act on "${corrected}", not on anything mentioned earlier.`);
    } else {
      notes.push(`The user CORRECTED themselves mid-sentence (used "no", "wait", "actually", or "I'm sorry"). Use the LATEST mentioned name/entity, not earlier ones.`);
    }
  }

  if (hasRoleCorrection) {
    notes.push(`The user clarified that the named person is a SUPERVISOR (not a worker). Use \`assign_supervisor\` if assigning, NOT \`assign_worker\`.`);
  }

  if (isLong) {
    notes.push(`This is a long voice transcript (${words} words). Multiple intents may be stacked. Identify the PRIMARY action the user wants RIGHT NOW (usually the first concrete request) and execute that. If secondary requests exist, address them in your response text but don't try to do everything in one tool call.`);
  }

  if (hasFiller) {
    notes.push(`Strip filler words ("um", "uh", "you know", "like", "I mean") mentally before parsing intent — they're noise from voice-to-text.`);
  }

  if (notes.length === 0) return null;

  return `[VOICE TRANSCRIPT PREPROCESSING — handle these signals]\n${notes.map(n => `- ${n}`).join('\n')}\n[END PREPROCESSING]\n\n`;
}

module.exports = { annotateVoiceTranscript };
