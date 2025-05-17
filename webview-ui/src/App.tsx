import React, { useState, useCallback, useEffect, useRef } from 'react';
import './vscodeStyles.css'; // Import VS Code theme variables
// Import new components
import { Header } from './components/Header';
import { SessionList } from './components/SessionList';
import MessageList from './components/messages/MessageList';
import { ChatInput } from './components/input/ChatInput';
import { WelcomeView } from './components/welcome/WelcomeView';

// Import hooks
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { useSessionManagement } from './hooks/useSessionManagement';

// Import types
import { Message, MessageType } from './types/index';
import { getVSCodeAPI } from './utils/vscode';

const App: React.FC = () => {
    // State for UI elements
    const [inputMessage, setInputMessage] = useState<string>('');
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const chatInputRef = useRef<HTMLTextAreaElement>(null);
    // Refs for click-outside logic
    const sessionDrawerRef = useRef<HTMLDivElement>(null);
    const sessionToggleButtonRef = useRef<HTMLButtonElement>(null); // Ref for the button in Header

    // Use the VS Code messaging hook
    const {
        messages,
        serverStatus,
        isLoading,
        intermediateText,
        codeReferences,
        // Remove prependedCode related imports
        // prependedCode, 
        // hasPrependedCode, 
        sendChatMessage,
        stopGeneration,
        restartServer,
        // clearPrependedCode 
        shikiTheme,
        extensionVersion,
        resources
    } = useVSCodeMessaging();

    // Log messages when they change - with error handling
    useEffect(() => {
        try {
            // Use a simpler message logging approach to avoid circular dependencies
            if (messages.length > 0) {
                console.log(`App: messages state updated - count: ${messages.length}, latest role: ${messages[messages.length - 1]?.role || 'unknown'}`);
            } else {
                console.log('App: messages state updated - no messages');
            }
        } catch (err) {
            console.error('Error in messages useEffect:', err);
        }
    }, [messages]);

    // Use the session management hook
    const {
        sessions,
        currentSessionId,
        showSessionDrawer,
        handleSessionSelect,
        handleCreateSession,
        toggleSessionDrawer,
        currentSession,
        fetchSessions
    } = useSessionManagement(isLoading, sessionDrawerRef, sessionToggleButtonRef); // Pass refs to the hook

    // Handler for opening the settings file
    const handleOpenSettings = useCallback(() => {
        const vscode = getVSCodeAPI();
        vscode.postMessage({
            command: MessageType.OPEN_SETTINGS_FILE
        });
    }, []);

    // Handler for sending a chat message
    const handleSendMessage = useCallback(() => {
        const trimmedMessage = inputMessage.trim();
        if (!trimmedMessage && codeReferences.length === 0) {
            return;
        }

        sendChatMessage(trimmedMessage, codeReferences, currentSessionId);
        setInputMessage('');
    }, [inputMessage, codeReferences, currentSessionId, sendChatMessage]);

    // Handler for copying message content to clipboard
    const handleCopyMessage = useCallback((message: Message) => {
        if (!message.content || message.content.length === 0) {
            return;
        }

        // Collect all text content
        const textContent = message.content
            .filter((item: any) => item.type === 'text' && 'text' in item && item.text && item.text.trim() !== '')
            .map((item: any) => 'text' in item ? item.text : '')
            .join('\n\n');

        if (textContent) {
            navigator.clipboard.writeText(textContent).then(() => {
                // Show success animation
                if (message.id) {
                    setCopiedMessageId(message.id);
                    // Reset after animation completes
                    setTimeout(() => setCopiedMessageId(null), 600);
                }
            });
        }
    }, []);

    // Handler for removing a code reference
    const handleRemoveCodeReference = useCallback((id: string) => {
        // Sends a message to the extension to remove the code reference
        const vscode = getVSCodeAPI();
        vscode.postMessage({
            command: MessageType.REMOVE_CODE_REFERENCE,
            id
        });
        // The actual state update will happen when the extension sends back a confirmation
    }, []);

    // Handler for focusing the chat input
    const handleFocusInput = useCallback(() => {
        setTimeout(() => {
            const textareaElement = document.querySelector('.input-row textarea') as HTMLTextAreaElement;
            if (textareaElement) {
                textareaElement.focus();
            }
        }, 100);
    }, []);

    // Listen for messages from the extension to focus the input
    useEffect(() => {
        const vscode = getVSCodeAPI();
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message && message.command === MessageType.FOCUS_CHAT_INPUT) {
                handleFocusInput();
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleFocusInput]);

    // Send webview ready message to extension host on load
    useEffect(() => {
        const vscode = getVSCodeAPI();
        vscode.postMessage({ command: MessageType.WEBVIEW_READY });
        console.log('App: Sent WEBVIEW_READY to extension host.');
    }, []);
    
    // Fetch sessions on initial load for the welcome screen
    useEffect(() => {
        // Fetch sessions on component mount to populate welcome screen
        // Adding a small delay to allow the backend to fully initialize
        const timer = setTimeout(() => {
            fetchSessions();
        }, 1500); // Delay of 1.5 seconds

        return () => clearTimeout(timer); // Cleanup timer on unmount
    }, [fetchSessions]);

    // Determine whether to show the welcome screen or chat interface
    const showWelcomeScreen = messages.length === 0 && !currentSession;

    return (
        <div className="container">
            <Header
                status={serverStatus}
                currentSession={currentSession}
                onToggleSessionDrawer={toggleSessionDrawer}
                isGenerating={isLoading}
                onNewSession={handleCreateSession}
                onOpenSettings={handleOpenSettings} // Pass settings handler
                toggleButtonRef={sessionToggleButtonRef} // Pass ref down to Header
            />

            {showSessionDrawer && (
                // Assign the ref to the drawer's container div
                <div ref={sessionDrawerRef} className="session-drawer-container"> {/* Added a wrapper div for the ref */}
                    <SessionList
                        sessions={sessions}
                        currentSessionId={currentSessionId}
                        onSessionSelect={handleSessionSelect}
                        onCreateSession={handleCreateSession}
                    />
                </div>
            )}

            {showWelcomeScreen ? (
                <WelcomeView
                    extensionVersion={extensionVersion}
                    onSessionSelect={handleSessionSelect}
                    sessions={sessions}
                    isLoading={isLoading}
                    onCreateSession={handleCreateSession}
                    gooseIcon={resources.gooseIcon}
                    onToggleSessionDrawer={toggleSessionDrawer} // Pass the handler
                />
            ) : (
                <>
                    <div className="message-container">
                        <MessageList
                            messages={messages}
                            isLoading={isLoading}
                            copiedMessageId={copiedMessageId}
                            intermediateText={intermediateText}
                            serverStatus={serverStatus}
                            onCopyMessage={handleCopyMessage}
                            onStopGeneration={stopGeneration}
                            restartServer={restartServer}
                        />
                    </div>

                    <ChatInput
                        inputMessage={inputMessage}
                        codeReferences={codeReferences}
                        isLoading={isLoading}
                        onInputChange={setInputMessage}
                        onSendMessage={handleSendMessage}
                        onStopGeneration={stopGeneration}
                        onRemoveCodeReference={handleRemoveCodeReference}
                    />
                </>
            )}
        </div>
    );
};

export default App;
