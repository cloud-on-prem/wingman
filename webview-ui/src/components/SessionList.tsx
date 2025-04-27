import React from 'react';
// Import Lucide icons
import { History, Plus } from 'lucide-react'; 

// Define the interface for session metadata
export interface SessionMetadata {
    id: string;
    modified: string; // ISO 8601 string from backend
    metadata: {
        title: string; // Keep title if used, otherwise remove if only description is needed
        description?: string;
        // created/updated numbers removed from here
    };
    isLocal?: boolean; // Flag for locally created, unsaved sessions
}

interface SessionListProps {
    sessions: SessionMetadata[];
    currentSessionId: string | null;
    onSessionSelect: (sessionId: string) => void;
    onCreateSession: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({
    sessions,
    currentSessionId,
    onSessionSelect,
    onCreateSession
}) => {
    // Ensure sessions is an array and has valid items
    const validSessions = Array.isArray(sessions)
        ? sessions.filter(session =>
            session &&
            typeof session === 'object' &&
            session.id &&
            session.metadata &&
            typeof session.metadata === 'object')
        : [];

    return (
        <div className="vscode-session-list">
            <div className="vscode-session-list-header">
                <h3>
                    <History size={16} className="session-header-icon" /> {/* Use Lucide History icon */}
                    Sessions
                </h3>
                <button
                    className="vscode-action-button"
                    onClick={onCreateSession}
                    title="Create new session"
                >
                    <Plus size={16} /> {/* Use Lucide Plus icon */}
                </button>
            </div>

            <div className="vscode-session-items">
                {validSessions.length === 0 ? (
                    <div className="vscode-empty-sessions">
                        No saved sessions
                    </div>
                ) : (
                    // Sort sessions: local "New Chat" first, then by updated date descending
                    [...validSessions] // Create a shallow copy to avoid mutating the original prop
                        .sort((a, b) => {
                            if (a.isLocal && !b.isLocal) return -1; // a (local) comes before b (saved)
                            if (!a.isLocal && b.isLocal) return 1;  // b (local) comes before a (saved)
                            // If both are local or both are saved, sort by date
                            // Access top-level 'modified' string and parse
                            const dateA = a.modified ? new Date(a.modified).getTime() : 0; // Use 0 only if modified is missing/invalid
                            const dateB = b.modified ? new Date(b.modified).getTime() : 0; // Use 0 only if modified is missing/invalid
                            return dateB - dateA; // Descending order (newest first)
                        })
                        .map(session => {
                            // Determine the display name based on isLocal flag and description
                            let displayName;
                            if (session.isLocal) {
                                displayName = "New Chat"; // Consistent name for unsaved chats
                            } else if (session.metadata.description && session.metadata.description.trim()) {
                                displayName = session.metadata.description.trim();
 } else {
     // Fallback for saved sessions without a description
     displayName = "Untitled Session"; // Use "Untitled Session" as fallback
 }

                            // Format the date/time string
                            const dateTimeString = session.modified ? new Date(session.modified).toLocaleString() : 'Invalid date'; // Access top-level 'modified'

                            return (
                                <div
                                    key={session.id}
                                    className={`vscode-session-item ${currentSessionId === session.id ? 'active' : ''}`}
                                    onClick={() => onSessionSelect(session.id)}
                                    title={`${displayName}\nLast updated: ${dateTimeString}`} // Tooltip with more info
                                >
                                    <div className="vscode-session-item-content">
                                        <div className="vscode-session-item-name session-name-truncated">
                                            {displayName}
                                        </div>
                                        <div className="vscode-session-item-info">
                                            {dateTimeString}
                                        </div>
                                    </div>
                                    {/* Add action buttons (like delete, rename) here if needed in the future */}
                                </div>
                            );
                        })
                )}
            </div>
        </div>
    );
};
