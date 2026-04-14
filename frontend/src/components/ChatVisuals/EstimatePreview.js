import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, TextInput, Alert, ActionSheetIOS, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { WebView } from 'react-native-webview';
import { shareEstimatePDF, emailEstimatePDF, generateEstimateHTML } from '../../utils/estimatePDF';
import { getUserProfile, getAverageWorkerRate } from '../../utils/storage';
import { recordPricingCorrection, extractServiceType } from '../../services/pricingIntelligence';

export default function EstimatePreview({ data, onAction }) {
  const { t } = useTranslation('chat');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(data);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newItemIndex, setNewItemIndex] = useState(null);
  const newItemRef = useRef(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');

  const {
    estimateNumber,
    client,
    clientName,
    clientPhone,
    client_phone,
    clientAddress,
    clientCity,
    clientState,
    clientZip,
    clientEmail,
    projectName,
    date,
    items = [],
    tasks = [],
    scope = {},
    subtotal = 0,
    profit = 0,
    total = 0,
    businessName,
    status,
    laborEstimate,
  } = isEditing ? editedData : data;

  // Fetch average worker rate for labor cost calculation
  const [workerRates, setWorkerRates] = useState({ daily: 0, hourly: 0, count: 0 });

  useEffect(() => {
    getAverageWorkerRate().then(setWorkerRates);
  }, []);

  // Auto-focus newly added line item
  useEffect(() => {
    if (newItemIndex !== null && newItemRef.current) {
      newItemRef.current.focus();
      setNewItemIndex(null);
    }
  }, [newItemIndex]);

  // Calculate estimated labor cost (use editedData when editing for real-time updates)
  const currentLaborEstimate = isEditing ? (editedData.laborEstimate || laborEstimate) : laborEstimate;
  const estimatedLaborCost = currentLaborEstimate && workerRates.daily > 0
    ? (currentLaborEstimate.workersNeeded || 0) * (currentLaborEstimate.daysNeeded || 0) * workerRates.daily
    : 0;

  // Extract client name - handle both string and object formats
  const displayClientName = clientName || (typeof client === 'string' ? client : client?.name) || null;

  // Get phone number from any possible field
  const phoneNumber = clientPhone || client_phone || client?.phone || data.phone;

  // Get email from any possible field
  const emailAddress = clientEmail || client?.email || data.email;

  // Format full client address
  const formatClientAddress = () => {
    const parts = [];
    if (clientAddress) parts.push(clientAddress);
    if (clientCity || clientState || clientZip) {
      const cityStateZip = [clientCity, clientState].filter(Boolean).join(', ');
      parts.push(clientZip ? `${cityStateZip} ${clientZip}` : cityStateZip);
    }
    return parts.join('\n') || '';
  };

  const displayClientAddress = formatClientAddress();

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Edit mode handlers
  const handleStartEdit = () => {
    setEditedData({ ...data });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedData(data);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    // Recalculate totals from line items - LINE ITEMS ARE SOURCE OF TRUTH
    const newItems = editedData.items || items;
    const newSubtotal = newItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);

    // Apply profit margin if it exists
    const profitMargin = editedData.profit && editedData.subtotal ? (editedData.profit / editedData.subtotal) : 0;
    const newProfit = profitMargin > 0 ? newSubtotal * profitMargin : 0;
    const newTotal = newSubtotal + newProfit;

    // Also update phase budgets proportionally if phases exist
    const newPhases = editedData.phases || data.phases || [];
    const oldTotal = editedData.subtotal || subtotal || 1;
    const ratio = newSubtotal / oldTotal;
    const updatedPhases = newPhases.map(phase => ({
      ...phase,
      budget: Math.round((parseFloat(phase.budget) || 0) * ratio)
    }));

    // Preserve the original estimate ID - this is critical for updates
    const estimateId = data.id || data.estimateId;

    const updatedData = {
      ...editedData,
      id: estimateId,
      estimateId: estimateId,
      items: newItems,
      phases: updatedPhases,
      subtotal: newSubtotal,
      profit: newProfit,
      total: newTotal
    };

    // Track price corrections for AI learning (compare original vs edited)
    try {
      const originalItems = data.items || [];
      for (let i = 0; i < newItems.length; i++) {
        const newItem = newItems[i];
        const originalItem = originalItems[i];

        // Check if price was changed
        if (originalItem && newItem.price !== originalItem.price) {
          const originalTotal = (originalItem.quantity || 0) * (originalItem.price || 0);
          const newTotal = (newItem.quantity || 0) * (newItem.price || 0);

          await recordPricingCorrection({
            originalSuggestion: originalTotal,
            finalPrice: newTotal,
            pricePerUnit: parseFloat(newItem.price) || 0,
            workDescription: newItem.description,
            serviceType: extractServiceType(newItem.description),
            quantity: newItem.quantity,
            unit: newItem.unit,
            sourceId: data.id || data.estimateId,
            projectName: projectName,
          });
        }
      }
    } catch (correctionErr) {
      console.warn('Failed to record price corrections:', correctionErr);
    }

    if (onAction) {
      onAction({ type: 'update-estimate', data: updatedData });
    }
    setIsEditing(false);
  };

  const handleUpdateLineItem = (index, field, value) => {
    const newItems = [...(editedData.items || items)];
    newItems[index] = { ...newItems[index], [field]: value };

    // Recalculate item total if quantity or price changed
    if (field === 'quantity' || field === 'price') {
      const quantity = parseFloat(newItems[index].quantity) || 0;
      const price = parseFloat(newItems[index].price) || 0;
      newItems[index].total = quantity * price;
    }

    // Recalculate overall totals when items change - always use line items as source of truth
    const newSubtotal = newItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    // Apply profit margin if it exists
    const profitMargin = editedData.profit && editedData.subtotal ? (editedData.profit / editedData.subtotal) : 0;
    const newProfit = profitMargin > 0 ? newSubtotal * profitMargin : 0;
    const newTotal = newSubtotal + newProfit;
    setEditedData({ ...editedData, items: newItems, subtotal: newSubtotal, profit: newProfit, total: newTotal });
  };

  const handleAddLineItem = () => {
    const newItems = [...(editedData.items || items)];
    const newItem = {
      index: newItems.length + 1,
      description: '',
      quantity: 1,
      unit: 'job',
      price: 0,
      total: 0
    };
    newItems.push(newItem);
    setEditedData({ ...editedData, items: newItems });
    setNewItemIndex(newItems.length - 1);
  };

  const handleRemoveLineItem = (index) => {
    const newItems = [...(editedData.items || items)];
    newItems.splice(index, 1);
    // Re-index remaining items
    newItems.forEach((item, idx) => {
      item.index = idx + 1;
    });
    // Recalculate totals when items change - always use line items as source of truth
    const newSubtotal = newItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    // Apply profit margin if it exists (preserve the percentage)
    const profitMargin = editedData.profit && editedData.subtotal ? (editedData.profit / editedData.subtotal) : 0;
    const newProfit = profitMargin > 0 ? newSubtotal * profitMargin : 0;
    const newTotal = newSubtotal + newProfit;
    setEditedData({ ...editedData, items: newItems, subtotal: newSubtotal, profit: newProfit, total: newTotal });
  };

  const handleUpdatePhase = (phaseIndex, field, value) => {
    const newPhases = [...(editedData.phases || phases)];
    newPhases[phaseIndex] = { ...newPhases[phaseIndex], [field]: value };
    setEditedData({ ...editedData, phases: newPhases });
  };

  // Task management handlers
  const handleUpdateTask = (phaseIndex, taskIndex, value) => {
    const newPhases = [...(editedData.phases || phases)];
    const newTasks = [...newPhases[phaseIndex].tasks];
    newTasks[taskIndex] = { ...newTasks[taskIndex], description: value };
    newPhases[phaseIndex] = { ...newPhases[phaseIndex], tasks: newTasks };
    setEditedData({ ...editedData, phases: newPhases });
  };

  const handleAddTask = (phaseIndex) => {
    const newPhases = [...(editedData.phases || phases)];
    const phase = newPhases[phaseIndex];
    const newTask = {
      id: Date.now().toString(),
      order: (phase.tasks?.length || 0) + 1,
      description: '',
      completed: false
    };
    newPhases[phaseIndex] = {
      ...phase,
      tasks: [...(phase.tasks || []), newTask]
    };
    setEditedData({ ...editedData, phases: newPhases });
  };

  const handleRemoveTask = (phaseIndex, taskIndex) => {
    const newPhases = [...(editedData.phases || phases)];
    const newTasks = [...newPhases[phaseIndex].tasks];
    newTasks.splice(taskIndex, 1);
    // Re-order remaining tasks
    newTasks.forEach((task, idx) => {
      task.order = idx + 1;
    });
    newPhases[phaseIndex] = { ...newPhases[phaseIndex], tasks: newTasks };
    setEditedData({ ...editedData, phases: newPhases });
  };

  // Scope update handler
  const handleUpdateScope = (field, value) => {
    const newScope = { ...(editedData.scope || scope), [field]: value };
    setEditedData({ ...editedData, scope: newScope });
  };

  // Client field update handler
  const handleUpdateClientField = (field, value) => {
    setEditedData({ ...editedData, [field]: value });
  };

  // Schedule update handlers
  const handleUpdatePhaseSchedule = (phaseIndex, field, value) => {
    const newSchedule = { ...(editedData.schedule || data.schedule || {}) };
    const newPhaseSchedule = [...(newSchedule.phaseSchedule || [])];
    newPhaseSchedule[phaseIndex] = { ...newPhaseSchedule[phaseIndex], [field]: value };
    newSchedule.phaseSchedule = newPhaseSchedule;
    setEditedData({ ...editedData, schedule: newSchedule });
  };

  const handleUpdateOverallSchedule = (field, value) => {
    const newSchedule = { ...(editedData.schedule || data.schedule || {}), [field]: value };
    setEditedData({ ...editedData, schedule: newSchedule });
  };

  // Date update handler
  const handleUpdateDate = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios'); // Keep open on iOS, close on Android
    if (selectedDate) {
      const formattedDate = selectedDate.toISOString().split('T')[0];
      setEditedData({ ...editedData, date: formattedDate });
    }
  };

  // Parse date string to Date object for picker
  const getDateValue = () => {
    const dateStr = isEditing ? (editedData.date || date) : date;
    if (!dateStr) return new Date();
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  // Labor estimate update handler
  const handleUpdateLaborEstimate = (field, value) => {
    setEditedData({
      ...editedData,
      laborEstimate: {
        ...(editedData.laborEstimate || laborEstimate || {}),
        [field]: value,
      },
    });
  };

  // Format estimate as text for sharing
  const formatEstimateText = () => {
    let text = `📋 ESTIMATE${estimateNumber ? ` ${estimateNumber}` : ''}\n`;
    if (businessName) {
      text += `${businessName}\n`;
    }
    text += `\n`;
    if (displayClientName) {
      text += `Client: ${displayClientName}\n`;
    }
    if (projectName) {
      text += `Project: ${projectName}\n`;
    }
    text += `Date: ${date}\n\n`;

    text += `SERVICES:\n`;
    items.forEach(item => {
      const cleanDescription = item.description?.replace(/^undefined\.\s*/i, '').trim() || item.description;
      text += `${item.index}. ${cleanDescription}\n`;
      const itemPrice = typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0);
      const itemTotal = typeof item.total === 'number' ? item.total : (parseFloat(item.total) || 0);
      text += `   ${item.quantity || 0} ${item.unit || 'unit'}${(item.quantity || 0) > 1 ? 's' : ''} × $${itemPrice.toFixed(2)} = $${itemTotal.toFixed(2)}\n`;
    });

    const totalAmount = typeof total === 'number' ? total : (parseFloat(total) || 0);
    text += `\nTOTAL: $${totalAmount.toFixed(2)}`;

    return text;
  };

  // Enrich estimate data with business info for PDF generation
  const getEnrichedEstimateData = async () => {
    try {
      const userProfile = await getUserProfile();
      const businessInfo = userProfile?.businessInfo || {};

      // Parse address into components if it's a single string
      let businessAddress = businessInfo.address || '';
      let businessCity = '';
      let businessState = '';
      let businessZip = '';

      // Try to parse "123 Main St, City, ST 12345" format
      if (businessAddress && businessAddress.includes(',')) {
        const parts = businessAddress.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          businessAddress = parts[0];
          // Last part might be "City, ST 12345" or "ST 12345"
          const lastPart = parts[parts.length - 1];
          const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)/);
          if (stateZipMatch) {
            businessState = stateZipMatch[1];
            businessZip = stateZipMatch[2];
            // City is what's left
            if (parts.length >= 3) {
              businessCity = parts[1];
            }
          } else if (parts.length >= 2) {
            businessCity = parts[1];
          }
        }
      }

      return {
        ...data,
        // Business info
        businessName: businessInfo.name || data.businessName || '',
        businessAddress: businessAddress,
        businessCity: businessCity,
        businessState: businessState,
        businessZip: businessZip,
        businessEmail: businessInfo.email || '',
        businessPhone: businessInfo.phone || '',
        businessLogo: businessInfo.logoUrl || businessInfo.logo || '',
        // Styling
        accentColor: businessInfo.accentColor || '#3B82F6',
        fontStyle: businessInfo.fontStyle || 'modern',
        // Client info - ensure proper mapping
        clientName: displayClientName,
        clientAddress: data.clientAddress || (typeof client === 'object' ? client?.address : '') || '',
        clientCity: data.clientCity || '',
        clientState: data.clientState || '',
        clientZip: data.clientZip || '',
        clientPhone: data.clientPhone || data.client_phone || (typeof client === 'object' ? client?.phone : '') || '',
        clientEmail: data.clientEmail || (typeof client === 'object' ? client?.email : '') || '',
        // Ship to (job site) - defaults to project address or client address
        shipToName: data.shipToName || displayClientName,
        shipToAddress: data.shipToAddress || data.projectAddress || data.clientAddress || (typeof client === 'object' ? client?.address : '') || '',
        shipToCity: data.shipToCity || data.clientCity || '',
        shipToState: data.shipToState || data.clientState || '',
        shipToZip: data.shipToZip || data.clientZip || '',
      };
    } catch (error) {
      console.error('Error getting business info:', error);
      return data;
    }
  };

  const handleShare = async () => {
    try {
      // Get enriched data with business info
      const enrichedData = await getEnrichedEstimateData();

      if (Platform.OS === 'ios') {
        // iOS: Show action sheet with options
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Share PDF', 'Email PDF'],
            cancelButtonIndex: 0,
          },
          async (buttonIndex) => {
            if (buttonIndex === 1) {
              // Share PDF
              await shareEstimatePDF(enrichedData);
            } else if (buttonIndex === 2) {
              // Email PDF
              const clientEmail = typeof client === 'object' ? client?.email : null;
              await emailEstimatePDF(enrichedData, clientEmail);
            }
          }
        );
      } else {
        // Android: Show alert with options
        Alert.alert(
          'Share Estimate',
          'How would you like to send this estimate?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Share PDF',
              onPress: async () => await shareEstimatePDF(enrichedData)
            },
            {
              text: 'Email PDF',
              onPress: async () => {
                const clientEmail = typeof client === 'object' ? client?.email : null;
                await emailEstimatePDF(enrichedData, clientEmail);
              }
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error sharing estimate:', error);
      Alert.alert('Error', 'Failed to share estimate. Please try again.');
    }
  };

  const handlePreview = async () => {
    try {
      const enrichedData = await getEnrichedEstimateData();
      const html = generateEstimateHTML(enrichedData);
      setPreviewHTML(html);
      setShowPreview(true);
    } catch (error) {
      console.error('Error previewing estimate:', error);
      Alert.alert('Error', 'Failed to preview estimate. Please try again.');
    }
  };

  const handleEdit = () => {
    if (onAction) {
      onAction({ label: 'Edit', type: 'edit-estimate', data });
    }
  };

  const handleConvertToInvoice = () => {
    if (onAction) {
      onAction({ label: 'Convert to Invoice', type: 'convert-estimate-to-invoice', data });
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'draft':
        return '#9CA3AF'; // Gray
      case 'sent':
        return '#3B82F6'; // Blue
      case 'viewed':
        return '#8B5CF6'; // Purple
      case 'accepted':
        return '#22C55E'; // Green
      case 'rejected':
        return '#EF4444'; // Red
      case 'expired':
        return '#F59E0B'; // Orange
      default:
        return Colors.secondaryText;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'draft':
        return 'document-outline';
      case 'sent':
        return 'send-outline';
      case 'viewed':
        return 'eye-outline';
      case 'accepted':
        return 'checkmark-circle';
      case 'rejected':
        return 'close-circle';
      case 'expired':
        return 'time-outline';
      default:
        return 'document-outline';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            📋 ESTIMATE
          </Text>
          {estimateNumber && (
            <Text style={[styles.estimateNumber, { color: Colors.primaryBlue }]}>
              {estimateNumber}
            </Text>
          )}
          {businessName && (
            <Text style={[styles.businessName, { color: Colors.secondaryText }]}>
              {businessName}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {!isEditing && !status && (
            <TouchableOpacity
              style={[styles.editIconButton, { backgroundColor: Colors.primaryBlue + '15' }]}
              onPress={handleStartEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={20} color={Colors.primaryBlue} />
            </TouchableOpacity>
          )}
          {status && (
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '15', borderColor: getStatusColor() }]}>
              <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()} />
              <Text style={[styles.statusText, { color: getStatusColor() }]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Client Info */}
      <View style={[styles.section, { borderTopColor: Colors.border }]}>
        {(displayClientName || isEditing) && (
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('estimate.client')}</Text>
            {isEditing ? (
              <TextInput
                style={[styles.editInput, styles.value, { color: Colors.primaryText, borderColor: Colors.border }]}
                value={editedData.clientName || displayClientName || ''}
                onChangeText={(value) => handleUpdateClientField('clientName', value)}
                placeholder={t('estimate.clientName')}
                placeholderTextColor={Colors.secondaryText}
              />
            ) : (
              <Text style={[styles.value, { color: Colors.primaryText }]}>{displayClientName}</Text>
            )}
          </View>
        )}
        {projectName && (
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('estimate.project')}</Text>
            <Text style={[styles.value, { color: Colors.primaryText }]}>{projectName}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('estimate.date')}</Text>
          {isEditing ? (
            <TouchableOpacity
              style={[styles.datePickerButton, { borderColor: Colors.border }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.value, { color: Colors.primaryText }]}>
                {formatDate(editedData.date || date)}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={Colors.primaryBlue} />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.value, { color: Colors.primaryText }]}>{formatDate(date)}</Text>
          )}
        </View>

        {/* Date Picker */}
        {showDatePicker && (
          <DateTimePicker
            value={getDateValue()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleUpdateDate}
          />
        )}

        {/* Client Address */}
        {(displayClientAddress || isEditing) && (
          <>
            <View style={[styles.addressDivider, { borderTopColor: Colors.border }]} />
            <Text style={[styles.addressSectionLabel, { color: Colors.secondaryText }]}>{t('estimate.billTo')}</Text>
            {isEditing ? (
              <View style={styles.addressEditContainer}>
                <TextInput
                  style={[styles.editInput, { color: Colors.primaryText, borderColor: Colors.border, marginBottom: Spacing.xs }]}
                  value={editedData.clientAddress || clientAddress || ''}
                  onChangeText={(value) => handleUpdateClientField('clientAddress', value)}
                  placeholder={t('estimate.streetAddress')}
                  placeholderTextColor={Colors.secondaryText}
                />
                <View style={styles.addressRow}>
                  <TextInput
                    style={[styles.editInput, styles.cityInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                    value={editedData.clientCity || clientCity || ''}
                    onChangeText={(value) => handleUpdateClientField('clientCity', value)}
                    placeholder={t('estimate.city')}
                    placeholderTextColor={Colors.secondaryText}
                  />
                  <TextInput
                    style={[styles.editInput, styles.stateInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                    value={editedData.clientState || clientState || ''}
                    onChangeText={(value) => handleUpdateClientField('clientState', value)}
                    placeholder={t('estimate.state')}
                    placeholderTextColor={Colors.secondaryText}
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                  <TextInput
                    style={[styles.editInput, styles.zipInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                    value={editedData.clientZip || clientZip || ''}
                    onChangeText={(value) => handleUpdateClientField('clientZip', value)}
                    placeholder={t('estimate.zip')}
                    placeholderTextColor={Colors.secondaryText}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
              </View>
            ) : (
              <Text style={[styles.addressText, { color: Colors.primaryText }]}>
                {displayClientAddress}
              </Text>
            )}
          </>
        )}

        {/* Client Phone */}
        {(phoneNumber || isEditing) && (
          <View style={[styles.infoRow, { marginTop: Spacing.sm }]}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('estimate.phone')}</Text>
            {isEditing ? (
              <TextInput
                style={[styles.editInput, styles.value, { color: Colors.primaryText, borderColor: Colors.border }]}
                value={editedData.clientPhone || phoneNumber || ''}
                onChangeText={(value) => handleUpdateClientField('clientPhone', value)}
                placeholder={t('estimate.phoneFormat')}
                placeholderTextColor={Colors.secondaryText}
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={[styles.value, { color: Colors.primaryText }]}>{phoneNumber}</Text>
            )}
          </View>
        )}

        {/* Client Email */}
        {(emailAddress || isEditing) && (
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('estimate.email')}</Text>
            {isEditing ? (
              <TextInput
                style={[styles.editInput, styles.value, { color: Colors.primaryText, borderColor: Colors.border }]}
                value={editedData.clientEmail || emailAddress || ''}
                onChangeText={(value) => handleUpdateClientField('clientEmail', value)}
                placeholder={t('estimate.emailFormat')}
                placeholderTextColor={Colors.secondaryText}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <Text style={[styles.value, { color: Colors.primaryText }]}>{emailAddress}</Text>
            )}
          </View>
        )}
      </View>

      {/* Scope Summary */}
      {scope && scope.description && (
        <View style={[styles.section, { borderTopColor: Colors.border, backgroundColor: Colors.primaryBlue + '08' }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('estimate.scope')}</Text>
          {isEditing ? (
            <TextInput
              style={[styles.editInput, styles.scopeText, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={scope.description}
              onChangeText={(value) => handleUpdateScope('description', value)}
              placeholder={t('estimate.scopeDescription')}
              placeholderTextColor={Colors.secondaryText}
              multiline
              numberOfLines={3}
            />
          ) : (
            <Text style={[styles.scopeText, { color: Colors.primaryText }]}>{scope.description}</Text>
          )}
          {scope.complexity && (
            <View style={styles.complexityBadge}>
              <Text style={[styles.complexityText, { color: Colors.secondaryText }]}>
                {t('estimate.complexity')} <Text style={{ fontWeight: '600' }}>{scope.complexity}</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Tasks Section (flat list) */}
      {tasks && tasks.length > 0 && (
        <View style={[styles.section, { borderTopColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('estimate.tasks')}</Text>
          {tasks.map((task, index) => (
            <View key={index} style={styles.taskRow}>
              <Ionicons name="checkbox-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.taskText, { color: Colors.primaryText }]}>
                {task.description}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Line Items */}
      <View style={[styles.section, { borderTopColor: Colors.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('estimate.services')}</Text>
          {isEditing && (
            <TouchableOpacity
              onPress={handleAddLineItem}
              style={[styles.addItemButton, { backgroundColor: Colors.primaryBlue + '15', borderColor: Colors.primaryBlue }]}
            >
              <Ionicons name="add" size={16} color={Colors.primaryBlue} />
              <Text style={[styles.addItemText, { color: Colors.primaryBlue }]}>{t('estimate.addService')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {items.map((item, index) => (
          <View key={index} style={styles.lineItem}>
            <View style={styles.itemHeader}>
              <Text style={[styles.itemNumber, { color: Colors.secondaryText }]}>
                {item.index || index + 1}.
              </Text>
              {isEditing ? (
                <>
                  <TextInput
                    ref={index === newItemIndex ? newItemRef : undefined}
                    style={[styles.editInput, styles.itemDescription, { color: Colors.primaryText, borderColor: Colors.border }]}
                    value={item.description?.replace(/^undefined\.\s*/i, '') || item.description}
                    onChangeText={(value) => handleUpdateLineItem(index, 'description', value)}
                    placeholder={t('estimate.itemDescription')}
                    placeholderTextColor={Colors.secondaryText}
                  />
                  <TouchableOpacity
                    onPress={() => handleRemoveLineItem(index)}
                    style={styles.removeItemButton}
                  >
                    <Ionicons name="close-circle" size={22} color="#EF4444" />
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={[styles.itemDescription, { color: Colors.primaryText }]}>
                  {item.description?.replace(/^undefined\.\s*/i, '').trim() || item.description}
                </Text>
              )}
            </View>
            <View style={styles.itemDetails}>
              {isEditing ? (
                <View style={styles.editableItemDetails}>
                  <TextInput
                    style={[styles.editInputSmall, { color: Colors.primaryText, borderColor: Colors.border }]}
                    value={item.quantity?.toString()}
                    onChangeText={(value) => handleUpdateLineItem(index, 'quantity', value)}
                    keyboardType="numeric"
                    placeholder="Qty"
                  />
                  <Text style={[styles.itemCalc, { color: Colors.secondaryText }]}>× $</Text>
                  <TextInput
                    style={[styles.editInputSmall, { color: Colors.primaryText, borderColor: Colors.border }]}
                    value={item.price?.toString()}
                    onChangeText={(value) => handleUpdateLineItem(index, 'price', value)}
                    keyboardType="decimal-pad"
                    placeholder="Price"
                  />
                </View>
              ) : (
                <Text style={[styles.itemCalc, { color: Colors.secondaryText }]}>
                  {item.quantity} {item.unit || 'unit'}{item.quantity > 1 ? 's' : ''} × ${(parseFloat(item.price) || 0).toFixed(2)}
                </Text>
              )}
              <Text style={[styles.itemTotal, { color: Colors.primaryText }]}>
                ${(parseFloat(item.total) || 0).toFixed(2)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Cost Breakdown */}
      {profit > 0 ? (
        <View style={[styles.costBreakdown, { borderColor: Colors.border }]}>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: Colors.secondaryText }]}>{t('estimate.servicesTotal')}</Text>
            <Text style={[styles.breakdownValue, { color: Colors.primaryText }]}>
              ${typeof subtotal === 'number' ? subtotal.toFixed(2) : (parseFloat(subtotal) || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: Colors.secondaryText }]}>
              Profit ({((profit / subtotal) * 100).toFixed(0)}%)
            </Text>
            <Text style={[styles.breakdownValue, { color: Colors.green }]}>
              ${typeof profit === 'number' ? profit.toFixed(2) : (parseFloat(profit) || 0).toFixed(2)}
            </Text>
          </View>
          <View style={[styles.totalSection, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue, marginTop: Spacing.sm }]}>
            <Text style={[styles.totalLabel, { color: Colors.primaryText }]}>{t('estimate.contractTotal')}</Text>
            <Text style={[styles.totalAmount, { color: Colors.primaryBlue }]}>
              ${typeof total === 'number' ? total.toFixed(2) : (parseFloat(total) || 0).toFixed(2)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.totalSection, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}>
          <Text style={[styles.totalLabel, { color: Colors.primaryText }]}>{t('estimate.total')}</Text>
          <Text style={[styles.totalAmount, { color: Colors.primaryBlue }]}>
            ${typeof total === 'number' ? total.toFixed(2) : (parseFloat(total) || 0).toFixed(2)}
          </Text>
        </View>
      )}

      {/* Labor Cost Info - Owner Only (not shown when estimate is sent/shared) */}
      {!status && laborEstimate && (estimatedLaborCost > 0 || isEditing) && (
        <View style={[styles.laborInfoSection, { backgroundColor: '#F59E0B' + '15', borderColor: '#F59E0B' }]}>
          <View style={styles.laborHeader}>
            <Ionicons name="people-outline" size={18} color="#F59E0B" />
            <Text style={[styles.laborTitle, { color: Colors.primaryText }]}>
              {t('estimate.laborCost')}
            </Text>
          </View>
          {isEditing ? (
            <View style={styles.laborEditContainer}>
              <View style={styles.laborEditRow}>
                <Text style={[styles.laborEditLabel, { color: Colors.secondaryText }]}>{t('estimate.workersNeeded')}</Text>
                <TextInput
                  style={[styles.editInputSmall, { color: Colors.primaryText, borderColor: '#F59E0B' }]}
                  value={String(editedData.laborEstimate?.workersNeeded || laborEstimate?.workersNeeded || '')}
                  onChangeText={(val) => handleUpdateLaborEstimate('workersNeeded', parseInt(val) || 0)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.secondaryText}
                />
              </View>
              <View style={styles.laborEditRow}>
                <Text style={[styles.laborEditLabel, { color: Colors.secondaryText }]}>{t('estimate.daysNeeded')}</Text>
                <TextInput
                  style={[styles.editInputSmall, { color: Colors.primaryText, borderColor: '#F59E0B' }]}
                  value={String(editedData.laborEstimate?.daysNeeded || laborEstimate?.daysNeeded || '')}
                  onChangeText={(val) => handleUpdateLaborEstimate('daysNeeded', parseInt(val) || 0)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.secondaryText}
                />
              </View>
            </View>
          ) : (
            <>
              <Text style={[styles.laborDetails, { color: Colors.secondaryText }]}>
                {laborEstimate.workersNeeded} {laborEstimate.workersNeeded > 1 ? t('estimate.workerPlural') : t('estimate.worker')} × {laborEstimate.daysNeeded} {laborEstimate.daysNeeded > 1 ? t('card.dayPlural', { ns: 'projects' }) : t('card.day', { ns: 'projects' })}
              </Text>
              <Text style={[styles.laborCost, { color: '#F59E0B' }]}>
                ~${estimatedLaborCost.toFixed(2)}
              </Text>
              <Text style={[styles.laborNote, { color: Colors.secondaryText }]}>
                {t('estimate.avgWorkerRate', { rate: workerRates.daily.toFixed(0) })}
              </Text>
              {laborEstimate.reasoning && (
                <Text style={[styles.laborReasoning, { color: Colors.secondaryText }]}>
                  {laborEstimate.reasoning}
                </Text>
              )}
            </>
          )}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {isEditing ? (
          <>
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: Colors.secondaryText, flex: 1 }]}
              onPress={handleCancelEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="close-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>{t('buttons.cancel', { ns: 'common' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: Colors.primaryBlue, flex: 1 }]}
              onPress={handleSaveEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>{t('estimate.saveChanges')}</Text>
            </TouchableOpacity>
          </>
        ) : status === 'accepted' ? (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleConvertToInvoice}
          >
            <Ionicons name="document-text-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>{t('estimate.convertToInvoice')}</Text>
          </TouchableOpacity>
        ) : !status ? (
          <>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: '#22C55E' }]}
              onPress={() => {
                if (onAction) {
                  onAction({ type: 'save-estimate', data });
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="save-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: '#8B5CF6' }]}
              onPress={handlePreview}
              activeOpacity={0.7}
            >
              <Ionicons name="eye-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>{t('estimate.shareEstimate')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Helper Text for Project Creation */}
      {(!status || status === 'draft' || status === 'sent') && (
        <View style={[styles.helperTextContainer, { backgroundColor: Colors.lightGray }]}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.primaryBlue} />
          <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
            {t('estimate.afterAcceptance')}
          </Text>
        </View>
      )}

      {/* Footer Note */}
      {status === 'accepted' && (
        <Text style={[styles.footerNote, { color: Colors.secondaryText }]}>
          {t('estimate.acceptedReady')}
        </Text>
      )}

      {/* Estimate Preview Modal */}
      <Modal
        visible={showPreview}
        animationType="slide"
        onRequestClose={() => setShowPreview(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top', 'bottom']}>
          <View style={[styles.previewHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowPreview(false)} style={{ padding: 8 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={32} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.previewTitle, { color: Colors.primaryText }]}>Estimate Preview</Text>
            <View style={{ width: 28 }} />
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: previewHTML }}
            style={{ flex: 1 }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    borderBottomWidth: 2,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 2,
  },
  estimateNumber: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginTop: 2,
  },
  businessName: {
    fontSize: FontSizes.small,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: 4,
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
  },
  editButton: {
    padding: Spacing.xs,
  },
  section: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: 4,
  },
  addItemText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  removeItemButton: {
    padding: 4,
    marginLeft: Spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: FontSizes.small,
    width: 70,
  },
  value: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    flex: 1,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  lineItem: {
    marginBottom: Spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  itemNumber: {
    fontSize: FontSizes.small,
    width: 20,
  },
  itemDescription: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    flex: 1,
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 20,
  },
  itemCalc: {
    fontSize: FontSizes.tiny,
  },
  itemTotal: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  costBreakdown: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  breakdownLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderTopWidth: 2,
  },
  totalLabel: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  totalAmount: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  sendButton: {
    flex: 1,
    minWidth: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    width: '100%',
  },
  smsButton: {
    // Already has backgroundColor from style prop
  },
  whatsappButton: {
    // Already has backgroundColor from style prop
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  helperTextContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  helperText: {
    flex: 1,
    fontSize: FontSizes.tiny,
    lineHeight: 16,
  },
  footerNote: {
    fontSize: FontSizes.tiny,
    textAlign: 'center',
    paddingBottom: Spacing.md,
  },
  scopeText: {
    fontSize: FontSizes.small,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  complexityBadge: {
    marginTop: Spacing.xs,
  },
  complexityText: {
    fontSize: FontSizes.tiny,
  },
  phaseCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  phaseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  phaseName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  phaseDays: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  phaseContent: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  tasksSection: {
    marginBottom: Spacing.md,
  },
  tasksTitle: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  taskText: {
    fontSize: FontSizes.small,
    flex: 1,
    lineHeight: 18,
  },
  phaseBudgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    marginTop: Spacing.xs,
  },
  phaseBudgetLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  phaseBudgetAmount: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  phaseTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  phaseTimelineText: {
    fontSize: FontSizes.tiny,
  },
  overallTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: 2,
  },
  timelineText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editIconButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 36,
  },
  editInputSmall: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    minWidth: 50,
    textAlign: 'center',
    fontSize: FontSizes.small,
  },
  editableItemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  editInputTiny: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    minWidth: 40,
    textAlign: 'center',
    fontSize: FontSizes.tiny,
  },
  addTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: 4,
  },
  addTaskText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  removeTaskButton: {
    padding: 4,
    marginLeft: Spacing.xs,
  },
  // Labor Info Section Styles
  laborInfoSection: {
    margin: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  laborHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  laborTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  laborDetails: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.xs,
  },
  laborCost: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  laborNote: {
    fontSize: FontSizes.tiny,
  },
  laborReasoning: {
    fontSize: FontSizes.tiny,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  laborEditContainer: {
    marginTop: Spacing.xs,
  },
  laborEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  laborEditLabel: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  // Address styles
  addressDivider: {
    borderTopWidth: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  addressSectionLabel: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  addressEditContainer: {
    marginBottom: Spacing.xs,
  },
  addressRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  cityInput: {
    flex: 2,
  },
  stateInput: {
    flex: 0.8,
    textAlign: 'center',
  },
  zipInput: {
    flex: 1.2,
  },
  addressText: {
    fontSize: FontSizes.small,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
});
