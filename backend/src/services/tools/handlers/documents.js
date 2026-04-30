/**
 * Tool handlers — documents, e-sign, and document sharing.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError, crypto,
  validateUpload, requireSupervisorPermission, safeStorageKey,
  resolveProjectId,
} = require('./_shared');

const eSignService = require('../../eSignService');

const SIG_PERMISSION_BY_TYPE = {
  estimate: 'can_create_estimates',
  invoice: 'can_create_invoices',
  contract: null, // owner-only — no supervisor permission yet
};

async function share_document(userId, args) {
  const gate = await requireSupervisorPermission(userId, 'can_message_clients');
  if (gate) return gate;
  const { document_id, document_type, recipient_id, method } = args;

  // Fetch the document
  const table = document_type === 'estimate' ? 'estimates' : 'invoices';
  const { data: doc, error: docErr } = await supabase
    .from(table)
    .select('id, client_name, client_phone, client_email')
    .eq('id', document_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (docErr || !doc) return { error: `${document_type} not found` };

  // Determine best method
  let sendMethod = method;
  if (!sendMethod) {
    if (doc.client_phone) sendMethod = 'sms';
    else if (doc.client_email) sendMethod = 'email';
    else return { error: 'No contact method available. Client has no phone or email on file.' };
  }

  // Return info for the AI to generate the appropriate send action
  return {
    document: {
      id: doc.id,
      type: document_type,
      clientName: doc.client_name,
    },
    contact: {
      phone: doc.client_phone,
      email: doc.client_email,
    },
    recommendedMethod: sendMethod,
    // The AI should return the appropriate action (send-estimate-sms, send-estimate-whatsapp, etc.)
    suggestedAction: document_type === 'estimate'
      ? (sendMethod === 'whatsapp' ? 'send-estimate-whatsapp' : 'send-estimate-sms')
      : 'share-invoice-pdf',
  };
}


async function get_project_documents(userId, args) {
  const { project_id, category } = args;
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  let query = supabase
    .from('project_documents')
    .select('id, file_name, file_type, category, notes, visible_to_workers, created_at')
    .eq('project_id', resolved.id)
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('get_project_documents error:', error);
    return { error: 'Failed to fetch documents' };
  }

  return {
    documents: (data || []).map(d => ({
      id: d.id,
      fileName: d.file_name,
      fileType: d.file_type,
      category: d.category,
      notes: d.notes,
      visibleToWorkers: d.visible_to_workers,
      createdAt: d.created_at,
    })),
    count: (data || []).length,
  };
}

async function get_business_contracts(userId, args) {
  const { data, error } = await supabase
    .from('contract_documents')
    .select('id, file_name, file_url, file_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('get_business_contracts error:', error);
    return { error: 'Failed to fetch business contracts' };
  }

  if (!data || data.length === 0) {
    return { contracts: [], count: 0, message: 'No business contracts have been uploaded yet. You can upload contracts in Settings > Contracts.' };
  }

  return {
    contracts: data.map(d => ({
      id: d.id,
      fileName: d.file_name,
      fileUrl: d.file_url,
      fileType: d.file_type,
      uploadedAt: d.created_at,
    })),
    count: data.length,
  };
}


async function upload_project_document(userId, args) {
  const { project_id, category = 'general', visible_to_workers = false } = args;
  const attachments = args._attachments;

  if (!attachments || attachments.length === 0) {
    return { error: 'No files attached. Please attach files to your message and try again.' };
  }

  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  const uploaded = [];
  const failed = [];

  for (const att of attachments) {
    try {
      const fileName = att.name || `Document_${Date.now()}`;
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'bin';

      // Determine content type and file_type
      const mimeType = att.mimeType || 'application/octet-stream';
      const v = validateUpload({ ...att, mimeType });
      if (v) {
        failed.push({ fileName, error: v.error });
        continue;
      }
      let fileType = 'document';
      if (mimeType.startsWith('image/')) fileType = 'image';
      else if (mimeType === 'application/pdf' || fileExt === 'pdf') fileType = 'pdf';

      const filePath = safeStorageKey(`${userId}/${resolved.id}`, fileName);

      // Decode base64 and upload to Supabase storage
      const binaryString = Buffer.from(att.base64, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, binaryString, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        logger.error('Document upload error:', uploadError);
        failed.push({ fileName, error: 'upload failed' });
        continue;
      }

      // Create database record
      const { data: doc, error: dbError } = await supabase
        .from('project_documents')
        .insert({
          project_id: resolved.id,
          file_name: args.file_name || fileName,
          file_url: filePath,
          file_type: fileType,
          category,
          uploaded_by: userId,
          visible_to_workers,
        })
        .select('id, file_name, file_type, category')
        .single();

      if (dbError) {
        logger.error('Document DB insert error:', dbError);
        failed.push({ fileName, error: dbError.message });
        continue;
      }

      uploaded.push(doc);
    } catch (err) {
      logger.error('Document upload exception:', err);
      failed.push({ fileName: att.name, error: err.message });
    }
  }

  return {
    uploaded: uploaded.map(d => ({ id: d.id, fileName: d.file_name, fileType: d.file_type, category: d.category })),
    uploadedCount: uploaded.length,
    failedCount: failed.length,
    failed: failed.length > 0 ? failed : undefined,
  };
}

async function update_project_document(userId, args) {
  const { document_id, file_name, category, visible_to_workers } = args;
  if (!document_id) return { error: 'document_id is required' };

  // Verify ownership via project join
  const { data: doc, error: fetchError } = await supabase
    .from('project_documents')
    .select('id, project_id, projects!inner(user_id, assigned_supervisor_id)')
    .eq('id', document_id)
    .single();

  if (fetchError || !doc) return { error: 'Document not found' };
  if (doc.projects.user_id !== userId && doc.projects.assigned_supervisor_id !== userId) {
    return { error: 'You do not have permission to update this document' };
  }

  const updates = {};
  if (file_name !== undefined) updates.file_name = file_name;
  if (category !== undefined) updates.category = category;
  if (visible_to_workers !== undefined) updates.visible_to_workers = visible_to_workers;

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update. Provide file_name, category, or visible_to_workers.' };
  }

  const { data, error } = await supabase
    .from('project_documents')
    .update(updates)
    .eq('id', document_id)
    .select('id, file_name, file_type, category, visible_to_workers')
    .single();

  if (error) {
    logger.error('update_project_document error:', error);
    return { error: 'Failed to update document' };
  }

  return {
    document: {
      id: data.id,
      fileName: data.file_name,
      fileType: data.file_type,
      category: data.category,
      visibleToWorkers: data.visible_to_workers,
    },
    message: 'Document updated successfully',
  };
}

async function delete_project_document(userId, args) {
  const { document_id } = args;
  if (!document_id) return { error: 'document_id is required' };

  // Verify ownership and get file path
  const { data: doc, error: fetchError } = await supabase
    .from('project_documents')
    .select('id, file_url, file_name, projects!inner(user_id, assigned_supervisor_id)')
    .eq('id', document_id)
    .single();

  if (fetchError || !doc) return { error: 'Document not found' };
  if (doc.projects.user_id !== userId && doc.projects.assigned_supervisor_id !== userId) {
    return { error: 'You do not have permission to delete this document' };
  }

  // Delete from storage if it's a storage path (not a full URL)
  if (doc.file_url && !doc.file_url.startsWith('http')) {
    const { error: storageError } = await supabase.storage
      .from('project-documents')
      .remove([doc.file_url]);

    if (storageError) {
      logger.warn('Failed to delete file from storage:', storageError);
    }
  }

  // Delete database record
  const { error: deleteError } = await supabase
    .from('project_documents')
    .delete()
    .eq('id', document_id);

  if (deleteError) {
    logger.error('delete_project_document error:', deleteError);
    return { error: 'Failed to delete document' };
  }

  return { message: `Document "${doc.file_name}" deleted successfully` };
}

/**
 * Request a customer signature on an estimate, invoice, or contract.
 * Sends an email with a single-use signing link to the signer.
 */
async function request_signature(userId, args = {}) {
  const { document_type, document_id, signer_name, signer_email, signer_phone } = args;
  if (!document_type || !document_id) {
    return { error: 'document_type and document_id are required.' };
  }
  if (!['estimate', 'invoice', 'contract'].includes(document_type)) {
    return { error: 'document_type must be estimate, invoice, or contract.' };
  }

  const permKey = SIG_PERMISSION_BY_TYPE[document_type];
  if (permKey) {
    const perm = await requireSupervisorPermission(userId, permKey);
    if (perm) return perm;
  } else {
    // Contracts: owner only
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (prof?.role !== 'owner') {
      return { error: 'Only the owner can request contract signatures.' };
    }
  }

  const ownerId = await resolveOwnerId(userId);
  try {
    const result = await eSignService.createSignatureRequest({
      ownerId,
      documentType: document_type,
      documentId: document_id,
      signerName: signer_name,
      signerEmail: signer_email,
      signerPhone: signer_phone,
    });
    return {
      success: true,
      signature_id: result.signatureId,
      signing_url: result.signingUrl,
      expires_at: result.expiresAt,
      document_title: result.documentTitle,
      message: `Sent a signing link${signer_email ? ` to ${signer_email}` : ''}.`,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Check the latest signature status for a document.
 */
async function check_signature_status(userId, args = {}) {
  const { document_type, document_id } = args;
  if (!document_type || !document_id) {
    return { error: 'document_type and document_id are required.' };
  }
  const ownerId = await resolveOwnerId(userId);
  try {
    return await eSignService.getSignatureStatus({
      documentType: document_type,
      documentId: document_id,
      ownerId,
    });
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Cancel a pending signature request.
 */
async function cancel_signature_request(userId, args = {}) {
  const { signature_id } = args;
  if (!signature_id) return { error: 'signature_id is required.' };
  const ownerId = await resolveOwnerId(userId);
  try {
    return await eSignService.cancelSignatureRequest({ signatureId: signature_id, ownerId });
  } catch (err) {
    return { error: err.message };
  }
}


module.exports = {
  share_document,
  get_project_documents,
  get_business_contracts,
  upload_project_document,
  update_project_document,
  delete_project_document,
  request_signature,
  check_signature_status,
  cancel_signature_request,
};
