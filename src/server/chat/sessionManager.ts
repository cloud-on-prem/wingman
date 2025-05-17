import { EventEmitter } from 'events';
import { ServerManager } from '../serverManager';
import { Message } from '../../types';
import * as vscode from 'vscode';
import { logger as singletonLogger } from '../../utils/logger'; // Import singletonLogger

// Create a logger instance for this module
const logger = singletonLogger.createSource('SessionManager');

export interface SessionMetadata {
    id: string;
    path: string;
    modified: string;
    metadata: {
        working_dir: string;
        title?: string;
        description: string;
        message_count: number;
        total_tokens: number;
    };
    isLocal?: boolean;
}

export interface Session {
    session_id: string;
    metadata: SessionMetadata['metadata'];
    messages: Message[];
}

export enum SessionEvents {
    SESSIONS_LOADED = 'sessionsLoaded',
    SESSION_LOADED = 'sessionLoaded',
    SESSION_CREATED = 'sessionCreated',
    SESSION_SWITCHED = 'sessionSwitched',
    ERROR = 'error'
}

/**
 * Manages chat sessions and their persistence
 */
export class SessionManager {
    private serverManager: ServerManager;
    private eventEmitter: EventEmitter;
    private sessions: SessionMetadata[] = [];
    private currentSessionId: string | null = null;
    private currentSession: Session | null = null;

    constructor(serverManager: ServerManager) {
        this.serverManager = serverManager;
        this.eventEmitter = new EventEmitter();
    }

    // Helper function to get current active local session metadata
    private getLocalSessionMetadata(): SessionMetadata | null {
        if (this.currentSessionId) {
            // Find the metadata in our current list that matches the ID and is marked local
            const localMeta = this.sessions.find(s => s.id === this.currentSessionId && s.isLocal);
            return localMeta || null;
        }
        return null;
    }


    /**
     * Fetch list of available sessions
     */
    public async fetchSessions(): Promise<SessionMetadata[]> {
        let backendSessions: SessionMetadata[] = [];
        const localSessionMeta = this.getLocalSessionMetadata(); // Get local session meta *before* potential API error

        try {
            const apiClient = this.serverManager.getApiClient();
            if (!apiClient || !this.serverManager.isReady()) {
                console.error('Cannot fetch sessions: Server not ready');
                // Fall through to error handling below which checks for local session
                throw new Error('Server not ready');
            }

            // Fetch from backend
            const rawSessions = await apiClient.listSessions();
            if (Array.isArray(rawSessions)) {
                console.log(`Fetched ${rawSessions.length} sessions from API`);

                // Process sessions to ensure they match our expected format
                backendSessions = rawSessions.map(session => {
                    // Make sure each session has a title and it's based on description if needed
                    if (!session.metadata.title && session.metadata.description) {
                        session.metadata.title = session.metadata.description;
                    } else if (!session.metadata.title) {
                        session.metadata.title = `Session ${session.id.slice(0, 8)}`;
                    }
                    // Ensure isLocal is false for backend sessions
                    return { ...session, isLocal: false };
                });
            } else {
                console.log('No sessions returned from API or unexpected format');
                backendSessions = [];
            }

        } catch (error) {
            console.error('Error fetching sessions from API:', error);
            // Keep backendSessions as empty array, proceed to merge logic below
            backendSessions = [];
        }

        // Determine the final list based on backend sync status
        let finalSessions: SessionMetadata[];

        if (localSessionMeta) {
            const backendHasSynced = backendSessions.some(s => s.id === localSessionMeta.id);
            if (backendHasSynced) {
                // Backend has the session, use the backend list exclusively
                console.log(`Session ${localSessionMeta.id} synced with backend. Using backend list.`);
                finalSessions = backendSessions;
            } else {
                // Backend hasn't synced yet (or API failed), keep local session prepended
                console.log(`Session ${localSessionMeta.id} not found in backend list. Prepending local session.`);
                finalSessions = [localSessionMeta, ...backendSessions];
            }
        } else {
            // No active local session, just use the backend list
            finalSessions = backendSessions;
        }

        // Ensure no duplicates (though the logic above should prevent it)
        const uniqueSessions = Array.from(new Map(finalSessions.map(s => [s.id, s])).values());

        this.sessions = uniqueSessions; // Update internal state
        this.emit(SessionEvents.SESSIONS_LOADED, uniqueSessions);
        return uniqueSessions;
    }

    /**
     * Load a specific session by ID
     */
    public async loadSession(sessionId: string): Promise<Session | null> {
        // Optimistic update can be removed if SESSION_LOADED is consistently emitted with full data later
        // this.eventEmitter.emit(SessionEvents.SESSION_LOADED, { sessionId, messages: [] }); 
        logger.info(`Loading session: ${sessionId}`);
        try {
            const apiClient = this.serverManager.getApiClient();
            if (!apiClient || !this.serverManager.isReady()) {
                logger.error(`Cannot load session ${sessionId}: Server or API client not ready.`);
                this.emit(SessionEvents.ERROR, new Error('Server not ready for loading session'));
                return null;
            }

            try {
                // logger.debug(`Attempting to fetch session history via apiClient for ID: ${sessionId}`);
                const session = await apiClient.getSessionHistory(sessionId);
                // logger.info(`Successfully fetched session history for ID: ${sessionId}. Message count: ${session?.messages?.length}`);
                
                if (!session) {
                    logger.warn(`Session history not found by API for ID: ${sessionId}`);
                    this.emit(SessionEvents.ERROR, new Error(`Session ${sessionId} not found by API.`));
                    return null;
                }

                // Make sure the session has a title property
                if (!session.metadata.title && session.metadata.description) {
                    session.metadata.title = session.metadata.description;
                }

                this.currentSessionId = sessionId;
                this.currentSession = session;
                this.emit(SessionEvents.SESSION_LOADED, session); 
                // logger.debug(`Emitted SESSION_LOADED for ${sessionId} with full data.`);
                return session;
            } catch (error) {
                logger.error(`Error loading session ${sessionId} from API:`, error);
                this.emit(SessionEvents.ERROR, error);
                return null;
            }
        } catch (error) {
            logger.error(`General error in loadSession ${sessionId}:`, error);
            this.emit(SessionEvents.ERROR, error);
            return null;
        }
    }

    /**
     * Switch to a different session
     */
    public async switchSession(sessionId: string): Promise<boolean> {
        try {
            const session = await this.loadSession(sessionId);
            if (session) {
                // Successfully loaded the session, now refresh the list
                // to ensure the UI is up-to-date (including merging local session if needed)
                await this.fetchSessions();
                this.emit(SessionEvents.SESSION_SWITCHED, session);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`Error switching to session ${sessionId}:`, error);
            this.emit(SessionEvents.ERROR, error);
            return false;
        }
    }

    /**
     * Create a new session
     */
    public async createSession(workingDir: string, description?: string): Promise<string | null> {
        try {
            // Create a local session without API call
            const sessionId = `${new Date().toISOString().split('T')[0].replace(/-/g, '')}${new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '')}`;
            const sessionTitle = description || `Session ${new Date().toLocaleString()}`;

            console.log(`Creating local session with ID: ${sessionId}`);

            // Create a new session object
            const newSession: Session = {
                session_id: sessionId,
                metadata: {
                    working_dir: workingDir,
                    title: sessionTitle,
                    description: sessionTitle,
                    message_count: 0,
                    total_tokens: 0
                },
                messages: []
            };

            // Create session metadata
            const newSessionMetadata: SessionMetadata = {
                id: sessionId,
                path: `${workingDir}/${sessionId}`,
                modified: new Date().toISOString(),
                metadata: {
                    working_dir: workingDir,
                    title: sessionTitle,
                    description: sessionTitle,
                    message_count: 0,
                    total_tokens: 0
                },
                isLocal: true // Mark this session as local-only
            };

            // Update local state
            this.sessions.push(newSessionMetadata);
            this.currentSessionId = sessionId;
            this.currentSession = newSession;

            // Emit events
            this.emit(SessionEvents.SESSION_CREATED, newSession);
            this.emit(SessionEvents.SESSION_LOADED, newSession);
            this.emit(SessionEvents.SESSIONS_LOADED, this.sessions);

            return sessionId;
        } catch (error) {
            console.error('Error creating session:', error);
            this.emit(SessionEvents.ERROR, error);
            return null;
        }
    }

    /**
     * Get the current session
     */
    public getCurrentSession(): Session | null {
        return this.currentSession;
    }

    /**
     * Get the current session ID
     */
    public getCurrentSessionId(): string | null {
        return this.currentSessionId;
    }

    /**
     * Get session metadata list
     */
    public getSessions(): SessionMetadata[] {
        return this.sessions;
    }

    /**
     * Emit a session-related event (public method for external use)
     * @param event Event name from SessionEvents
     * @param data Event data
     */
    public emitEvent(event: SessionEvents, data: any): void {
        this.eventEmitter.emit(event, data);
    }

    /**
     * Subscribe to session events
     */
    public on(event: SessionEvents, listener: (...args: any[]) => void): void {
        this.eventEmitter.on(event, listener);
    }

    /**
     * Unsubscribe from session events
     */
    public off(event: string, listener: (...args: any[]) => void): void {
        this.eventEmitter.off(event, listener);
    }

    private emit(event: SessionEvents, ...args: any[]): void {
        this.eventEmitter.emit(event, ...args);
    }
}
