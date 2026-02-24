import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import logger from '../../utils/logger';
import {
  fetchProjects,
  saveProject,
  getProject,
  deleteProject,
  transformScreenshotToProject,
  updatePhaseProgress,
  extendPhaseTimeline,
  startPhase,
  completePhase,
  fetchProjectPhases,
  addTaskToPhase,
  savePhasePaymentAmount,
  createProjectFromEstimate,
  createWorkerTasksFromPhases,
  redistributeAllTasksWithAI,
} from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../utils/storage/auth';
import { addProjectTransaction } from '../../utils/storage/transactions';
import CoreAgent from '../../services/agents/core/CoreAgent';
import { emitProjectUpdated } from '../../services/eventEmitter';

// Helper: Resolve partial project UUID to full UUID
const resolveProjectId = (projects, id) => {
  if (!id || !projects) return null;
  if (id.length === 36) return id;
  const match = projects.find(p => p.id?.startsWith(id));
  return match?.id || null;
};

/**
 * Hook for all project-related actions
 * @param {Object} options
 * @param {Function} options.addMessage - Function to add a message to chat
 * @param {Function} options.setMessages - Function to update messages state
 * @param {Object} options.navigation - React Navigation object
 */
export default function useProjectActions({ addMessage, setMessages, navigation }) {
  // Guard against duplicate saves
  const lastSaveRef = useRef({ projectName: null, timestamp: 0 });

  const handleCreateProjectFromScreenshot = useCallback(async (screenshotData) => {
    try {
      const projectData = transformScreenshotToProject(screenshotData);
      const savedProject = await saveProject(projectData);

      if (savedProject) {
        Alert.alert('Success', 'Project created from screenshot!');

        const confirmationMessage = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: `✅ I've created a project from the screenshot. Here's what I extracted:`,
          isUser: false,
          timestamp: new Date(),
          visualElements: [
            {
              type: 'project-card',
              data: savedProject
            }
          ],
          actions: [
            { label: 'Edit Project', type: 'edit-project', data: { projectId: savedProject.id } },
            { label: 'View All Projects', type: 'navigate-to-projects', data: {} }
          ],
        };
        setMessages((prev) => [...prev, confirmationMessage]);
        return savedProject;
      } else {
        Alert.alert('Error', 'Failed to create project. Please try again.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating project from screenshot:', error);
      Alert.alert('Error', 'Failed to create project. Please try again.');
      return null;
    }
  }, [setMessages]);

  const handleSelectProject = useCallback(async (data) => {
    try {
      const { projectId, pendingUpdate } = data;

      const project = await getProject(projectId);
      if (!project) {
        Alert.alert('Error', 'Could not load project details. Please try again.');
        return null;
      }

      const updatedProject = {
        ...project,
        incomeCollected: (project.incomeCollected || 0) + (pendingUpdate.incomeCollected || 0),
        expenses: (project.expenses || 0) + (pendingUpdate.expenses || 0),
      };

      updatedProject.profit = updatedProject.incomeCollected - updatedProject.expenses;
      updatedProject.spent = updatedProject.expenses;

      const saved = await saveProject(updatedProject);
      if (!saved) {
        Alert.alert('Error', 'Failed to save changes to database.');
        return null;
      }

      setMessages((prev) => {
        const messages = [...prev];
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i];
          if (!message.isUser && message.visualElements) {
            const selectorIndex = message.visualElements.findIndex(el => el.type === 'project-selector');
            if (selectorIndex !== -1) {
              message.text = `✅ Updated ${project.name}!\n\nCollected: +$${(pendingUpdate.incomeCollected || 0).toLocaleString()}\nExpenses: +$${(pendingUpdate.expenses || 0).toLocaleString()}\nNew Profit: $${updatedProject.profit.toLocaleString()}`;
              message.visualElements = [{
                type: 'project-card',
                data: updatedProject
              }];
              message.actions = [];
              break;
            }
          }
        }
        return messages;
      });

      return updatedProject;
    } catch (error) {
      logger.error('Error selecting project:', error);
      Alert.alert('Error', 'Failed to update project. Please try again.');
      return null;
    }
  }, [setMessages]);

  const handleUpdateProjectFinances = useCallback(async (data) => {
    try {
      // Support both old format (incomeCollected/expenses) and new format (transactionType/amount)
      const { projectId, projectName, transactionType, amount, description, paymentMethod, category } = data;

      // Backwards compatibility: convert old format to new
      let txType = transactionType;
      let txAmount = amount;
      if (!transactionType) {
        // Old format: incomeCollected or expenses
        if (data.incomeCollected && data.incomeCollected > 0) {
          txType = 'income';
          txAmount = data.incomeCollected;
        } else if (data.expenses && data.expenses > 0) {
          txType = 'expense';
          txAmount = data.expenses;
        }
      }

      if (!txType || !txAmount) {
        Alert.alert('Error', 'Invalid transaction data.');
        return null;
      }

      // Create transaction record (database trigger will update project totals)
      const transaction = await addProjectTransaction({
        project_id: projectId,
        type: txType,
        category: category || (txType === 'income' ? 'payment' : 'misc'),
        description: description || `${txType === 'income' ? 'Payment' : 'Expense'} for ${projectName}`,
        amount: txAmount,
        date: new Date().toISOString().split('T')[0],
        payment_method: paymentMethod || null,
        is_auto_generated: false,
      });

      if (!transaction) {
        Alert.alert('Error', 'Failed to save transaction to database.');
        return null;
      }

      // Fetch updated project (totals will be updated by database trigger)
      const updatedProject = await getProject(projectId);

      setMessages((prev) => {
        const messages = [...prev];
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i];
          if (!message.isUser) {
            const typeText = txType === 'income' ? 'Collected' : 'Expense';
            const methodText = paymentMethod ? ` via ${paymentMethod}` : '';
            message.text = `✅ Recorded $${txAmount.toLocaleString()} ${txType} for ${projectName}${methodText}!`;
            if (updatedProject) {
              message.visualElements = [{
                type: 'project-card',
                data: updatedProject
              }];
            }
            message.actions = [];
            break;
          }
        }
        return messages;
      });

      return updatedProject;
    } catch (error) {
      logger.error('Error updating project finances:', error);
      Alert.alert('Error', 'Failed to update project. Please try again.');
      return null;
    }
  }, [setMessages]);

  const handleUpdatePhaseProgress = useCallback(async (data) => {
    try {
      const { phaseId, phaseName, percentage } = data;
      const success = await updatePhaseProgress(phaseId, percentage);
      if (success) {
        addMessage(`✅ Updated ${phaseName} to ${percentage}% complete!`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update phase progress.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating phase progress:', error);
      Alert.alert('Error', 'Failed to update phase progress.');
      return false;
    }
  }, [addMessage]);

  const handleExtendPhaseTimeline = useCallback(async (data) => {
    try {
      const { phaseId, phaseName, extraDays, reason } = data;
      const success = await extendPhaseTimeline(phaseId, extraDays, reason || '');
      if (success) {
        addMessage(`✅ Extended ${phaseName} by ${extraDays} days!`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to extend phase timeline.');
        return false;
      }
    } catch (error) {
      logger.error('Error extending phase timeline:', error);
      Alert.alert('Error', 'Failed to extend phase timeline.');
      return false;
    }
  }, [addMessage]);

  const handleStartPhase = useCallback(async (data) => {
    try {
      const { phaseId, phaseName } = data;
      const success = await startPhase(phaseId);
      if (success) {
        addMessage(`✅ Started ${phaseName} phase!`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to start phase.');
        return false;
      }
    } catch (error) {
      logger.error('Error starting phase:', error);
      Alert.alert('Error', 'Failed to start phase.');
      return false;
    }
  }, [addMessage]);

  const handleCompletePhase = useCallback(async (data) => {
    try {
      const { phaseId, phaseName } = data;
      const success = await completePhase(phaseId);
      if (success) {
        addMessage(`✅ Marked ${phaseName} as complete!`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to complete phase.');
        return false;
      }
    } catch (error) {
      logger.error('Error completing phase:', error);
      Alert.alert('Error', 'Failed to complete phase.');
      return false;
    }
  }, [addMessage]);

  const handleViewProjectPhases = useCallback(async (data) => {
    try {
      const { projectId } = data;
      const phases = await fetchProjectPhases(projectId);
      const project = await getProject(projectId);

      if (phases && phases.length > 0 && project) {
        const aiMessage = {
          id: `ai-${Date.now()}`,
          text: `Here are the phases for ${project.name}:`,
          isUser: false,
          visualElements: [{
            type: 'phase-overview',
            data: {
              projectId: project.id,
              projectName: project.name,
              phases: phases
            }
          }],
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
        return phases;
      } else {
        addMessage('This project does not have any phases configured.');
        return null;
      }
    } catch (error) {
      logger.error('Error viewing project phases:', error);
      Alert.alert('Error', 'Failed to load project phases.');
      return null;
    }
  }, [addMessage, setMessages]);

  const handleAddPhaseTasks = useCallback(async (data) => {
    try {
      const { phaseId, phaseName, tasks } = data;
      for (const taskDescription of tasks) {
        await addTaskToPhase(phaseId, taskDescription, 0);
      }
      addMessage(`✅ Added ${tasks.length} task${tasks.length !== 1 ? 's' : ''} to ${phaseName} phase!`);
      return true;
    } catch (error) {
      logger.error('Error adding phase tasks:', error);
      Alert.alert('Error', 'Failed to add tasks to phase.');
      return false;
    }
  }, [addMessage]);

  const handleSetPhasePayment = useCallback(async (data) => {
    try {
      const { phaseId, phaseName, amount } = data;
      const success = await savePhasePaymentAmount(phaseId, amount);
      if (success) {
        addMessage(`✅ Set payment for ${phaseName} to $${amount.toLocaleString()}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to set phase payment amount.');
        return false;
      }
    } catch (error) {
      logger.error('Error setting phase payment:', error);
      Alert.alert('Error', 'Failed to set phase payment amount.');
      return false;
    }
  }, [addMessage]);

  const handleSaveProject = useCallback(async (projectData, messages) => {
    try {
      // Guard against duplicate saves (same project name within 5 seconds)
      const projectName = projectData.projectName || projectData.name;
      const now = Date.now();
      if (projectName && lastSaveRef.current.projectName === projectName &&
          (now - lastSaveRef.current.timestamp) < 5000) {
        logger.debug('⚠️ [handleSaveProject] Duplicate save detected, skipping');
        return null;
      }
      lastSaveRef.current = { projectName, timestamp: now };

      logger.debug('💾 [handleSaveProject] Saving project with data:', {
        hasPhases: !!projectData.phases,
        phasesCount: projectData.phases?.length,
        hasSchedule: !!projectData.schedule,
        hasScope: !!projectData.scope
      });

      let completeProjectData = projectData;
      const actionHasTasks = projectData.phases?.some(p => p.tasks?.length > 0);

      if (!actionHasTasks && messages) {
        logger.debug('⚠️ Action data missing tasks, searching for complete data in preview...');

        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (!msg.isUser && msg.visualElements) {
            const projectPreview = msg.visualElements.find(ve => ve.type === 'project-preview');
            if (projectPreview && projectPreview.data) {
              const previewHasTasks = projectPreview.data.phases?.some(p => p.tasks?.length > 0);

              if (previewHasTasks) {
                logger.debug('✅ Found complete data in preview, merging with action data');
                completeProjectData = {
                  ...projectData,
                  phases: projectPreview.data.phases || projectData.phases,
                  schedule: projectData.schedule || projectPreview.data.schedule,
                  scope: projectPreview.data.scope || projectData.scope,
                  lineItems: projectData.lineItems || projectPreview.data.items || [],
                  // FIX: Extract dates from multiple sources with full fallback chain
                  startDate: projectData.startDate
                    || projectData.schedule?.startDate
                    || projectPreview.data.schedule?.startDate
                    || projectPreview.data.startDate,
                  endDate: projectData.endDate
                    || projectData.schedule?.estimatedEndDate
                    || projectData.schedule?.projectdEndDate
                    || projectPreview.data.schedule?.estimatedEndDate
                    || projectPreview.data.endDate,
                };
                break;
              }
            }
          }
        }
      }

      const cleanProjectData = {
        ...completeProjectData,
        status: 'active',
        estimate_id: undefined,
        estimateId: undefined
      };

      const savedProject = await saveProject(cleanProjectData);

      // Check for subscription limit error
      if (savedProject?.error === 'limit_reached') {
        logger.warn('⚠️ Project limit reached:', savedProject);
        Alert.alert(
          'Project Limit Reached',
          savedProject.reason || 'You have reached your project limit. Upgrade your plan to create more projects.',
          [{ text: 'OK' }]
        );
        return null;
      }

      if (savedProject && savedProject.id) {
        logger.debug('✅ Project saved successfully:', savedProject.id);

        // AI Task Distribution - distribute tasks intelligently across the timeline
        const phases = cleanProjectData.phases || [];
        if (phases.length > 0 && phases.some(p => p.tasks?.length > 0)) {
          const userId = await getCurrentUserId();
          if (userId) {
            const timeline = {
              startDate: savedProject.startDate || cleanProjectData.startDate,
              endDate: savedProject.endDate || cleanProjectData.endDate,
              workingDays: cleanProjectData.workingDays || [1, 2, 3, 4, 5],
            };
            logger.debug('🤖 [handleSaveProject] Calling AI to distribute tasks...');
            await redistributeAllTasksWithAI(savedProject.id, userId, phases, timeline);
            logger.debug('🤖 [handleSaveProject] AI distribution complete');
          }
        }

        const savedProjectPreview = {
          id: savedProject.id,
          projectName: savedProject.name,
          client: savedProject.client,
          location: savedProject.location || savedProject.address,
          address: savedProject.address || savedProject.location,
          phone: savedProject.phone,
          email: savedProject.email,
          services: savedProject.services || cleanProjectData.services,
          phases: savedProject.phases || cleanProjectData.phases,
          scope: savedProject.scope || cleanProjectData.scope,
        };
        CoreAgent.updateConversationState({ lastProjectPreview: savedProjectPreview });

        Alert.alert(
          'Success',
          `Project "${savedProject.name}" has been saved!`
        );

        return savedProject;
      }
      return null;
    } catch (error) {
      logger.error('Error saving project:', error);
      Alert.alert('Error', 'Failed to save project. Please try again.');
      return null;
    }
  }, []);

  const handleDeleteProject = useCallback(async (deleteData, options = {}) => {
    try {
      const { projectId, projectName } = deleteData;
      const { skipConfirmation = false } = options;

      if (!projectId) {
        Alert.alert('Error', 'Project ID not found');
        return false;
      }

      // If skipConfirmation is true (auto-executed from chat), delete directly
      if (skipConfirmation) {
        const success = await deleteProject(projectId);
        if (success) {
          const confirmationMessage = {
            id: Date.now().toString(),
            text: `✅ Project "${projectName}" has been successfully deleted.`,
            isUser: false,
            timestamp: new Date(),
            visualElements: [],
            actions: [],
          };
          setMessages(prev => [...prev, confirmationMessage]);
          return true;
        } else {
          Alert.alert('Error', 'Failed to delete project');
          return false;
        }
      }

      // Otherwise show confirmation dialog
      return new Promise((resolve) => {
        Alert.alert(
          'Delete Project',
          `Are you sure you want to delete "${projectName}"? This action cannot be undone.`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(false)
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                const success = await deleteProject(projectId);
                if (success) {
                  Alert.alert('Success', `Project "${projectName}" has been deleted`);
                  const confirmationMessage = {
                    id: Date.now().toString(),
                    text: `✅ Project "${projectName}" has been successfully deleted.`,
                    isUser: false,
                    timestamp: new Date(),
                    visualElements: [],
                    actions: [],
                  };
                  setMessages(prev => [...prev, confirmationMessage]);
                  resolve(true);
                } else {
                  Alert.alert('Error', 'Failed to delete project');
                  resolve(false);
                }
              }
            }
          ]
        );
      });
    } catch (error) {
      logger.error('Error deleting project:', error);
      Alert.alert('Error', 'Failed to delete project. Please try again.');
      return false;
    }
  }, [setMessages]);

  const handleDeleteAllProjects = useCallback(async (data, options = {}) => {
    try {
      const { confirmed = false } = data || {};
      const { skipConfirmation = false } = options;

      // Fetch all projects
      const projects = await fetchProjects();
      if (!projects || projects.length === 0) {
        addMessage('You have no projects to delete.');
        return { success: true, count: 0 };
      }

      const projectCount = projects.length;

      // If confirmed from AI or skipConfirmation, delete all
      if (confirmed || skipConfirmation) {
        let deletedCount = 0;
        for (const project of projects) {
          const success = await deleteProject(project.id);
          if (success) deletedCount++;
        }

        const confirmationMessage = {
          id: Date.now().toString(),
          text: `✅ Successfully deleted ${deletedCount} project${deletedCount !== 1 ? 's' : ''}.`,
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [],
        };
        setMessages(prev => [...prev, confirmationMessage]);
        return { success: true, count: deletedCount };
      }

      // Otherwise show confirmation dialog
      return new Promise((resolve) => {
        Alert.alert(
          'Delete All Projects',
          `Are you sure you want to delete ALL ${projectCount} projects? This action cannot be undone.`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve({ success: false, count: 0 })
            },
            {
              text: `Delete All ${projectCount}`,
              style: 'destructive',
              onPress: async () => {
                let deletedCount = 0;
                for (const project of projects) {
                  const success = await deleteProject(project.id);
                  if (success) deletedCount++;
                }
                Alert.alert('Success', `Deleted ${deletedCount} projects`);
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ Successfully deleted ${deletedCount} project${deletedCount !== 1 ? 's' : ''}.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                };
                setMessages(prev => [...prev, confirmationMessage]);
                resolve({ success: true, count: deletedCount });
              }
            }
          ]
        );
      });
    } catch (error) {
      logger.error('Error deleting all projects:', error);
      Alert.alert('Error', 'Failed to delete projects. Please try again.');
      return { success: false, count: 0 };
    }
  }, [addMessage, setMessages]);

  const handleUpdateProject = useCallback(async (projectData, options = {}) => {
    try {
      const { skipConfirmation = false } = options;
      const projectId = projectData.id || projectData.projectId;

      if (!projectId) {
        Alert.alert('Error', 'Project ID not found');
        return null;
      }

      // CRITICAL: Fetch existing project first to prevent data loss
      const existingProject = await getProject(projectId);
      if (!existingProject) {
        Alert.alert('Error', 'Could not find project to update');
        return null;
      }

      // FIX: Normalize contract_amount to budget/baseContract BEFORE merging
      // This ensures the new contract amount takes precedence over old budget
      const newContractAmount = projectData.contract_amount ?? projectData.contractAmount ?? projectData.base_contract ?? projectData.baseContract;
      if (newContractAmount !== undefined && newContractAmount !== null) {
        projectData.budget = newContractAmount;
        projectData.baseContract = newContractAmount;
        projectData.contractAmount = newContractAmount;
      }

      // FIX: Extract schedule dates to top-level BEFORE merging
      // This ensures new schedule dates take precedence over existingProject dates
      if (projectData.schedule) {
        if (projectData.schedule.startDate) {
          projectData.startDate = projectData.schedule.startDate;
        }
        if (projectData.schedule.estimatedEndDate || projectData.schedule.projectdEndDate) {
          projectData.endDate = projectData.schedule.estimatedEndDate || projectData.schedule.projectdEndDate;
        }
      }

      // Normalize dates for comparison (handle string format differences)
      const normalizeDate = (d) => {
        if (!d) return null;
        if (typeof d === 'string') return d.split('T')[0];
        if (d instanceof Date) return d.toISOString().split('T')[0];
        return null;
      };

      // Check if schedule/timeline changed (AFTER extracting dates)
      const newStart = normalizeDate(projectData.startDate);
      const newEnd = normalizeDate(projectData.endDate);
      const existingStart = normalizeDate(existingProject.startDate);
      const existingEnd = normalizeDate(existingProject.endDate);

      const scheduleChanged = newStart !== existingStart || newEnd !== existingEnd;

      // Debug: log schedule change detection
      console.log('📅 [handleUpdateProject] Schedule changed:', scheduleChanged);
      console.log('📅 [handleUpdateProject] New dates:', newStart, '->', newEnd);
      console.log('📅 [handleUpdateProject] Existing dates:', existingStart, '->', existingEnd);

      // Merge new data with existing (new data takes precedence)
      const mergedProject = {
        ...existingProject,
        ...projectData,
      };

      const updatedProject = await saveProject(mergedProject);
      if (updatedProject) {
        // If schedule changed, use AI to redistribute all tasks
        if (scheduleChanged) {
          logger.debug('📅 Schedule changed, calling AI to redistribute tasks...');
          const userId = await getCurrentUserId();
          if (userId) {
            // Get phases - prefer from projectData, fallback to existingProject
            const phases = projectData.phases || existingProject.phases || [];

            // Build timeline for AI distribution
            const timeline = {
              startDate: newStart,
              endDate: newEnd,
              workingDays: projectData.workingDays || existingProject.workingDays || [1, 2, 3, 4, 5],
            };

            console.log('🤖 [handleUpdateProject] Calling AI to redistribute tasks...');

            // AI-powered redistribution (handles deletion and intelligent distribution)
            await redistributeAllTasksWithAI(projectId, userId, phases, timeline);

            logger.debug('✅ Worker tasks redistributed with AI');
          }
        }

        if (!skipConfirmation) {
          Alert.alert('Success', 'Project updated successfully!');
        }

        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            if (msg.visualElements && msg.visualElements.length > 0) {
              const hasProject = msg.visualElements.some(
                (ve) => ve.type === 'project-preview' &&
                       (ve.data.id === projectData.id || ve.data.projectId === projectData.projectId)
              );

              if (hasProject) {
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'project-preview' &&
                        (ve.data.id === projectData.id || ve.data.projectId === projectData.projectId)) {
                      return { ...ve, data: updatedProject };
                    }
                    return ve;
                  })
                };
              }
            }
            return msg;
          });
        });

        CoreAgent.updateConversationState({ lastProjectPreview: updatedProject });

        // Emit event to notify all screens that project data changed
        emitProjectUpdated(updatedProject.id);
        console.log('✅ Project updated, event emitted for project:', updatedProject.id);

        return updatedProject;
      }
      return null;
    } catch (error) {
      logger.error('Error updating project:', error);
      Alert.alert('Error', 'Failed to update project. Please try again.');
      return null;
    }
  }, [setMessages]);

  const handleCreateProjectFromEstimate = useCallback(async (estimateData) => {
    try {
      const estimateId = estimateData.id || estimateData.estimateId;
      if (!estimateId) {
        Alert.alert('Error', 'No estimate ID provided');
        return null;
      }

      const createdProject = await createProjectFromEstimate(estimateId);

      if (createdProject) {
        Alert.alert(
          'Success',
          `Project "${createdProject.name}" has been created from the estimate!`,
          [
            {
              text: 'View Project',
              onPress: () => {
                if (navigation) {
                  navigation.navigate('Projects');
                }
              },
            },
            { text: 'OK', style: 'cancel' },
          ]
        );

        setMessages((prevMessages) => {
          return prevMessages.map((msg) => {
            if (msg.visualElements && msg.visualElements.length > 0) {
              const hasEstimate = msg.visualElements.some(
                (ve) => ve.type === 'estimate-preview' &&
                       (ve.data.id === estimateId || ve.data.estimateId === estimateId)
              );

              if (hasEstimate) {
                return {
                  ...msg,
                  visualElements: msg.visualElements.map((ve) => {
                    if (ve.type === 'estimate-preview' &&
                        (ve.data.id === estimateId || ve.data.estimateId === estimateId)) {
                      return {
                        ...ve,
                        data: { ...ve.data, status: 'accepted' }
                      };
                    }
                    return ve;
                  }),
                  actions: msg.actions.filter(a =>
                    a.type !== 'create-project-from-estimate' &&
                    a.type !== 'convert-to-invoice'
                  )
                };
              }
            }
            return msg;
          });
        });

        return createdProject;
      }
      return null;
    } catch (error) {
      logger.error('Error creating project from estimate:', error);
      Alert.alert('Error', 'Failed to create project from estimate. Please try again.');
      return null;
    }
  }, [navigation, setMessages]);

  const handleAddEstimateToProjectChoice = useCallback(async (choiceData) => {
    try {
      const { estimateId, estimateName, projectId, projectName, options } = choiceData;

      if (!estimateId || !projectId) {
        Alert.alert('Error', 'Missing estimate or project information');
        return null;
      }

      return new Promise((resolve) => {
        Alert.alert(
          'Add Estimate to Project',
          `How would you like to add "${estimateName}" to "${projectName}"?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(null)
            },
            {
              text: options.merge.label,
              onPress: async () => {
                const { addEstimateToProject } = require('../../utils/storage');
                const updatedProject = await addEstimateToProject(projectId, estimateId, 'merge');
                if (updatedProject) {
                  Alert.alert('Success', 'Estimate merged into project successfully!');
                  const confirmationMessage = {
                    id: Date.now().toString(),
                    text: `✅ "${estimateName}" has been merged into "${projectName}". Tasks and budgets have been combined into existing phases.`,
                    isUser: false,
                    timestamp: new Date(),
                    visualElements: [],
                    actions: [],
                  };
                  setMessages(prev => [...prev, confirmationMessage]);
                  resolve(updatedProject);
                } else {
                  Alert.alert('Error', 'Failed to add estimate to project');
                  resolve(null);
                }
              }
            },
            {
              text: options.separate.label + (options.separate.recommended ? ' ✓' : ''),
              onPress: async () => {
                const { addEstimateToProject } = require('../../utils/storage');
                const updatedProject = await addEstimateToProject(projectId, estimateId, 'separate');
                if (updatedProject) {
                  Alert.alert('Success', 'Estimate added as separate scope!');
                  const confirmationMessage = {
                    id: Date.now().toString(),
                    text: `✅ "${estimateName}" has been added to "${projectName}" as a separate scope. You can track it independently.`,
                    isUser: false,
                    timestamp: new Date(),
                    visualElements: [],
                    actions: [],
                  };
                  setMessages(prev => [...prev, confirmationMessage]);
                  resolve(updatedProject);
                } else {
                  Alert.alert('Error', 'Failed to add estimate to project');
                  resolve(null);
                }
              },
              style: options.separate.recommended ? 'default' : undefined
            }
          ]
        );
      });
    } catch (error) {
      logger.error('Error adding estimate to project:', error);
      Alert.alert('Error', 'Failed to add estimate to project. Please try again.');
      return null;
    }
  }, [setMessages]);

  const handleSyncProjectTasksToCalendar = useCallback(async (data) => {
    try {
      const { syncProjectTasksToCalendar, syncAllProjectTasksToCalendar } = require('../../utils/storage');

      if (data?.projectId) {
        // Sync single project
        const result = await syncProjectTasksToCalendar(data.projectId);
        if (result.success) {
          addMessage(`✅ Synced ${result.count} task${result.count !== 1 ? 's' : ''} to the calendar.`);
        } else {
          addMessage('Failed to sync tasks. Please try again.');
        }
        return result;
      } else {
        // Sync all projects
        const result = await syncAllProjectTasksToCalendar();
        if (result.success) {
          addMessage(`✅ Synced ${result.totalCount} task${result.totalCount !== 1 ? 's' : ''} from ${result.projectsProcessed} project${result.projectsProcessed !== 1 ? 's' : ''} to the calendar.`);
        } else {
          addMessage('Failed to sync tasks. Please try again.');
        }
        return result;
      }
    } catch (error) {
      logger.error('Error syncing tasks to calendar:', error);
      addMessage('Failed to sync tasks. Please try again.');
      return { success: false };
    }
  }, [addMessage]);

  return {
    // Project creation
    handleCreateProjectFromScreenshot,
    handleSaveProject,
    handleUpdateProject,
    handleDeleteProject,
    handleDeleteAllProjects,

    // Project selection & finances
    handleSelectProject,
    handleUpdateProjectFinances,

    // Phase management
    handleUpdatePhaseProgress,
    handleExtendPhaseTimeline,
    handleStartPhase,
    handleCompletePhase,
    handleViewProjectPhases,
    handleAddPhaseTasks,
    handleSetPhasePayment,

    // Estimate to project
    handleCreateProjectFromEstimate,
    handleAddEstimateToProjectChoice,

    // Task sync
    handleSyncProjectTasksToCalendar,
  };
}

// Export helper
export { resolveProjectId };
