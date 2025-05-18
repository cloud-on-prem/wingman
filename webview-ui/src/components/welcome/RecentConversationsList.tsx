import React from 'react';
import { RecentConversationItem } from './RecentConversationItem';

interface Session {
  id: string;
  metadata: {
    description?: string;
    message_count?: number;
  };
  modified: string | number; // Could be a timestamp or date string
}

interface RecentConversationsListProps {
  sessions: Session[];
  onSessionSelect: (sessionId: string) => void;
  onCreateSession: () => void;
  isLoading: boolean;
  onViewAllHistory: () => void; // Add this prop
}

/**
 * Displays a list of recent conversations on the welcome screen.
 * If there are no conversations, displays an empty state message.
 */
export const RecentConversationsList: React.FC<RecentConversationsListProps> = ({
  sessions,
  onSessionSelect,
  onCreateSession,
  isLoading,
  onViewAllHistory, // Destructure new prop
}) => {
  // Format relative time (e.g., "2 hours ago", "Yesterday", "YYYY-MM-DD")
  const formatRelativeTime = (timestamp: string | number): string => {
    // Ensure we're working with a number
    const date = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    const now = Date.now();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      // For older dates, return the date in YYYY-MM-DD format
      const d = new Date(date);
      return d.toLocaleDateString();
    }
  };

  // Get a user-friendly title for the session
  const getSessionTitle = (session: Session): string => {
    if (session.metadata?.description) {
      return session.metadata.description;
    }
    return `Chat from ${new Date(session.modified).toLocaleDateString()}`;
  };

  // Sort sessions by modified timestamp (most recent first)
  const sortedSessions = [...sessions].sort((a, b) => {
    const timeA = typeof a.modified === 'string' ? new Date(a.modified).getTime() : a.modified;
    const timeB = typeof b.modified === 'string' ? new Date(b.modified).getTime() : b.modified;
    return timeB - timeA;
  });

  // Limit to a reasonable number of sessions to display
  const displayLimit = 5;
  const recentSessionsToDisplay = sortedSessions.slice(0, displayLimit); 

  return (
    <div className="recent-conversations-list">
      {/* The <h2> is now in WelcomeView.tsx */}

      {isLoading ? (
        <div className="loading-indicator">Loading tasks...</div>
      ) : recentSessionsToDisplay.length > 0 ? (
        <div className="conversations-container">
          {recentSessionsToDisplay.map((session) => (
            <RecentConversationItem
              key={session.id}
              id={session.id}
              title={getSessionTitle(session)}
              timestamp={formatRelativeTime(session.modified)}
              onClick={onSessionSelect}
            />
          ))}
        </div>
      ) : (
        <div className="empty-conversations">
          <p>No recent tasks yet. Start a new conversation below!</p>
        </div>
      )}

      {/* "View all history" link */}
      {sessions.length > displayLimit && !isLoading && (
        <div className="view-all-history-container">
          <button 
            className="view-all-history-button" 
            onClick={onViewAllHistory}
            title="View all history"
          >
            View all history
          </button>
        </div>
      )}

      <div className="new-conversation-section">
        <button 
          className="new-conversation-button"
          onClick={onCreateSession}
          disabled={isLoading}
        >
          Start New Conversation
        </button>
      </div>
    </div>
  );
};
