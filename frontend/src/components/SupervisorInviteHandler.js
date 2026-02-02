/**
 * SupervisorInviteHandler
 * Wrapper component that manages supervisor invite popup display
 */

import React from 'react';
import SupervisorInvitePopup from './SupervisorInvitePopup';
import { useSupervisorInvites } from '../hooks/useSupervisorInvites';

const SupervisorInviteHandler = ({ onInvitesHandled }) => {
  const { invites, loading } = useSupervisorInvites();

  if (loading || !invites || invites.length === 0) {
    return null;
  }

  const handleComplete = (accepted) => {
    if (onInvitesHandled) {
      onInvitesHandled(accepted);
    }
  };

  return (
    <SupervisorInvitePopup
      invites={invites}
      onComplete={handleComplete}
    />
  );
};

export default SupervisorInviteHandler;
