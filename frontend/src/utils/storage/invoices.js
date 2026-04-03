import { supabase } from '../../lib/supabase';
import { getCurrentUserId, getCurrentUserContext } from './auth';
import { getSupervisorsForOwner } from './workers';

// ============================================================
// Invoice Management Functions
// ============================================================

/**
 * Create a standalone invoice (not from estimate)
 * @param {object} invoiceData - Invoice data
 * @returns {Promise<object|null>} Created invoice or null
 */
export const saveInvoice = async (invoiceData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        estimate_id: invoiceData.estimate_id || invoiceData.estimateId || null,
        project_id: invoiceData.project_id || invoiceData.projectId || null,
        client_name: invoiceData.client || invoiceData.clientName,
        client_phone: invoiceData.clientPhone || invoiceData.client_phone,
        client_email: invoiceData.clientEmail || invoiceData.client_email,
        client_address: invoiceData.clientAddress || invoiceData.client_address,
        project_name: invoiceData.projectName,
        items: invoiceData.items || [],
        subtotal: invoiceData.subtotal || 0,
        tax_rate: invoiceData.taxRate || 0,
        tax_amount: invoiceData.taxAmount || 0,
        total: invoiceData.total || 0,
        due_date: invoiceData.dueDate || invoiceData.due_date || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })(),
        payment_terms: invoiceData.paymentTerms || invoiceData.payment_terms || 'Net 30',
        notes: invoiceData.notes || '',
        status: 'unpaid'
      })
      .select('id, invoice_number, estimate_id, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, amount_paid, status, due_date, payment_terms, payment_method, paid_date, pdf_url, notes, created_at, updated_at, user_id')
      .single();

    if (error) {
      console.error('Error saving invoice:', error);
      return null;
    }

    // Record invoice pricing to history for AI learning
    if (invoiceData.items && invoiceData.items.length > 0) {
      try {
        const { savePricingHistory } = require('../../services/aiService');
        const { extractServiceType } = require('../../services/pricingIntelligence');

        for (const item of invoiceData.items) {
          if (item.total > 0 || (item.quantity && item.pricePerUnit)) {
            await savePricingHistory({
              serviceType: extractServiceType(item.description),
              workDescription: item.description,
              quantity: item.quantity,
              unit: item.unit,
              pricePerUnit: item.pricePerUnit,
              totalAmount: item.total || (item.quantity * item.pricePerUnit),
              sourceType: 'invoice',
              sourceId: data.id,
              projectName: invoiceData.projectName,
              isCorrection: false,
            });
          }
        }
      } catch (pricingErr) {
        console.warn('Failed to record invoice pricing:', pricingErr);
      }
    }

    return data;
  } catch (error) {
    console.error('Error in saveInvoice:', error);
    return null;
  }
};

/**
 * Fetch all invoices for current user
 * @param {object} filters - Optional filters (status, dateRange, etc.)
 * @returns {Promise<array>} Array of invoices
 */
export const fetchInvoices = async (filters = {}) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    let query = supabase
      .from('invoices')
      .select('id, invoice_number, client_name, project_name, status, due_date, items, total, amount_paid, created_at, user_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.clientName) {
      query = query.ilike('client_name', `%${filters.clientName}%`);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.error('Error fetching invoices:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchInvoices:', error);
    return [];
  }
};

/**
 * Fetch all invoices across all supervisors under this owner
 * Used by owner's AI chat to see company-wide invoice data
 * @param {object} filters - Optional filters (status, clientName)
 * @returns {Promise<array>} Invoices with supervisor info
 */
export const fetchInvoicesForOwner = async (filters = {}) => {
  try {
    const context = await getCurrentUserContext();
    if (!context) return [];

    // If not owner, fall back to regular fetchInvoices
    if (!context.isOwner) {
      return fetchInvoices(filters);
    }

    // Get all supervisors under this owner
    const supervisors = await getSupervisorsForOwner(context.userId);
    const supervisorIds = supervisors.map(s => s.id);
    const supervisorNames = Object.fromEntries(
      supervisors.map(s => [s.id, s.business_name || 'Supervisor'])
    );

    // Include owner's own invoices too
    const allIds = [context.userId, ...supervisorIds];

    let query = supabase
      .from('invoices')
      .select('id, invoice_number, client_name, project_name, status, due_date, items, total, amount_paid, created_at, user_id')
      .in('user_id', allIds)
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.clientName) {
      query = query.ilike('client_name', `%${filters.clientName}%`);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.error('Error fetching invoices for owner:', error);
      return [];
    }

    // Add supervisor attribution
    return (data || []).map(invoice => ({
      ...invoice,
      supervisor_name: invoice.user_id === context.userId
        ? 'You (Owner)'
        : (supervisorNames[invoice.user_id] || 'Unknown Supervisor'),
      supervisor_id: invoice.user_id,
    }));
  } catch (error) {
    console.error('Error in fetchInvoicesForOwner:', error);
    return [];
  }
};

/**
 * Get a single invoice by ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<object|null>} Invoice or null
 */
export const getInvoice = async (invoiceId) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, estimate_id, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, amount_paid, status, due_date, payment_terms, payment_method, paid_date, pdf_url, notes, created_at, updated_at, user_id')
      .eq('id', invoiceId)
      .single();

    if (error) {
      console.error('Error fetching invoice:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getInvoice:', error);
    return null;
  }
};

/**
 * Mark invoice as paid
 * @param {string} invoiceId - Invoice ID
 * @param {number} amount - Payment amount
 * @param {string} paymentMethod - Payment method ('cash', 'check', 'credit_card', etc.)
 * @returns {Promise<boolean>} Success status
 */
export const markInvoiceAsPaid = async (invoiceId, amount, paymentMethod = null) => {
  try {
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('total, amount_paid')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      console.error('Error fetching invoice:', fetchError);
      return false;
    }

    const newAmountPaid = (invoice.amount_paid || 0) + amount;
    const status = newAmountPaid >= invoice.total ? 'paid' : 'partial';

    const updateData = {
      amount_paid: newAmountPaid,
      status,
      payment_method: paymentMethod
    };

    if (status === 'paid') {
      updateData.paid_date = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId);

    if (updateError) {
      console.error('Error updating invoice payment:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in markInvoiceAsPaid:', error);
    return false;
  }
};

/**
 * Update invoice PDF URL
 * @param {string} invoiceId - Invoice ID
 * @param {string} pdfUrl - PDF URL from Supabase storage
 * @returns {Promise<boolean>} Success status
 */
export const updateInvoicePDF = async (invoiceId, pdfUrl) => {
  try {
    const { error } = await supabase
      .from('invoices')
      .update({ pdf_url: pdfUrl })
      .eq('id', invoiceId);

    if (error) {
      console.error('Error updating invoice PDF:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateInvoicePDF:', error);
    return false;
  }
};

/**
 * Update an existing invoice (amount, items, terms, etc.)
 * @param {string} invoiceId - Invoice ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
export const updateInvoice = async (invoiceId, updates) => {
  try {
    const userId = await getCurrentUserId();
    const { error } = await supabase
      .from('invoices')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
        ...(userId ? { updated_by: userId } : {}),
      })
      .eq('id', invoiceId);

    if (error) {
      console.error('Error updating invoice:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateInvoice:', error);
    return false;
  }
};

/**
 * Delete an invoice
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteInvoice = async (invoiceId) => {
  try {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId);

    if (error) {
      console.error('Error deleting invoice:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteInvoice:', error);
    return false;
  }
};

/**
 * Record a payment on an invoice
 * Automatically updates status based on amount_paid vs total
 * @param {string} invoiceId - Invoice ID
 * @param {number} paymentAmount - Amount being paid
 * @param {string} paymentMethod - Payment method
 * @param {string} paymentDate - Optional payment date
 * @returns {Promise<object|boolean>} Result object or false
 */
export const recordInvoicePayment = async (invoiceId, paymentAmount, paymentMethod = 'check', paymentDate = null) => {
  try {
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, total, amount_paid, status')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      console.error('Error fetching invoice:', fetchError);
      return false;
    }

    const currentAmountPaid = parseFloat(invoice.amount_paid || 0);
    const newAmountPaid = currentAmountPaid + parseFloat(paymentAmount);
    const total = parseFloat(invoice.total);

    let newStatus;
    if (newAmountPaid >= total) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'unpaid';
    }

    const updates = {
      amount_paid: newAmountPaid,
      status: newStatus,
      payment_method: paymentMethod,
    };

    if (newStatus === 'paid') {
      updates.paid_date = paymentDate || new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId);

    if (updateError) {
      console.error('Error recording payment:', updateError);
      return false;
    }

    return {
      success: true,
      newBalance: total - newAmountPaid,
      status: newStatus
    };
  } catch (error) {
    console.error('Error in recordInvoicePayment:', error);
    return false;
  }
};

/**
 * Void an invoice (set status to cancelled)
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<boolean>} Success status
 */
export const voidInvoice = async (invoiceId) => {
  try {
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', invoiceId);

    if (error) {
      console.error('Error voiding invoice:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in voidInvoice:', error);
    return false;
  }
};

/**
 * Update invoice template settings
 * @param {object} templateData - Template data to save
 * @returns {Promise<boolean>} Success status
 */
export const updateInvoiceTemplate = async (templateData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return false;
    }

    const { data: existing } = await supabase
      .from('invoice_template')
      .select('id')
      .eq('user_id', user.id)
      .single();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from('invoice_template')
        .update(templateData)
        .eq('user_id', user.id));
    } else {
      ({ error } = await supabase
        .from('invoice_template')
        .insert({
          ...templateData,
          user_id: user.id,
        }));
    }

    if (error) {
      console.error('Error updating invoice template:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateInvoiceTemplate:', error);
    return false;
  }
};

// ============================================================
// Accounts Receivable Aging
// ============================================================

/**
 * Fetch AR aging report — buckets unpaid invoices by days overdue
 * @returns {Promise<object>} Aging data grouped by client
 */
export const fetchAgingReport = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { clients: [], totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 } };

    // Get all supervisors' invoices too
    const context = await getCurrentUserContext();
    let allIds = [userId];
    if (context?.isOwner) {
      const supervisors = await getSupervisorsForOwner(userId);
      allIds = [userId, ...supervisors.map(s => s.id)];
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_name, project_name, total, amount_paid, status, due_date, created_at')
      .in('user_id', allIds)
      .in('status', ['unpaid', 'partial', 'overdue'])
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching aging data:', error);
      return { clients: [], totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 } };
    }

    const today = new Date();
    const clientMap = {};
    const totals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };

    (data || []).forEach((inv) => {
      const balance = parseFloat(inv.total || 0) - parseFloat(inv.amount_paid || 0);
      if (balance <= 0) return;

      const dueDate = inv.due_date ? new Date(inv.due_date + 'T12:00:00') : new Date(inv.created_at);
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

      let bucket;
      if (daysOverdue <= 0) bucket = 'current';
      else if (daysOverdue <= 30) bucket = 'days30';
      else if (daysOverdue <= 60) bucket = 'days60';
      else if (daysOverdue <= 90) bucket = 'days90';
      else bucket = 'over90';

      const clientName = inv.client_name || 'Unknown Client';
      if (!clientMap[clientName]) {
        clientMap[clientName] = { name: clientName, current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0, invoices: [] };
      }
      clientMap[clientName][bucket] += balance;
      clientMap[clientName].total += balance;
      clientMap[clientName].invoices.push({ ...inv, balance, daysOverdue, bucket });

      totals[bucket] += balance;
      totals.total += balance;
    });

    return {
      clients: Object.values(clientMap).sort((a, b) => b.total - a.total),
      totals,
    };
  } catch (error) {
    console.error('Error in fetchAgingReport:', error);
    return { clients: [], totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 } };
  }
};

// ============================================================
// Contract Document Functions
// ============================================================

/**
 * Fetch all contract documents for current user
 * @returns {Promise<Array>} Array of contract documents
 */
export const fetchContractDocuments = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('contract_documents')
      .select('id, file_name, file_url, file_path, file_type, created_at, user_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching contract documents:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchContractDocuments:', error);
    return [];
  }
};

/**
 * Upload contract document from chat
 * @param {string} fileUri - File URI
 * @param {string} fileName - File name
 * @param {string} fileType - 'image' or 'document'
 * @returns {Promise<object|null>} Uploaded document data or null
 */
export const uploadContractDocument = async (fileUri, fileName, fileType) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const fileExt = fileName ? fileName.split('.').pop() : 'jpg';
    const timestamp = Date.now();
    const filePath = `${userId}/${timestamp}.${fileExt}`;

    const response = await fetch(fileUri);
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from('contract-documents')
      .upload(filePath, blob, {
        contentType: fileType === 'image' ? 'image/jpeg' : 'application/pdf',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('contract-documents')
      .getPublicUrl(filePath);

    const { data: docData, error: dbError } = await supabase
      .from('contract_documents')
      .insert({
        user_id: userId,
        file_name: fileName || `Contract ${timestamp}`,
        file_url: publicUrl,
        file_path: filePath,
        file_type: fileType,
      })
      .select('id, file_name, file_url, file_path, file_type, created_at, user_id')
      .single();

    if (dbError) throw dbError;

    return docData;
  } catch (error) {
    console.error('Error uploading contract document:', error);
    return null;
  }
};
