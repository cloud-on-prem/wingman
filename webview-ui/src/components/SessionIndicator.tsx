import React from 'react';
import { SessionMetadata } from './SessionList';

interface SessionIndicatorProps {
    currentSession: SessionMetadata | null;
    onToggleSessionDrawer: () => void;
    isGenerating: boolean;
}

export const SessionIndicator: React.FC<SessionIndicatorProps> = ({
    currentSession,
    onToggleSessionDrawer,
    isGenerating
}) => {
    // Add safety check for currentSession and its properties
    const isValidSession = currentSession &&
        typeof currentSession === 'object' &&
        currentSession.metadata &&
        typeof currentSession.metadata === 'object';

    // Determine the session name to display based on isLocal flag and description
    let sessionName = 'New Chat';

    if (isValidSession) {
        if (currentSession.isLocal) {
            sessionName = 'New Chat';
        } else if (currentSession.metadata.description && currentSession.metadata.description.trim()) {
            sessionName = currentSession.metadata.description.trim();
        } else if (currentSession.metadata.title) {
            sessionName = currentSession.metadata.title;
        } else {
            sessionName = 'Untitled Session';
        }
    }

    return (
        <div
            className={`vscode-session-indicator ${isGenerating ? 'disabled' : ''}`}
            onClick={isGenerating ? undefined : onToggleSessionDrawer}
            title={isGenerating ? 'Cannot change sessions while generating' : sessionName}
            style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            }}
        >
            <i className="codicon codicon-comment-discussion" style={{ flexShrink: 0 }}></i>
            <span className="vscode-session-name session-name-truncated" style={{
                flex: '1 1 auto',
                minWidth: 0
            }}>{sessionName}</span>
            <i className="codicon codicon-chevron-down" style={{ flexShrink: 0 }}></i>
        </div>
    );
}; 
