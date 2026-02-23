/**
 * Plaid Service
 * Handles all bank integration API calls to the backend.
 * All Plaid operations go through the backend (tokens are server-side only).
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
  logger.debug(`[PlaidService] ${options.method || 'GET'} ${endpoint}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || `Request failed with status ${response.status}`;
    logger.error(`[PlaidService] Error: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  return response.json();
};

// ============================================================
// BANK ACCOUNT MANAGEMENT
// ============================================================

/**
 * Create a Plaid Link token for connecting a bank account
 */
export const createLinkToken = async () => {
  return fetchWithAuth('/api/plaid/create-link-token', {
    method: 'POST',
  });
};

/**
 * Exchange Plaid public token after user connects bank
 */
export const exchangePublicToken = async (publicToken, metadata) => {
  return fetchWithAuth('/api/plaid/exchange-token', {
    method: 'POST',
    body: JSON.stringify({ public_token: publicToken, metadata }),
  });
};

/**
 * Get all connected bank accounts
 */
export const getConnectedAccounts = async () => {
  return fetchWithAuth('/api/plaid/accounts');
};

/**
 * Disconnect a bank account
 */
export const disconnectAccount = async (accountId) => {
  return fetchWithAuth(`/api/plaid/accounts/${accountId}`, {
    method: 'DELETE',
  });
};

/**
 * Trigger manual sync for an account
 */
export const syncAccount = async (accountId) => {
  return fetchWithAuth(`/api/plaid/accounts/${accountId}/sync`, {
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
  return fetchWithAuth(`/api/plaid/transactions${queryString ? `?${queryString}` : ''}`);
};

/**
 * Manually match a bank transaction to a project transaction
 */
export const matchBankTransaction = async (bankTxId, projectTxId) => {
  return fetchWithAuth(`/api/plaid/transactions/${bankTxId}/match`, {
    method: 'PATCH',
    body: JSON.stringify({ project_transaction_id: projectTxId }),
  });
};

/**
 * Mark a bank transaction as ignored
 */
export const ignoreBankTransaction = async (bankTxId) => {
  return fetchWithAuth(`/api/plaid/transactions/${bankTxId}/ignore`, {
    method: 'PATCH',
  });
};

/**
 * Assign an unmatched bank transaction to a project
 */
export const assignBankTransaction = async (bankTxId, projectId, category, description) => {
  return fetchWithAuth(`/api/plaid/transactions/${bankTxId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, category, description }),
  });
};

/**
 * Bulk assign multiple transactions
 */
export const batchAssignTransactions = async (assignments) => {
  return fetchWithAuth('/api/plaid/transactions/batch-assign', {
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
  return fetchWithAuth('/api/plaid/csv-upload', {
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
  return fetchWithAuth(`/api/plaid/reconciliation-summary${queryString ? `?${queryString}` : ''}`);
};
