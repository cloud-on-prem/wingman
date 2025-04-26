import React, { useState, useMemo } from 'react';
import './GeneratingIndicator.css';

interface GeneratingIndicatorProps {
    onStop: () => void;
    intermediateContent: string | null;
    errorMessage?: string | null;
}

const GeneratingIndicator: React.FC<GeneratingIndicatorProps> = ({
    onStop,
    intermediateContent = null,
    errorMessage = null
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    // Determine activity type and label based on intermediate content
    const { activityType, headerLabel } = useMemo(() => {
        if (!intermediateContent) {
            return { activityType: 'thinking', headerLabel: 'Thinking' };
        }
        
        if (intermediateContent.includes('Viewing file')) {
            return { activityType: 'viewing', headerLabel: 'Viewing File' };
        }
        
        if (intermediateContent.includes('Editing file')) {
            return { activityType: 'editing', headerLabel: 'Editing File' };
        }
        
        if (intermediateContent.includes('Running command')) {
            return { activityType: 'command', headerLabel: 'Running Command' };
        }
        
        if (intermediateContent.includes('Using tool')) {
            return { activityType: 'tool', headerLabel: 'Using Tool' };
        }
        
        return { activityType: 'thinking', headerLabel: 'Thinking' };
    }, [intermediateContent]);
    
    // Get appropriate codicon class based on activity type
    const getActivityIconClass = () => {
        switch(activityType) {
            case 'thinking':
                return 'codicon-hubot';
            case 'viewing':
                return 'codicon-file-text';
            case 'editing':
                return 'codicon-edit';
            case 'command':
                return 'codicon-terminal';
            case 'tool':
                return 'codicon-tools';
            default:
                return 'codicon-hubot';
        }
    };

    return (
        <div className="generating-container">
            {intermediateContent && (
                <div className={`thinking-content ${activityType}`}>
                    <div className="thinking-header">
                        <span className="activity-label">
                            <i className={`codicon ${getActivityIconClass()}`} aria-hidden="true"></i>
                            {headerLabel}
                        </span>
                        <button
                            className="collapse-button"
                            onClick={toggleCollapse}
                            title={isCollapsed ? "Expand thinking" : "Collapse thinking"}
                        >
                            <i className={`codicon ${isCollapsed ? "codicon-chevron-down" : "codicon-chevron-up"}`} aria-hidden="true"></i>
                        </button>
                    </div>
                    {!isCollapsed && (
                        <div className="intermediate-text">
                            <pre>{intermediateContent}</pre>
                        </div>
                    )}
                </div>
            )}
            <div className={`generating-indicator ${activityType}`}>
                {errorMessage ? (
                    <>
                        <span className="error-message-container">
                            <i className="codicon codicon-error" aria-hidden="true"></i>
                            {errorMessage}
                        </span>
                        <button
                            className="restart-server-button"
                            onClick={onStop}
                            title="Restart server"
                        >
                            <i className="codicon codicon-refresh" aria-hidden="true"></i>
                            Restart Server
                        </button>
                    </>
                ) : (
                    <>
                        <div className="dot-pulse"></div>
                        <span>Generating...</span>
                        <button
                            className="stop-generation-button"
                            onClick={onStop}
                            title="Stop generation"
                        >
                            <i className="codicon codicon-stop" aria-hidden="true"></i>
                            Stop
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default GeneratingIndicator;
