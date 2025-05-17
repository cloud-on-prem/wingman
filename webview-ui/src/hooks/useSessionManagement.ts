import { useState, useEffect, useCallback, RefObject } from 'react'; // Combined imports
import { getVSCodeAPI } from '../utils/vscode';
import { MessageType } from '@common-types/index'; // Corrected import path
import { SessionMetadata } from '../components/SessionList';

interface UseSessionManagementResult {
    sessions: SessionMetadata[];
    currentSessionId: string | null;
    showSessionDrawer: boolean;
    fetchSessions: () => void;
    handleSessionSelect: (sessionId: string) => void;
    handleCreateSession: () => void;
    toggleSessionDrawer: () => void;
    currentSession: SessionMetadata | null;
}

// Accept refs for the drawer and toggle button
export const useSessionManagement = (
    isLoading: boolean,
    drawerRef: RefObject<HTMLDivElement>,
    toggleButtonRef: RefObject<HTMLButtonElement>
): UseSessionManagementResult => {
    const [sessions, setSessions] = useState<SessionMetadata[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [showSessionDrawer, setShowSessionDrawer] = useState<boolean>(false);

    const vscode = getVSCodeAPI();

    const fetchSessions = useCallback(() => {
        try {
            console.log('Fetching sessions...');
            vscode.postMessage({
                command: MessageType.GET_SESSIONS
            });
        } catch (err) {
            console.error('Error fetching sessions:', err);
            setSessions([]);
        }
    }, [vscode]);

    const handleSessionSelect = useCallback((sessionId: string) => {
        if (isLoading) {
            return;
        } // Prevent session switching during generation

        // If we're already on this session, just close the drawer
        if (sessionId === currentSessionId) {
            setShowSessionDrawer(false);
            return;
        }

        // console.log(`[useSessionManagement] handleSessionSelect: Attempting to switch to session ID: ${sessionId}`); // Removed log
        vscode.postMessage({
            command: MessageType.SWITCH_SESSION,
            sessionId: sessionId
        });

        // Close the drawer after selection
        setShowSessionDrawer(false);
    }, [isLoading, currentSessionId, vscode]);

    const handleCreateSession = useCallback(() => {
        if (isLoading) {
            return;
        } // Prevent session creation during generation

        vscode.postMessage({
            command: MessageType.CREATE_SESSION
        });

        // Close the drawer after creation request
        setShowSessionDrawer(false);
    }, [isLoading, vscode]);

    const toggleSessionDrawer = useCallback(() => {
        if (isLoading) {
            return;
        } // Prevent toggling during generation

        // If we're opening the drawer, refresh the sessions list
        if (!showSessionDrawer) {
            fetchSessions();
        }

        setShowSessionDrawer(!showSessionDrawer);
    }, [isLoading, showSessionDrawer, fetchSessions]);

    // Effect to handle clicks outside the drawer
    useEffect(() => {
        // Only add listener if the drawer is open
        if (!showSessionDrawer) {
            return;
        }

        const handleClickOutside = (event: MouseEvent) => {
            // Check if click is outside the drawer AND outside the toggle button
            if (
                drawerRef.current &&
                !drawerRef.current.contains(event.target as Node) &&
                toggleButtonRef.current &&
                !toggleButtonRef.current.contains(event.target as Node)
            ) {
                // Click was outside both, close the drawer
                setShowSessionDrawer(false);
            }
        };

        // Add listener on mount/when drawer opens
        document.addEventListener('mousedown', handleClickOutside);
        // console.log('Added click outside listener'); // Debug log

        // Cleanup listener on unmount/when drawer closes
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            // console.log('Removed click outside listener'); // Debug log
        };
    }, [showSessionDrawer, drawerRef, toggleButtonRef]); // Dependencies include refs

    // Set up listener for session-related events
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (!message || !message.command) {
                return;
            }

            switch (message.command) {
                case MessageType.SESSIONS_LIST:
                    // Handle sessions list
                    if (message.sessions) {
                        // console.log('Received sessions list:', message.sessions);
                        // Ensure we're setting an array and validate session data structure
                        const validSessions = Array.isArray(message.sessions)
                            ? message.sessions.filter((session: any) =>
                                session &&
                                typeof session === 'object' &&
                                session.id &&
                                session.metadata &&
                                typeof session.metadata === 'object')
                            : [];

                        // console.log('Valid sessions after filtering:', validSessions.length);
                        setSessions(validSessions);
                    }
                    break;
                case MessageType.SESSION_LOADED:
                // case 'sessionLoaded': // Removed as it's likely a typo/old code
                    // Handle session loaded event
                    if (message.sessionId) {
                        // console.log('Loaded session:', message.sessionId);
                        setCurrentSessionId(message.sessionId);
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Find the current session from the sessions list
    const currentSession = sessions.find(s => s && s.id === currentSessionId) || null;

    return {
        sessions,
        currentSessionId,
        showSessionDrawer,
        fetchSessions,
        handleSessionSelect,
        handleCreateSession,
        toggleSessionDrawer,
        currentSession
    };
};
