import React, { useState, useEffect } from 'react';
import { useWorkerInvites } from '../hooks/useWorkerInvites';
import InvitePopup from './InvitePopup';
import { getCurrentUserId } from '../utils/storage';

/**
 * Worker Invite Handler Component
 * Checks for pending invitations and displays the InvitePopup
 * This component should be included in all worker screens
 *
 * @param {Function} onInvitesHandled - Callback when all invites are accepted/rejected
 */
const WorkerInviteHandler = ({ onInvitesHandled }) => {
  const { invites, loading, refetch } = useWorkerInvites();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    loadUserId();
  }, []);

  const loadUserId = async () => {
    const id = await getCurrentUserId();
    setUserId(id);
  };

  const handleInvitesComplete = async () => {
    // Refetch invites to see if there are more
    await refetch();

    // If callback provided, call it
    if (onInvitesHandled) {
      onInvitesHandled();
    }
  };

  // Don't render anything if loading or no invites
  if (loading || !invites || invites.length === 0 || !userId) {
    return null;
  }

  return (
    <InvitePopup
      invites={invites}
      userId={userId}
      onComplete={handleInvitesComplete}
    />
  );
};

export default WorkerInviteHandler;
