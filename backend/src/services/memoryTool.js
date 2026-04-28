// Anthropic memory tool backend.
// Implements the 6 commands Claude calls (view, create, str_replace, insert,
// delete, rename) backed by Supabase.
//
// Scoping: memory is owned by the BUSINESS (the owner_id), not the
// individual auth user. Owner + their supervisors share the same
// /memories namespace because memory holds facts about how the
// business operates ("Lana is the supervisor", "default phases are
// demo/rough/finish") — facts that should be available to anyone
// working in that business. Each memory op resolves the auth user
// to their owner_id and operates on that namespace.
//
// Why this exists: the agent has persistent file-based memory across
// sessions, replacing the `learnedFacts` blob hack. Memory is
// auto-prefetched into the system prompt at request start, so the
// agent only writes to memory; reads happen via the prefetch.

const { adminSupabase } = require('./userSupabaseClient');
const logger = require('../utils/logger');

// Resolve auth user → owner of the business that user works for.
// Supervisor returns their parent owner; owner returns themselves.
// Cached briefly to avoid hammering profiles on every memory op.
const _ownerCache = new Map();
const _OWNER_CACHE_TTL_MS = 60_000;

async function resolveOwnerForMemory(authUserId) {
  if (!authUserId) return null;
  const cached = _ownerCache.get(authUserId);
  if (cached && Date.now() - cached.t < _OWNER_CACHE_TTL_MS) return cached.id;
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('id, role, owner_id')
    .eq('id', authUserId)
    .maybeSingle();
  const ownerId = profile?.role === 'supervisor' && profile?.owner_id
    ? profile.owner_id
    : authUserId;
  _ownerCache.set(authUserId, { id: ownerId, t: Date.now() });
  return ownerId;
}

const MEMORY_ROOT = '/memories';
const MAX_FILE_BYTES = 64 * 1024;        // 64 KB per file — keeps things lean
const MAX_FILES_PER_USER = 200;          // cap total file count
const MAX_VIEW_LINES = 999_999;

// Path traversal protection. The path Claude sends must:
//  - Start with /memories
//  - Resolve cleanly without `..` segments
//  - Not contain control chars, backslashes, or URL-encoded traversals
function normalizeAndValidatePath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return { error: 'Path must be a non-empty string.' };
  }
  if (rawPath.length > 512) {
    return { error: 'Path is too long.' };
  }
  if (/[\x00-\x1f\\]|%2e%2e|%2f%2e%2e/i.test(rawPath)) {
    return { error: 'Path contains forbidden characters.' };
  }
  // Collapse repeated slashes and resolve `.` segments. Reject `..`.
  const segments = rawPath.split('/').filter(s => s && s !== '.');
  if (segments.some(s => s === '..')) {
    return { error: 'Path traversal not allowed.' };
  }
  const normalized = '/' + segments.join('/');
  if (normalized !== MEMORY_ROOT && !normalized.startsWith(MEMORY_ROOT + '/')) {
    return { error: `Path must start with ${MEMORY_ROOT}.` };
  }
  return { path: normalized };
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

function fmtLineNumber(n) {
  return String(n).padStart(6, ' ');
}

function fmtFileContents(path, content, range = null) {
  const lines = content.split('\n');
  if (lines.length > MAX_VIEW_LINES) {
    return `File ${path} exceeds maximum line limit of ${MAX_VIEW_LINES} lines.`;
  }
  let start = 1;
  let end = lines.length;
  if (Array.isArray(range) && range.length === 2) {
    start = Math.max(1, range[0]);
    end = Math.min(lines.length, range[1]);
  }
  const header = `Here's the content of ${path} with line numbers:`;
  const body = lines.slice(start - 1, end).map((l, i) => `${fmtLineNumber(start + i)}\t${l}`).join('\n');
  return `${header}\n${body}`;
}

// All helpers below operate on owner_id, NOT auth user_id. The dispatcher
// resolves the auth user → owner before calling. This is what lets owner
// + supervisors share the same memory namespace.
async function viewDirectory(ownerId, path) {
  const prefix = path === MEMORY_ROOT ? `${MEMORY_ROOT}/` : `${path}/`;
  const { data: rows } = await adminSupabase
    .from('agent_memories')
    .select('path, byte_size, is_directory')
    .eq('owner_id', ownerId)
    .or(`path.eq.${path},path.like.${prefix}%`)
    .order('path', { ascending: true })
    .limit(500);
  if (!rows || rows.length === 0) {
    if (path === MEMORY_ROOT) {
      return `Here're the files and directories up to 2 levels deep in ${MEMORY_ROOT}, excluding hidden items and node_modules:\n0B\t${MEMORY_ROOT}`;
    }
    return `The path ${path} does not exist. Please provide a valid path.`;
  }
  const baseDepth = path.split('/').filter(Boolean).length;
  const visible = rows.filter(r => {
    const d = r.path.split('/').filter(Boolean).length;
    return d <= baseDepth + 2;
  });
  const rootSize = visible.reduce((s, r) => s + (r.byte_size || 0), 0);
  const lines = [
    `Here're the files and directories up to 2 levels deep in ${path}, excluding hidden items and node_modules:`,
    `${fmtSize(rootSize)}\t${path}`,
    ...visible
      .filter(r => r.path !== path)
      .map(r => `${fmtSize(r.byte_size || 0)}\t${r.path}`),
  ];
  return lines.join('\n');
}

async function getFile(ownerId, path) {
  const { data: row } = await adminSupabase
    .from('agent_memories')
    .select('path, content, is_directory')
    .eq('owner_id', ownerId)
    .eq('path', path)
    .maybeSingle();
  return row || null;
}

async function bumpAccessed(ownerId, path) {
  await adminSupabase
    .from('agent_memories')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('owner_id', ownerId)
    .eq('path', path);
}

async function ownerFileCount(ownerId) {
  const { count } = await adminSupabase
    .from('agent_memories')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId);
  return count || 0;
}

// Public command dispatcher. `input` is the parsed `tool_use.input`.
// authUserId is the auth user id from the chat session — could be the
// owner OR a supervisor under that owner. We resolve to ownerId once
// here and every helper operates on that shared business namespace.
async function runMemoryCommand(authUserId, input) {
  if (!authUserId || !input || typeof input !== 'object') {
    return 'Error: invalid memory tool invocation.';
  }
  try {
    const ownerId = await resolveOwnerForMemory(authUserId);
    if (!ownerId) return 'Error: could not resolve business owner.';
    // Track WHICH auth user wrote each row in the user_id column so we
    // can audit who taught the agent what (owner vs supervisor).
    switch (input.command) {
      case 'view':
        return 'Memory is auto-loaded into your system prompt at request start. Read the MEMORY section above; do not call view. Proceed with the user\'s actual request.';
      case 'create': return await cmdCreate(ownerId, authUserId, input);
      case 'str_replace': return await cmdStrReplace(ownerId, input);
      case 'insert': return await cmdInsert(ownerId, input);
      case 'delete': return await cmdDelete(ownerId, input);
      case 'rename': return await cmdRename(ownerId, input);
      default: return `Error: unknown memory command "${input.command}". Valid commands: create, str_replace, insert, delete, rename.`;
    }
  } catch (err) {
    logger.error('[memoryTool] uncaught:', err);
    return 'Error: memory operation failed.';
  }
}

async function cmdView(ownerId, { path, view_range }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  const row = await getFile(ownerId, v.path);
  if (row && !row.is_directory) {
    bumpAccessed(ownerId, v.path).catch(() => {});
    return fmtFileContents(v.path, row.content, view_range);
  }
  return viewDirectory(ownerId, v.path);
}

async function cmdCreate(ownerId, authorUserId, { path, file_text }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  if (typeof file_text !== 'string') {
    return 'Error: file_text must be a string.';
  }
  if (Buffer.byteLength(file_text, 'utf8') > MAX_FILE_BYTES) {
    return `Error: file exceeds maximum size of ${MAX_FILE_BYTES} bytes.`;
  }
  const existing = await getFile(ownerId, v.path);
  if (existing) return `Error: File ${v.path} already exists`;
  const count = await ownerFileCount(ownerId);
  if (count >= MAX_FILES_PER_USER) {
    return `Error: maximum number of memory files reached (${MAX_FILES_PER_USER}). Delete or consolidate before creating more.`;
  }
  const { error } = await adminSupabase.from('agent_memories').insert({
    owner_id: ownerId,
    user_id: authorUserId,  // audit: which user authored this row
    path: v.path,
    content: file_text,
    is_directory: false,
  });
  if (error) {
    logger.error('[memoryTool] create error:', error);
    return 'Error: could not create file.';
  }
  return `File created successfully at: ${v.path}`;
}

async function cmdStrReplace(ownerId, { path, old_str, new_str }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  const row = await getFile(ownerId, v.path);
  if (!row || row.is_directory) {
    return `Error: The path ${v.path} does not exist. Please provide a valid path.`;
  }
  if (typeof old_str !== 'string' || typeof new_str !== 'string') {
    return 'Error: old_str and new_str must be strings.';
  }
  const occurrences = row.content.split(old_str).length - 1;
  if (occurrences === 0) {
    return `No replacement was performed, old_str \`${old_str}\` did not appear verbatim in ${v.path}.`;
  }
  if (occurrences > 1) {
    const lines = row.content.split('\n');
    const matchLines = [];
    lines.forEach((l, i) => { if (l.includes(old_str)) matchLines.push(i + 1); });
    return `No replacement was performed. Multiple occurrences of old_str \`${old_str}\` in lines: ${matchLines.join(', ')}. Please ensure it is unique`;
  }
  const newContent = row.content.replace(old_str, new_str);
  if (Buffer.byteLength(newContent, 'utf8') > MAX_FILE_BYTES) {
    return `Error: result exceeds maximum file size of ${MAX_FILE_BYTES} bytes.`;
  }
  const { error } = await adminSupabase
    .from('agent_memories')
    .update({ content: newContent, updated_at: new Date().toISOString() })
    .eq('owner_id', ownerId).eq('path', v.path);
  if (error) {
    logger.error('[memoryTool] str_replace error:', error);
    return 'Error: could not edit file.';
  }
  // Snippet showing the area around the change.
  const idx = newContent.indexOf(new_str);
  const lineNo = newContent.slice(0, idx).split('\n').length;
  const snippetLines = newContent.split('\n');
  const start = Math.max(1, lineNo - 2);
  const end = Math.min(snippetLines.length, lineNo + 2);
  const snippet = snippetLines.slice(start - 1, end).map((l, i) => `${fmtLineNumber(start + i)}\t${l}`).join('\n');
  return `The memory file has been edited.\n${snippet}`;
}

async function cmdInsert(ownerId, { path, insert_line, insert_text }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  const row = await getFile(ownerId, v.path);
  if (!row || row.is_directory) {
    return `Error: The path ${v.path} does not exist`;
  }
  if (typeof insert_text !== 'string') {
    return 'Error: insert_text must be a string.';
  }
  const lines = row.content.split('\n');
  const n = lines.length;
  if (typeof insert_line !== 'number' || insert_line < 0 || insert_line > n) {
    return `Error: Invalid \`insert_line\` parameter: ${insert_line}. It should be within the range of lines of the file: [0, ${n}]`;
  }
  const before = lines.slice(0, insert_line);
  const after = lines.slice(insert_line);
  const newContent = [...before, insert_text.replace(/\n$/, ''), ...after].join('\n');
  if (Buffer.byteLength(newContent, 'utf8') > MAX_FILE_BYTES) {
    return `Error: result exceeds maximum file size of ${MAX_FILE_BYTES} bytes.`;
  }
  const { error } = await adminSupabase
    .from('agent_memories')
    .update({ content: newContent, updated_at: new Date().toISOString() })
    .eq('owner_id', ownerId).eq('path', v.path);
  if (error) {
    logger.error('[memoryTool] insert error:', error);
    return 'Error: could not edit file.';
  }
  return `The file ${v.path} has been edited.`;
}

async function cmdDelete(ownerId, { path }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  if (v.path === MEMORY_ROOT) {
    return 'Error: cannot delete the memory root.';
  }
  const prefix = `${v.path}/`;
  const { error } = await adminSupabase
    .from('agent_memories')
    .delete()
    .eq('owner_id', ownerId)
    .or(`path.eq.${v.path},path.like.${prefix}%`);
  if (error) {
    logger.error('[memoryTool] delete error:', error);
    return 'Error: could not delete.';
  }
  return `Successfully deleted ${v.path}`;
}

async function cmdRename(ownerId, { old_path, new_path }) {
  const fromV = normalizeAndValidatePath(old_path);
  if (fromV.error) return `Error: ${fromV.error}`;
  const toV = normalizeAndValidatePath(new_path);
  if (toV.error) return `Error: ${toV.error}`;
  const existing = await getFile(ownerId, fromV.path);
  if (!existing) return `Error: The path ${fromV.path} does not exist`;
  const dest = await getFile(ownerId, toV.path);
  if (dest) return `Error: The destination ${toV.path} already exists`;
  const { error } = await adminSupabase
    .from('agent_memories')
    .update({ path: toV.path, updated_at: new Date().toISOString() })
    .eq('owner_id', ownerId).eq('path', fromV.path);
  if (error) {
    logger.error('[memoryTool] rename error:', error);
    return 'Error: could not rename.';
  }
  return `Successfully renamed ${fromV.path} to ${toV.path}`;
}

// Server-side prefetch: read the BUSINESS's /memories (owner + all
// supervisors share) and return a compact prompt-ready string. Lets the
// agent skip the "view memory first" round-trip entirely — memory
// becomes injected context, not a tool the agent has to remember to call.
async function prefetchMemorySnapshot(authUserId) {
  if (!authUserId) return '';
  try {
    const ownerId = await resolveOwnerForMemory(authUserId);
    if (!ownerId) return '';
    const { data: rows } = await adminSupabase
      .from('agent_memories')
      .select('path, content, byte_size')
      .eq('owner_id', ownerId)
      .eq('is_directory', false)
      .order('last_accessed_at', { ascending: false })
      .limit(50);
    if (!rows || rows.length === 0) return '';
    const MAX_TOTAL_BYTES = 16 * 1024;
    const chunks = [];
    let bytes = 0;
    for (const r of rows) {
      const piece = `\n### ${r.path}\n${(r.content || '').slice(0, 2000)}\n`;
      const pieceBytes = Buffer.byteLength(piece, 'utf8');
      if (bytes + pieceBytes > MAX_TOTAL_BYTES) break;
      chunks.push(piece);
      bytes += pieceBytes;
      adminSupabase
        .from('agent_memories')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('owner_id', ownerId).eq('path', r.path)
        .then(() => {}, () => {});
    }
    if (chunks.length === 0) return '';
    return `\n## MEMORY (auto-loaded from prior conversations with this user)\n${chunks.join('')}\n`;
  } catch (err) {
    logger.warn('[memoryTool] prefetch failed:', err.message);
    return '';
  }
}

module.exports = { runMemoryCommand, prefetchMemorySnapshot };
