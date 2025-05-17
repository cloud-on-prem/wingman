import React from 'react';
import './WelcomeView.css';
import { GooseLogo } from './GooseLogo';
import { WelcomeMessage } from './WelcomeMessage';
import { RecentConversationsList } from './RecentConversationsList';
import { VersionDisplay } from './VersionDisplay';
import { History } from 'lucide-react'; // Import History icon

interface WelcomeViewProps {
  extensionVersion: string;
  onSessionSelect: (sessionId: string) => void;
  sessions: any[];
  isLoading: boolean;
  onCreateSession: () => void;
  gooseIcon?: string; 
  onToggleSessionDrawer: () => void; // Add this prop
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  extensionVersion,
  onSessionSelect,
  sessions,
  isLoading,
  onCreateSession,
  gooseIcon,
  onToggleSessionDrawer // Destructure new prop
}) => {
  return (
    <div className="welcome-view">
      <div className="welcome-view-container">
        <GooseLogo gooseIcon={gooseIcon} />
        <WelcomeMessage />
        <div className="recent-tasks-header">
          <History size={18} className="recent-tasks-icon" />
          <h2>RECENT TASKS</h2>
        </div>
        <RecentConversationsList 
          sessions={sessions}
          onSessionSelect={onSessionSelect}
          onCreateSession={onCreateSession}
          isLoading={isLoading}
          onViewAllHistory={onToggleSessionDrawer} // Pass down the handler
        />
        <VersionDisplay version={extensionVersion} />
      </div>
    </div>
  );
};
