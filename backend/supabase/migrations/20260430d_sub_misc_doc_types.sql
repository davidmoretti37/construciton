-- Misc document types for sub-uploaded project files (contracts,
-- invoices, proposals, photos). These reuse compliance_documents
-- table + upload-blob endpoint, but have category='deliverable' so
-- the UI can render them in a separate section.

INSERT INTO compliance_doc_types (code, display_name_en, display_name_es, display_name_pt, category, country_code, has_expiry, description_md)
VALUES
  ('signed_contract', 'Signed contract',  'Contrato firmado',     'Contrato assinado',     'deliverable', 'US', false, 'Signed contract / agreement'),
  ('invoice_pdf',     'Invoice (PDF)',    'Factura (PDF)',        'Fatura (PDF)',          'deliverable', 'US', false, 'Invoice as a PDF document'),
  ('proposal',        'Proposal / quote', 'Propuesta / cotización','Proposta / orçamento', 'deliverable', 'US', false, 'Proposal or quote document'),
  ('change_order',    'Change order',     'Orden de cambio',      'Pedido de mudança',     'deliverable', 'US', false, 'Change order request'),
  ('work_photo',      'Work photo',       'Foto de trabajo',      'Foto de trabalho',      'deliverable', 'US', false, 'Photo of work in progress or completed'),
  ('other_doc',       'Other document',   'Otro documento',       'Outro documento',       'deliverable', 'US', false, 'Any other project-related file')
ON CONFLICT (code) DO NOTHING;
