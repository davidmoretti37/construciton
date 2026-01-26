import { useCallback } from 'react';
import { Alert } from 'react-native';
import logger from '../../utils/logger';
import {
  getUserProfile,
  updateBusinessInfo,
  updatePhaseTemplate,
  addServiceToTrade,
  removeServiceFromTrade,
  updateServicePricing,
  updateProfitMargin,
  saveSubcontractorQuote,
  updateSubcontractorQuote,
  deleteSubcontractorQuote,
  updateInvoiceTemplate,
} from '../../utils/storage';

/**
 * Hook for all settings and configuration actions
 * @param {Object} options
 * @param {Function} options.addMessage - Function to add a message to chat
 */
export default function useSettingsActions({ addMessage }) {

  const handleUpdateBusinessInfo = useCallback(async (data) => {
    try {
      const { field, value } = data;
      const userProfile = await getUserProfile();

      const updatedBusinessInfo = {
        ...(userProfile.businessInfo || {}),
        [field]: value
      };

      const success = await updateBusinessInfo(updatedBusinessInfo);
      if (success) {
        addMessage(`✅ Updated ${field} successfully`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update business information.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating business info:', error);
      Alert.alert('Error', 'Failed to update business information.');
      return false;
    }
  }, [addMessage]);

  const handleUpdatePhaseTemplate = useCallback(async (data) => {
    try {
      const { name, phases } = data;
      const userProfile = await getUserProfile();

      const existingTemplates = userProfile.phases_template || [];
      const existingIndex = existingTemplates.findIndex(t => t.name === name);

      let updatedTemplates;
      if (existingIndex !== -1) {
        updatedTemplates = [...existingTemplates];
        updatedTemplates[existingIndex] = { name, phases };
      } else {
        updatedTemplates = [...existingTemplates, { name, phases }];
      }

      const success = await updatePhaseTemplate(updatedTemplates);
      if (success) {
        const action = existingIndex !== -1 ? 'Updated' : 'Created';
        addMessage(`✅ ${action} phase template: ${name}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to save phase template.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating phase template:', error);
      Alert.alert('Error', 'Failed to save phase template.');
      return false;
    }
  }, [addMessage]);

  const handleAddService = useCallback(async (data) => {
    try {
      const { tradeId, serviceId, service } = data;
      const success = await addServiceToTrade(tradeId, serviceId, service);

      if (success) {
        addMessage(`✅ Added service: ${service.label} at $${service.price}/${service.unit}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to add service.');
        return false;
      }
    } catch (error) {
      logger.error('Error adding service:', error);
      Alert.alert('Error', 'Failed to add service.');
      return false;
    }
  }, [addMessage]);

  const handleUpdateServicePricing = useCallback(async (data) => {
    try {
      const { tradeId, serviceId, price, unit } = data;
      const success = await updateServicePricing(tradeId, serviceId, price, unit);

      if (success) {
        addMessage(`✅ Updated service pricing to $${price}${unit ? '/' + unit : ''}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update service pricing.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating service pricing:', error);
      Alert.alert('Error', 'Failed to update service pricing.');
      return false;
    }
  }, [addMessage]);

  const handleRemoveService = useCallback(async (data) => {
    try {
      const { tradeId, serviceId } = data;
      const success = await removeServiceFromTrade(tradeId, serviceId);

      if (success) {
        addMessage(`✅ Removed service from catalog`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to remove service.');
        return false;
      }
    } catch (error) {
      logger.error('Error removing service:', error);
      Alert.alert('Error', 'Failed to remove service.');
      return false;
    }
  }, [addMessage]);

  const handleUpdateProfitMargin = useCallback(async (data) => {
    try {
      const { margin } = data;
      const success = await updateProfitMargin(margin);

      if (success) {
        addMessage(`✅ Set profit margin to ${margin}%`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update profit margin.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating profit margin:', error);
      Alert.alert('Error', 'Failed to update profit margin.');
      return false;
    }
  }, [addMessage]);

  const handleAddSubcontractorQuote = useCallback(async (data) => {
    try {
      const { tradeId, company, contactName, phone, rate, unit, preferred } = data;

      const quoteData = {
        trade_id: tradeId,
        company,
        contact_name: contactName,
        phone,
        rate,
        unit,
        preferred: preferred || false
      };

      const quote = await saveSubcontractorQuote(quoteData);
      if (quote) {
        addMessage(`✅ Added ${company} as subcontractor ($${rate}/${unit})`);
        return quote;
      } else {
        Alert.alert('Error', 'Failed to add subcontractor.');
        return null;
      }
    } catch (error) {
      logger.error('Error adding subcontractor:', error);
      Alert.alert('Error', 'Failed to add subcontractor.');
      return null;
    }
  }, [addMessage]);

  const handleUpdateSubcontractorQuote = useCallback(async (data) => {
    try {
      const { quoteId, updates } = data;
      const success = await updateSubcontractorQuote(quoteId, updates);

      if (success) {
        addMessage(`✅ Updated subcontractor quote`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update subcontractor.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating subcontractor:', error);
      Alert.alert('Error', 'Failed to update subcontractor.');
      return false;
    }
  }, [addMessage]);

  const handleDeleteSubcontractorQuote = useCallback(async (data) => {
    try {
      const { quoteId, company } = data;
      const success = await deleteSubcontractorQuote(quoteId);

      if (success) {
        addMessage(`✅ Removed ${company || 'subcontractor'} from database`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete subcontractor.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting subcontractor:', error);
      Alert.alert('Error', 'Failed to delete subcontractor.');
      return false;
    }
  }, [addMessage]);

  const handleUpdateInvoiceTemplate = useCallback(async (data) => {
    try {
      const success = await updateInvoiceTemplate(data);

      if (success) {
        addMessage(`✅ Updated invoice template`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update invoice template.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating invoice template:', error);
      Alert.alert('Error', 'Failed to update invoice template.');
      return false;
    }
  }, [addMessage]);

  return {
    // Business info
    handleUpdateBusinessInfo,

    // Phase templates
    handleUpdatePhaseTemplate,

    // Services
    handleAddService,
    handleUpdateServicePricing,
    handleRemoveService,

    // Profit margin
    handleUpdateProfitMargin,

    // Subcontractors
    handleAddSubcontractorQuote,
    handleUpdateSubcontractorQuote,
    handleDeleteSubcontractorQuote,

    // Invoice template
    handleUpdateInvoiceTemplate,
  };
}
