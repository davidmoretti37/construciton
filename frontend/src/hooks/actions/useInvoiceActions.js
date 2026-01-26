import { useCallback } from 'react';
import { Alert } from 'react-native';
import logger from '../../utils/logger';
import {
  createInvoiceFromEstimate,
  updateInvoice,
  deleteInvoice,
  recordInvoicePayment,
  voidInvoice,
  getInvoice,
  updateInvoicePDF,
  getUserProfile,
} from '../../utils/storage';
import {
  generateInvoicePDF,
  uploadInvoicePDF,
  previewInvoicePDF,
  shareInvoicePDF,
} from '../../utils/pdfGenerator';

/**
 * Hook for all invoice-related actions
 * @param {Object} options
 * @param {Function} options.addMessage - Function to add a message to chat
 * @param {Function} options.setMessages - Function to update messages state
 */
export default function useInvoiceActions({ addMessage, setMessages }) {

  const handleConvertToInvoice = useCallback(async (estimateData) => {
    try {
      const invoice = await createInvoiceFromEstimate(estimateData.id || estimateData.estimateId);
      if (invoice) {
        Alert.alert(
          'Invoice Created',
          `Invoice ${invoice.invoice_number} has been created from this estimate!`,
          [
            {
              text: 'OK',
              onPress: () => {
                const aiMessage = {
                  id: `ai-${Date.now()}`,
                  text: `✅ Invoice ${invoice.invoice_number} created successfully!`,
                  isUser: false,
                  visualElements: [
                    {
                      type: 'invoice-preview',
                      data: invoice
                    }
                  ],
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, aiMessage]);
              }
            }
          ]
        );
        return invoice;
      }
      return null;
    } catch (error) {
      logger.error('Error converting to invoice:', error);
      Alert.alert('Error', 'Failed to create invoice. Please try again.');
      return null;
    }
  }, [setMessages]);

  const handleGenerateInvoicePDF = useCallback(async (invoiceData) => {
    try {
      Alert.alert('Generating PDF', 'Please wait while we generate your invoice PDF...');

      const userProfile = await getUserProfile();
      const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);

      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;
      const publicUrl = await uploadInvoicePDF(pdfUri, invNumber);

      await updateInvoicePDF(invoiceData.id, publicUrl);

      const updatedInvoice = await getInvoice(invoiceData.id);

      Alert.alert(
        'PDF Generated',
        'Your invoice PDF has been generated successfully!',
        [
          {
            text: 'Share PDF',
            onPress: async () => {
              await shareInvoicePDF(pdfUri, invNumber);
            }
          },
          {
            text: 'View',
            onPress: () => {
              const aiMessage = {
                id: `ai-${Date.now()}`,
                text: `✅ PDF generated successfully for ${invNumber}!`,
                isUser: false,
                visualElements: [
                  {
                    type: 'invoice-preview',
                    data: updatedInvoice
                  }
                ],
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, aiMessage]);
            }
          }
        ]
      );
      return updatedInvoice;
    } catch (error) {
      logger.error('Error generating PDF:', error);
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
      return null;
    }
  }, [setMessages]);

  const handleDownloadInvoicePDF = useCallback(async (invoiceData) => {
    try {
      if (!invoiceData.pdf_url && !invoiceData.pdfUrl) {
        Alert.alert('No PDF', 'Please generate the PDF first.');
        return false;
      }

      const pdfUrl = invoiceData.pdf_url || invoiceData.pdfUrl;
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;

      await shareInvoicePDF(pdfUrl, invNumber);
      return true;
    } catch (error) {
      logger.error('Error downloading PDF:', error);
      Alert.alert('Error', 'Failed to download PDF. Please try again.');
      return false;
    }
  }, []);

  const handleSendInvoiceEmail = useCallback(async (invoiceData) => {
    try {
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;
      const pdfUrl = invoiceData.pdf_url || invoiceData.pdfUrl;

      if (!pdfUrl) {
        Alert.alert('No PDF', 'Please generate the PDF first before emailing.');
        return false;
      }

      const userProfile = await getUserProfile();
      const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);

      await shareInvoicePDF(pdfUri, invNumber);
      return true;
    } catch (error) {
      logger.error('Error sending invoice email:', error);
      Alert.alert('Error', 'Failed to send invoice. Please try again.');
      return false;
    }
  }, []);

  const handlePreviewInvoicePDF = useCallback(async (invoiceData) => {
    try {
      const userProfile = await getUserProfile();
      const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);

      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;
      const publicUrl = await uploadInvoicePDF(pdfUri, invNumber);

      if (invoiceData.id) {
        await updateInvoicePDF(invoiceData.id, publicUrl);
      }

      // Use local pdfUri instead of publicUrl to prevent exposing signed URL tokens
      await previewInvoicePDF(pdfUri, invNumber);
      return true;
    } catch (error) {
      logger.error('Error previewing PDF:', error);
      Alert.alert('Error', 'Failed to preview PDF. Please try again.');
      return false;
    }
  }, []);

  const handleShareInvoicePDF = useCallback(async (invoiceData) => {
    try {
      const userProfile = await getUserProfile();
      const invNumber = invoiceData.invoice_number || invoiceData.invoiceNumber;

      if (invoiceData.pdf_url || invoiceData.pdfUrl) {
        const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);
        await shareInvoicePDF(pdfUri, invNumber);
      } else {
        const pdfUri = await generateInvoicePDF(invoiceData, userProfile.businessInfo);
        const publicUrl = await uploadInvoicePDF(pdfUri, invNumber);

        if (invoiceData.id) {
          await updateInvoicePDF(invoiceData.id, publicUrl);
        }

        await shareInvoicePDF(pdfUri, invNumber);
      }
      return true;
    } catch (error) {
      logger.error('Error sharing invoice:', error);
      Alert.alert('Error', 'Failed to share invoice. Please try again.');
      return false;
    }
  }, []);

  const handleUpdateInvoice = useCallback(async (data) => {
    try {
      const { invoiceId, clientName, ...updates } = data;
      const success = await updateInvoice(invoiceId, updates);

      if (success) {
        addMessage(`✅ Updated invoice${clientName ? ' for ' + clientName : ''}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update invoice.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating invoice:', error);
      Alert.alert('Error', 'Failed to update invoice.');
      return false;
    }
  }, [addMessage]);

  const handleDeleteInvoice = useCallback(async (data) => {
    try {
      const { invoiceId, invoiceNumber } = data;
      const success = await deleteInvoice(invoiceId);

      if (success) {
        addMessage(`✅ Deleted invoice ${invoiceNumber || ''}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete invoice.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting invoice:', error);
      Alert.alert('Error', 'Failed to delete invoice.');
      return false;
    }
  }, [addMessage]);

  const handleRecordInvoicePayment = useCallback(async (data) => {
    try {
      const { invoiceId, clientName, paymentAmount, paymentMethod, paymentDate } = data;
      const result = await recordInvoicePayment(invoiceId, paymentAmount, paymentMethod, paymentDate);

      if (result && result.success) {
        const balanceMsg = result.newBalance > 0
          ? `Remaining balance: $${result.newBalance.toFixed(2)}`
          : 'Invoice paid in full';
        addMessage(`✅ Recorded $${paymentAmount} payment${clientName ? ' from ' + clientName : ''}. ${balanceMsg}`);
        return result;
      } else {
        Alert.alert('Error', 'Failed to record payment.');
        return null;
      }
    } catch (error) {
      logger.error('Error recording payment:', error);
      Alert.alert('Error', 'Failed to record payment.');
      return null;
    }
  }, [addMessage]);

  const handleVoidInvoice = useCallback(async (data) => {
    try {
      const { invoiceId, invoiceNumber } = data;
      const success = await voidInvoice(invoiceId);

      if (success) {
        addMessage(`✅ Voided invoice ${invoiceNumber || ''}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to void invoice.');
        return false;
      }
    } catch (error) {
      logger.error('Error voiding invoice:', error);
      Alert.alert('Error', 'Failed to void invoice.');
      return false;
    }
  }, [addMessage]);

  return {
    // Estimate to invoice conversion
    handleConvertToInvoice,

    // PDF operations
    handleGenerateInvoicePDF,
    handleDownloadInvoicePDF,
    handlePreviewInvoicePDF,
    handleShareInvoicePDF,
    handleSendInvoiceEmail,

    // Invoice CRUD
    handleUpdateInvoice,
    handleDeleteInvoice,

    // Payments
    handleRecordInvoicePayment,
    handleVoidInvoice,
  };
}
