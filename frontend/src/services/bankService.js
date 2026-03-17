/**
 * Bank Service
 * Handles all bank integration API calls to the backend via Teller.
 * All Teller operations go through the backend (tokens are server-side only).
 */

import { supabase } from '../lib/supabase';
import { EXPO_PUBLIC_BACKEND_URL } from '@env';
import logger from '../utils/logger';

const API_URL = EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

/**
 * Get the current auth token for API calls
 */
const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

/**
 * Fetch with authentication header
 */
const fetchWithAuth = async (endpoint, options = {}) => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = `${API_URL}${endpoint}`;
  logger.debug(`[BankService] ${options.method || 'GET'} ${endpoint}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `Request failed with status ${response.status}`;
      logger.error(`[BankService] Error: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      logger.error(`[BankService] Request timed out: ${endpoint}`);
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

// ============================================================
// BANK ACCOUNT MANAGEMENT
// ============================================================

/**
 * Get Teller Connect configuration (application_id, environment)
 */
export const getConnectConfig = async () => {
  return fetchWithAuth('/api/teller/connect-config');
};

/**
 * Create a Teller Connect session for in-app browser flow
 * Returns { sessionId, url } where url opens Teller Connect in SFSafariViewController
 */
export const getConnectSession = async () => {
  return fetchWithAuth('/api/teller/connect-session', { method: 'POST' });
};

/**
 * Save enrollment after Teller Connect success
 */
export const saveEnrollment = async (accessToken, enrollment) => {
  return fetchWithAuth('/api/teller/save-enrollment', {
    method: 'POST',
    body: JSON.stringify({ access_token: accessToken, enrollment }),
  });
};

/**
 * Get all connected bank accounts
 */
export const getConnectedAccounts = async () => {
  return fetchWithAuth('/api/teller/accounts');
};

/**
 * Disconnect a bank account
 */
export const disconnectAccount = async (accountId) => {
  return fetchWithAuth(`/api/teller/accounts/${accountId}`, {
    method: 'DELETE',
  });
};

/**
 * Trigger manual sync for an account
 */
export const syncAccount = async (accountId) => {
  return fetchWithAuth(`/api/teller/accounts/${accountId}/sync`, {
    method: 'POST',
  });
};

// ============================================================
// BANK TRANSACTIONS
// ============================================================

/**
 * Get bank transactions with filters
 */
export const getBankTransactions = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.match_status) params.append('match_status', filters.match_status);
  if (filters.bank_account_id) params.append('bank_account_id', filters.bank_account_id);
  if (filters.start_date) params.append('start_date', filters.start_date);
  if (filters.end_date) params.append('end_date', filters.end_date);
  if (filters.limit) params.append('limit', filters.limit);
  if (filters.offset) params.append('offset', filters.offset);

  const queryString = params.toString();
  return fetchWithAuth(`/api/teller/transactions${queryString ? `?${queryString}` : ''}`);
};

/**
 * Manually match a bank transaction to a project transaction
 */
export const matchBankTransaction = async (bankTxId, projectTxId) => {
  return fetchWithAuth(`/api/teller/transactions/${bankTxId}/match`, {
    method: 'PATCH',
    body: JSON.stringify({ project_transaction_id: projectTxId }),
  });
};

/**
 * Mark a bank transaction as ignored
 */
export const ignoreBankTransaction = async (bankTxId) => {
  return fetchWithAuth(`/api/teller/transactions/${bankTxId}/ignore`, {
    method: 'PATCH',
  });
};

/**
 * Assign an unmatched bank transaction to a project
 */
export const assignBankTransaction = async (bankTxId, projectId, category, description) => {
  return fetchWithAuth(`/api/teller/transactions/${bankTxId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, category, description }),
  });
};

/**
 * Bulk assign multiple transactions
 */
export const batchAssignTransactions = async (assignments) => {
  return fetchWithAuth('/api/teller/transactions/batch-assign', {
    method: 'POST',
    body: JSON.stringify({ assignments }),
  });
};

// ============================================================
// CSV UPLOAD
// ============================================================

/**
 * Upload and import a CSV bank statement
 */
export const uploadCSV = async (csvContent, fileName, institutionName) => {
  return fetchWithAuth('/api/teller/csv-upload', {
    method: 'POST',
    body: JSON.stringify({
      csv_content: csvContent,
      file_name: fileName,
      institution_name: institutionName,
    }),
  });
};

// ============================================================
// RECONCILIATION
// ============================================================

/**
 * Get reconciliation summary stats
 */
export const getReconciliationSummary = async (startDate, endDate) => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  const queryString = params.toString();
  return fetchWithAuth(`/api/teller/reconciliation-summary${queryString ? `?${queryString}` : ''}`);
};
