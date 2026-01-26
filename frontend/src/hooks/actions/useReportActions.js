import { useCallback } from 'react';
import { Alert } from 'react-native';
import logger from '../../utils/logger';
import {
  saveDailyReport,
  fetchPhotosWithFilters,
  fetchDailyReportsWithFilters,
} from '../../utils/storage';

/**
 * Hook for all report and photo-related actions
 * @param {Object} options
 * @param {Function} options.addMessage - Function to add a message to chat
 * @param {Function} options.setMessages - Function to update messages state
 */
export default function useReportActions({ addMessage, setMessages }) {

  const handleSaveDailyReport = useCallback(async (data) => {
    try {
      const { workerId, projectId, phaseId, photos, completedStepIds, notes } = data;

      const report = await saveDailyReport(
        workerId,
        projectId,
        phaseId,
        photos || [],
        completedStepIds || [],
        notes || ''
      );

      if (report) {
        addMessage(`✅ Daily report saved! ${completedStepIds?.length || 0} tasks marked complete.`);
        return report;
      } else {
        Alert.alert('Error', 'Failed to save daily report.');
        return null;
      }
    } catch (error) {
      logger.error('Error saving daily report:', error);
      Alert.alert('Error', 'Failed to save daily report.');
      return null;
    }
  }, [addMessage]);

  const handleCreateDailyReport = useCallback(async (data) => {
    try {
      const { workerId, projectId, projectName, phaseId, phaseName, photos, completedStepIds, notes } = data;

      const report = await saveDailyReport(
        workerId,
        projectId,
        phaseId,
        photos || [],
        completedStepIds || [],
        notes || ''
      );

      if (report) {
        addMessage(`✅ Created daily report for ${projectName}${phaseName ? ` (${phaseName})` : ''}`);
        return report;
      } else {
        Alert.alert('Error', 'Failed to create daily report.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating daily report:', error);
      Alert.alert('Error', 'Failed to create daily report.');
      return null;
    }
  }, [addMessage]);

  const handleRetrievePhotos = useCallback(async (data) => {
    try {
      const filters = data?.filters || {};
      const photos = await fetchPhotosWithFilters(filters);

      const photoGalleryElement = {
        type: 'photo-gallery',
        data: {
          title: data?.title || 'Project Photos',
          subtitle: data?.subtitle || '',
          photos: photos,
          totalCount: photos.length,
          filters: filters
        }
      };

      const resultMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: photos.length > 0
          ? `Found ${photos.length} photo${photos.length === 1 ? '' : 's'} matching your criteria.`
          : 'No photos found matching your criteria. Try adjusting your filters.',
        isUser: false,
        timestamp: new Date(),
        visualElements: photos.length > 0 ? [photoGalleryElement] : [],
        actions: [],
      };

      setMessages((prev) => [...prev, resultMessage]);
      return photos;
    } catch (error) {
      logger.error('Error retrieving photos:', error);
      addMessage('Sorry, I encountered an error while retrieving photos. Please try again.');
      return null;
    }
  }, [addMessage, setMessages]);

  const handleRetrieveDailyReports = useCallback(async (data) => {
    try {
      const filters = data?.filters || {};
      logger.debug('📋 [handleRetrieveDailyReports] Using filters:', JSON.stringify(filters, null, 2));
      const reports = await fetchDailyReportsWithFilters(filters);
      logger.debug('📋 [handleRetrieveDailyReports] Found reports:', reports.length);

      const reportListElement = {
        type: 'daily-report-list',
        data: {
          title: data?.title || 'Daily Reports',
          subtitle: data?.subtitle || '',
          reports: reports,
          totalCount: reports.length,
          filters: filters
        }
      };

      const resultMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: reports.length > 0
          ? `Found ${reports.length} daily report${reports.length === 1 ? '' : 's'}.`
          : 'No reports found matching your criteria.',
        isUser: false,
        timestamp: new Date(),
        visualElements: reports.length > 0 ? [reportListElement] : [],
        actions: [],
      };

      setMessages((prev) => [...prev, resultMessage]);
      return reports;
    } catch (error) {
      logger.error('Error retrieving daily reports:', error);
      addMessage('Sorry, I encountered an error while retrieving reports. Please try again.');
      return null;
    }
  }, [addMessage, setMessages]);

  return {
    handleSaveDailyReport,
    handleCreateDailyReport,
    handleRetrievePhotos,
    handleRetrieveDailyReports,
  };
}
