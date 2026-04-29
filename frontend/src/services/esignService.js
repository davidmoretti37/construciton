import { API_URL } from '../config/api';
import { supabase } from '../lib/supabase';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export async function requestSignature({ documentType, documentId, signerName, signerEmail, signerPhone }) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/api/esign/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ documentType, documentId, signerName, signerEmail, signerPhone }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create signature request');
  return json;
}

export async function fetchSignatureStatus({ documentType, documentId }) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/api/esign/status/${documentType}/${documentId}`, { headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load signature status');
  return json;
}

export async function cancelSignatureRequest(signatureId) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/api/esign/cancel/${signatureId}`, {
    method: 'POST',
    headers,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to cancel signature request');
  return json;
}
