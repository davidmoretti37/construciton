import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import { Alert, Platform } from 'react-native';

/**
 * Generate HTML for project PDF - Professional minimalist design
 */
export const generateProjectHTML = (projectData) => {
  const {
    projectNumber = '',
    businessName = '',
    businessPhone = '',
    businessEmail = '',
    businessAddress = '',
    businessLogo = '',
    client,
    clientName,
    clientPhone,
    clientEmail,
    clientAddress,
    projectName,
    date = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    services = [],
    phases = [],
    schedule = {},
    scope = {},
    accentColor = '#2563EB',
  } = projectData;

  // Extract client info
  const displayClientName = clientName || (typeof client === 'string' ? client : client?.name) || '';
  const displayClientPhone = clientPhone || (typeof client === 'object' ? client?.phone : '') || '';
  const displayClientEmail = clientEmail || (typeof client === 'object' ? client?.email : '') || '';
  const displayClientAddress = clientAddress || (typeof client === 'object' ? client?.address : '') || '';

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Generate phases HTML
  const generatePhasesHTML = () => {
    if (!phases || phases.length === 0) return '';

    return phases.map((phase, index) => {
      const tasksHTML = phase.tasks && phase.tasks.length > 0
        ? `<ul class="tasks-list">
            ${phase.tasks.map(task => `<li>${task.description || task.name || ''}</li>`).join('')}
           </ul>`
        : '';

      const phaseSchedule = schedule.phaseSchedule?.[index];
      const timelineHTML = phaseSchedule
        ? `<div class="phase-timeline">${formatDate(phaseSchedule.startDate)} - ${formatDate(phaseSchedule.endDate)}</div>`
        : '';

      return `
        <div class="phase-card">
          <div class="phase-header">
            <span class="phase-number">${index + 1}</span>
            <span class="phase-name">${phase.name}</span>
            <span class="phase-days">${phase.plannedDays || phase.duration || 0} days</span>
          </div>
          ${tasksHTML}
          ${timelineHTML}
        </div>
      `;
    }).join('');
  };

  // Generate services HTML
  const generateServicesHTML = () => {
    if (!services || services.length === 0) return '';

    return `
      <div class="section">
        <div class="section-title">SERVICES</div>
        <ul class="services-list">
          ${services.map((service, index) => {
            const desc = service.description?.replace(/^undefined\.\s*/i, '').trim() || service.description || '';
            return `<li><span class="service-num">${index + 1}.</span> ${desc}</li>`;
          }).join('')}
        </ul>
      </div>
    `;
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Project ${projectNumber || projectName || ''}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: #333;
          line-height: 1.5;
          font-size: 14px;
          background: #fff;
        }

        .page {
          max-width: 800px;
          margin: 0 auto;
          padding: 0;
        }

        .header {
          background: #f5f5f5;
          padding: 25px 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .header-left {
          flex: 1;
        }

        .project-title {
          font-size: 28px;
          font-weight: 700;
          color: ${accentColor};
          margin-bottom: 12px;
          letter-spacing: 1px;
        }

        .business-info {
          margin-top: 4px;
        }

        .business-name {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin-bottom: 4px;
        }

        .business-contact {
          font-size: 12px;
          color: #666;
          line-height: 1.6;
        }

        .header-right {
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
        }

        .logo img {
          max-width: 120px;
          max-height: 80px;
          object-fit: contain;
        }

        .content {
          padding: 30px 40px;
        }

        .info-section {
          display: flex;
          gap: 60px;
          margin-bottom: 25px;
          padding-bottom: 25px;
          border-bottom: 1px dashed #ddd;
        }

        .info-block {
          flex: 1;
        }

        .info-label {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .info-value {
          font-size: 14px;
          color: #333;
          margin-bottom: 2px;
        }

        .info-detail {
          font-size: 13px;
          color: #666;
        }

        .section {
          margin-bottom: 25px;
        }

        .section-title {
          font-size: 13px;
          font-weight: 700;
          color: #333;
          text-transform: uppercase;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 2px solid ${accentColor};
        }

        .scope-text {
          font-size: 14px;
          color: #333;
          line-height: 1.7;
          background: #f9fafb;
          padding: 15px;
          border-left: 3px solid ${accentColor};
        }

        .phase-card {
          background: #f9fafb;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 12px;
          border: 1px solid #e5e7eb;
        }

        .phase-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }

        .phase-number {
          background: ${accentColor};
          color: #fff;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
        }

        .phase-name {
          font-size: 15px;
          font-weight: 600;
          color: #333;
          flex: 1;
        }

        .phase-days {
          font-size: 12px;
          color: ${accentColor};
          font-weight: 600;
          background: ${accentColor}15;
          padding: 4px 10px;
          border-radius: 12px;
        }

        .tasks-list {
          margin: 10px 0 10px 36px;
          padding: 0;
        }

        .tasks-list li {
          font-size: 13px;
          color: #555;
          margin-bottom: 4px;
          list-style-type: disc;
        }

        .phase-timeline {
          font-size: 12px;
          color: #666;
          margin-left: 36px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px dashed #ddd;
        }

        .services-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .services-list li {
          font-size: 14px;
          color: #333;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }

        .service-num {
          color: #666;
          margin-right: 8px;
        }

        .timeline-section {
          background: ${accentColor}10;
          border: 1px solid ${accentColor}30;
          border-radius: 8px;
          padding: 15px;
          margin-top: 25px;
        }

        .timeline-header {
          font-size: 14px;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
        }

        .timeline-dates {
          font-size: 16px;
          color: ${accentColor};
          font-weight: 600;
        }

        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page {
            max-width: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <div class="project-title">PROJECT${projectNumber ? ` ${projectNumber}` : ''}</div>
            <div class="business-info">
              ${businessName ? `<div class="business-name">${businessName}</div>` : ''}
              <div class="business-contact">
                ${businessPhone ? `<div>${businessPhone}</div>` : ''}
                ${businessEmail ? `<div>${businessEmail}</div>` : ''}
                ${businessAddress ? `<div>${businessAddress}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="header-right">
            ${businessLogo ? `<div class="logo"><img src="${businessLogo}" alt="Logo" /></div>` : ''}
          </div>
        </div>

        <!-- Content -->
        <div class="content">
          <!-- Client & Project Info -->
          <div class="info-section">
            <div class="info-block">
              <div class="info-label">Client</div>
              <div class="info-value">${displayClientName}</div>
              ${displayClientPhone ? `<div class="info-detail">${displayClientPhone}</div>` : ''}
              ${displayClientEmail ? `<div class="info-detail">${displayClientEmail}</div>` : ''}
              ${displayClientAddress ? `<div class="info-detail">${displayClientAddress}</div>` : ''}
            </div>
            <div class="info-block">
              <div class="info-label">Project Details</div>
              ${projectName ? `<div class="info-value">${projectName}</div>` : ''}
              <div class="info-detail">Date: ${date}</div>
            </div>
          </div>

          <!-- Scope -->
          ${scope && scope.description ? `
            <div class="section">
              <div class="section-title">PROJECT SCOPE</div>
              <div class="scope-text">${scope.description}</div>
              ${scope.complexity ? `<div style="margin-top: 8px; font-size: 12px; color: #666;">Complexity: <strong>${scope.complexity}</strong></div>` : ''}
            </div>
          ` : ''}

          <!-- Phases -->
          ${phases && phases.length > 0 ? `
            <div class="section">
              <div class="section-title">PROJECT PHASES</div>
              ${generatePhasesHTML()}
            </div>
          ` : ''}

          <!-- Services -->
          ${generateServicesHTML()}

          <!-- Timeline -->
          ${schedule.startDate && schedule.projectdEndDate ? `
            <div class="timeline-section">
              <div class="timeline-header">Project Timeline</div>
              <div class="timeline-dates">
                ${formatDate(schedule.startDate)} - ${formatDate(schedule.projectdEndDate)}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate PDF from project data
 */
export const generateProjectPDF = async (projectData) => {
  try {
    const html = generateProjectHTML(projectData);

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    return uri;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

/**
 * Share project PDF
 */
export const shareProjectPDF = async (projectData) => {
  try {
    const pdfUri = await generateProjectPDF(projectData);

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Error', 'Sharing is not available on this device');
      return;
    }

    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Project ${projectData.projectNumber || projectData.projectName || ''}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('Error sharing PDF:', error);
    Alert.alert('Error', 'Failed to share project. Please try again.');
  }
};

/**
 * Send project PDF via email
 */
export const emailProjectPDF = async (projectData, recipientEmail) => {
  try {
    const pdfUri = await generateProjectPDF(projectData);

    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Error', 'Email is not configured on this device');
      return;
    }

    const clientName = projectData.clientName ||
                       (typeof projectData.client === 'string' ? projectData.client : projectData.client?.name) ||
                       'Client';

    await MailComposer.composeAsync({
      recipients: recipientEmail ? [recipientEmail] : [],
      subject: `Project ${projectData.projectNumber || ''} - ${projectData.projectName || 'Your Project'}`,
      body: `Dear ${clientName},\n\nPlease find attached your project summary for ${projectData.projectName || 'your project'}.\n\nThank you for your business!\n\nBest regards,\n${projectData.businessName || 'Your Business'}`,
      isHtml: false,
      attachments: [pdfUri],
    });
  } catch (error) {
    console.error('Error sending email:', error);
    Alert.alert('Error', 'Failed to send email. Please try again.');
  }
};

/**
 * Send project PDF via SMS/Text (shares the PDF)
 */
export const smsProjectPDF = async (projectData) => {
  try {
    await shareProjectPDF(projectData);
  } catch (error) {
    console.error('Error sending via SMS:', error);
    Alert.alert('Error', 'Failed to send project. Please try again.');
  }
};
