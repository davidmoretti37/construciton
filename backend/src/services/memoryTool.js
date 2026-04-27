// Anthropic memory tool backend.
// Implements the 6 commands Claude calls (view, create, str_replace, insert,
// delete, rename) backed by Supabase. Per-tenant scoped — every user has their
// own /memories namespace, enforced server-side regardless of the path Claude
// claims to be writing to.
//
// Why this exists: the agent now has persistent file-based memory across
// sessions, replacing the `learnedFacts` blob hack. Claude views /memories
// at the start of every conversation and updates files as it learns. Future
// sessions for the same user see the accumulated knowledge automatically.

const { adminSupabase } = require('./userSupabaseClient');
const logger = require('../utils/logger');

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

async function viewDirectory(userId, path) {
  // List immediate children + grandchildren (2 levels), excluding hidden.
  const prefix = path === MEMORY_ROOT ? `${MEMORY_ROOT}/` : `${path}/`;
  const { data: rows } = await adminSupabase
    .from('agent_memories')
    .select('path, byte_size, is_directory')
    .eq('user_id', userId)
    .or(`path.eq.${path},path.like.${prefix}%`)
    .order('path', { ascending: true })
    .limit(500);
  if (!rows || rows.length === 0) {
    if (path === MEMORY_ROOT) {
      // Root always exists conceptually. Empty memory.
      return `Here're the files and directories up to 2 levels deep in ${MEMORY_ROOT}, excluding hidden items and node_modules:\n0B\t${MEMORY_ROOT}`;
    }
    return `The path ${path} does not exist. Please provide a valid path.`;
  }
  // Filter to depth 2 max relative to path.
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

async function getFile(userId, path) {
  const { data: row } = await adminSupabase
    .from('agent_memories')
    .select('path, content, is_directory')
    .eq('user_id', userId)
    .eq('path', path)
    .maybeSingle();
  return row || null;
}

async function bumpAccessed(userId, path) {
  await adminSupabase
    .from('agent_memories')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('path', path);
}

async function userFileCount(userId) {
  const { count } = await adminSupabase
    .from('agent_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count || 0;
}

// Public command dispatcher. `input` is the parsed `tool_use.input`.
async function runMemoryCommand(userId, input) {
  if (!userId || !input || typeof input !== 'object') {
    return 'Error: invalid memory tool invocation.';
  }
  try {
    switch (input.command) {
      case 'view': return await cmdView(userId, input);
      case 'create': return await cmdCreate(userId, input);
      case 'str_replace': return await cmdStrReplace(userId, input);
      case 'insert': return await cmdInsert(userId, input);
      case 'delete': return await cmdDelete(userId, input);
      case 'rename': return await cmdRename(userId, input);
      default: return `Error: unknown memory command "${input.command}".`;
    }
  } catch (err) {
    logger.error('[memoryTool] uncaught:', err);
    return 'Error: memory operation failed.';
  }
}

async function cmdView(userId, { path, view_range }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  // Try as file first; if absent, treat as directory listing.
  const row = await getFile(userId, v.path);
  if (row && !row.is_directory) {
    bumpAccessed(userId, v.path).catch(() => {});
    return fmtFileContents(v.path, row.content, view_range);
  }
  return viewDirectory(userId, v.path);
}

async function cmdCreate(userId, { path, file_text }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  if (typeof file_text !== 'string') {
    return 'Error: file_text must be a string.';
  }
  if (Buffer.byteLength(file_text, 'utf8') > MAX_FILE_BYTES) {
    return `Error: file exceeds maximum size of ${MAX_FILE_BYTES} bytes.`;
  }
  const existing = await getFile(userId, v.path);
  if (existing) return `Error: File ${v.path} already exists`;
  const count = await userFileCount(userId);
  if (count >= MAX_FILES_PER_USER) {
    return `Error: maximum number of memory files reached (${MAX_FILES_PER_USER}). Delete or consolidate before creating more.`;
  }
  const { error } = await adminSupabase.from('agent_memories').insert({
    user_id: userId, path: v.path, content: file_text, is_directory: false,
  });
  if (error) {
    logger.error('[memoryTool] create error:', error);
    return 'Error: could not create file.';
  }
  return `File created successfully at: ${v.path}`;
}

async function cmdStrReplace(userId, { path, old_str, new_str }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  const row = await getFile(userId, v.path);
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
    .eq('user_id', userId).eq('path', v.path);
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

async function cmdInsert(userId, { path, insert_line, insert_text }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  const row = await getFile(userId, v.path);
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
    .eq('user_id', userId).eq('path', v.path);
  if (error) {
    logger.error('[memoryTool] insert error:', error);
    return 'Error: could not edit file.';
  }
  return `The file ${v.path} has been edited.`;
}

async function cmdDelete(userId, { path }) {
  const v = normalizeAndValidatePath(path);
  if (v.error) return `Error: ${v.error}`;
  if (v.path === MEMORY_ROOT) {
    return 'Error: cannot delete the memory root.';
  }
  // Cascade: delete the file itself and any descendants.
  const prefix = `${v.path}/`;
  const { error } = await adminSupabase
    .from('agent_memories')
    .delete()
    .eq('user_id', userId)
    .or(`path.eq.${v.path},path.like.${prefix}%`);
  if (error) {
    logger.error('[memoryTool] delete error:', error);
    return 'Error: could not delete.';
  }
  return `Successfully deleted ${v.path}`;
}

async function cmdRename(userId, { old_path, new_path }) {
  const fromV = normalizeAndValidatePath(old_path);
  if (fromV.error) return `Error: ${fromV.error}`;
  const toV = normalizeAndValidatePath(new_path);
  if (toV.error) return `Error: ${toV.error}`;
  const existing = await getFile(userId, fromV.path);
  if (!existing) return `Error: The path ${fromV.path} does not exist`;
  const dest = await getFile(userId, toV.path);
  if (dest) return `Error: The destination ${toV.path} already exists`;
  const { error } = await adminSupabase
    .from('agent_memories')
    .update({ path: toV.path, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('path', fromV.path);
  if (error) {
    logger.error('[memoryTool] rename error:', error);
    return 'Error: could not rename.';
  }
  return `Successfully renamed ${fromV.path} to ${toV.path}`;
}

module.exports = { runMemoryCommand };
