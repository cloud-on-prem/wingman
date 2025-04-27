import { EventEmitter } from 'events';
import { TextDecoder } from 'util';
import { ServerManager } from '../serverManager';
import { Message } from '../../types'; // Removed unused createUserMessage
import * as vscode from 'vscode';
import { SessionManager, SessionEvents } from './sessionManager';
import { WorkspaceContextProvider } from '../../utils/workspaceContextProvider';
import { ProblemMonitor } from '../../utils/problemMonitor'; // Added import

/**
 * Events emitted by the chat processor
 */
export enum ChatEvents {
    MESSAGE_RECEIVED = 'messageReceived',
    FINISH = 'finish',
    ERROR = 'error'
}

/**
 * Event types for SSE stream
 */
type MessageEvent =
    | { type: 'Message'; message: Message }
    | { type: 'Error'; error: string }
    | { type: 'Finish'; reason: string };

/**
 * Handles communication with the Goose server for chat functionality
 */
export class ChatProcessor {
    private serverManager: ServerManager;
    private eventEmitter: EventEmitter;
    private abortController: AbortController | null = null;
    private currentMessages: Message[] = [];
    private shouldStop: boolean = false;
    private sessionManager: SessionManager | null = null;
    private problemMonitor: ProblemMonitor; // Added ProblemMonitor instance

    constructor(serverManager: ServerManager) {
        this.serverManager = serverManager;
        this.eventEmitter = new EventEmitter();
        this.problemMonitor = new ProblemMonitor(); // Instantiate ProblemMonitor

        // Set ApiClient on ProblemMonitor when it becomes available
        // This assumes ServerManager provides a way to get the client or notifies when ready.
        // For simplicity, let's try setting it directly if available.
        const apiClient = this.serverManager.getApiClient();
        if (apiClient) {
            this.problemMonitor.setApiClient(apiClient);
        } else {
            // TODO: Handle cases where ApiClient is not immediately available
            // Maybe listen for an event from ServerManager?
            console.warn('[ChatProcessor] ApiClient not immediately available for ProblemMonitor.');
        }
    }

    /**
     * Set the session manager
     */
    public setSessionManager(sessionManager: SessionManager): void {
        this.sessionManager = sessionManager;
    }

    /**
     * Send a message to the Goose AI
     */
    public async sendMessage(
        text: string,
        codeReferences?: any[],
        prependedCode?: any,  // New parameter for <100 line code selections
        messageId?: string,
        sessionId?: string
    ): Promise<void> {
        // Detailed logging at the start of the method
        console.log("--- ChatProcessor.sendMessage Start ---");
        console.log("Received text:", text);
        console.log("Received codeReferences:", JSON.stringify(codeReferences));
        console.log("Received prependedCode:", JSON.stringify(prependedCode));
        console.log("Received messageId:", messageId);
        console.log("Received sessionId:", sessionId);

        // Ensure codeReferences is an array
        codeReferences = codeReferences || [];

        // Get the session ID (from parameter or current session)
        let effectiveSessionId: string | undefined = sessionId;

        // Only try to get current session if no sessionId was provided
        if (!effectiveSessionId && this.sessionManager) {
            const currentSessionId = this.sessionManager.getCurrentSessionId();
            if (currentSessionId) {
                effectiveSessionId = currentSessionId;
            }
        }

        console.log("Using session ID:", effectiveSessionId || "none (creating new session)");

        // Format message with prepended code if provided
        // or with code references if provided
        let formattedText = text || '';

        // FIX: Completely reworked this section to handle prependedCode correctly
        if (prependedCode) {
            console.log("DEBUG: prependedCode type:", typeof prependedCode);
            console.log("DEBUG: prependedCode keys:", prependedCode ? Object.keys(prependedCode) : 'null');

            // Extract content, fileName, and languageId safely
            const content = prependedCode.content || '';
            const languageId = prependedCode.languageId || '';
            const fileName = prependedCode.fileName || '';

            console.log(`DEBUG: Adding code block for ${fileName} (${languageId})`);
            console.log(`DEBUG: Code content length: ${content.length}`);

            // Always format with the code block, even if some properties are missing
            const codeBlock = `\`\`\`${languageId}\n${content}\n\`\`\`\n\n`;

            // Prepend the code block to the message text
            formattedText = codeBlock + formattedText;

            // Important: Clear codeReferences to ensure we don't send the code twice
            codeReferences = [];

            console.log("Formatted message with prepended code block");
            console.log("DEBUG: Final formatted text:", formattedText);
        } else if (codeReferences && codeReferences.length > 0) {
            // Original behavior for code references (≥100 lines)
            for (const reference of codeReferences) {
                if (formattedText.length > 0) {
                    formattedText += '\n\n';
                }
                formattedText += `From ${reference.filePath}:${reference.startLine}-${reference.endLine}`;
            }
            console.log("Formatted message with code references for ≥100 line selection");
        }

        console.log("Original formatted message text:", formattedText);

        // --- Context Injection Start ---
        let finalFormattedText = formattedText;
        try {
            const contextProvider = new WorkspaceContextProvider();
            const vsCodeContext = contextProvider.formatContextForPrompt(); // Assuming this is synchronous for now

            if (vsCodeContext && vsCodeContext.trim().length > 0) {
                console.log("Injecting VS Code context:\n", vsCodeContext);
                // Prepend context with clear separation
                finalFormattedText = `${vsCodeContext}\n\n---\n\n${formattedText}`;
            } else {
                console.log("No VS Code context to inject.");
            }
        } catch (error) {
            console.error("Error getting or formatting VS Code context:", error);
            // Proceed without context injection in case of error
        }
        console.log("Final formatted message text (with context):", finalFormattedText);
        // --- Context Injection End ---


        // Create a user message using the final formatted text
        const userMessageId = messageId || `user_${Date.now()}`; // Store ID for problem monitor
        const userMessage: Message = {
            id: userMessageId,
            role: 'user',
            created: Date.now(),
            content: [{
                type: 'text',
                text: finalFormattedText // Use the text with prepended context
            }]
        };

        // Add to current messages
        this.currentMessages.push(userMessage);
        console.log("Added user message to conversation, total messages:", this.currentMessages.length);

        // Reset stop flag
        this.shouldStop = false;

        // --- Problem Monitor: Capture Before ---
        // Ensure ApiClient is set on ProblemMonitor before capturing
        // (It might have become available after constructor)
        const apiClient = this.serverManager.getApiClient();
        if (apiClient && !this.problemMonitor['apiClient']) { // Check if not already set
            this.problemMonitor.setApiClient(apiClient);
            console.log('[ChatProcessor] Set ApiClient on ProblemMonitor.');
        }
        // Pass the effectiveSessionId during capture
        this.problemMonitor.captureDiagnosticsBeforeAction(userMessageId, effectiveSessionId);
        // --- Problem Monitor End ---

        try {
            // Send the message to the server
            console.log("Sending chat request to server...");
            // Get workspace directory for both the request and potential problem report
            const workspaceDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
            const response = await this.sendChatRequest(effectiveSessionId, workspaceDirectory);
            console.log("Got response from server, status:", response.status);

            // If this was a new session, load the session info after sending the first message
            if (!effectiveSessionId && this.sessionManager) {
                await this.sessionManager.fetchSessions();
            } else if (effectiveSessionId && this.sessionManager) {
                // Update existing session to remove isLocal flag after successful reply
                await this.updateSessionAfterReply(effectiveSessionId);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Create a unique ID for the AI message
            const aiMessageId = `ai_${Date.now()}`;
            console.log("Created AI message ID:", aiMessageId);

            // Initialize empty content
            let fullText = '';

            // Ensure the response body is available
            if (!response.body) {
                throw new Error('Response body is empty');
            }

            // Create a reader for the response
            const reader = response.body.getReader();
            console.log("Created reader for response body");

            // Create a new message object
            console.log("Creating initial AI message with current timestamp");
            const currentTimestamp = Date.now();
            const aiMessage: Message = {
                id: aiMessageId,
                role: 'assistant',
                created: currentTimestamp, // Use the current time for consistency
                content: [{
                    type: 'text',
                    text: ''
                }]
            };

            // Add to current messages
            this.currentMessages.push(aiMessage);
            console.log("Added AI message placeholder to conversation, total messages:", this.currentMessages.length);

            // Read the streaming response
            console.log("Starting to read streaming response...");
            while (true) {
                // Check if we should stop
                if (this.shouldStop) {
                    console.log("Stopping generation (shouldStop flag is true)");
                    reader.cancel();
                    this.emit(ChatEvents.FINISH, aiMessage, 'stopped');
                    break;
                }

                console.log("Reading chunk from stream...");
                const { value, done } = await reader.read();

                if (done) {
                    console.log("Stream complete, emitting FINISH event");
                    this.emit(ChatEvents.FINISH, aiMessage, 'complete');

                    // --- Problem Monitor: Check After ---
                    // Check for problems only if the stream completed normally
                    // Use the original user message ID that triggered this response
                    const problemReportString = await this.problemMonitor.checkAndReportNewProblems(
                        userMessageId // Removed workspaceDirectory argument
                    );
                    // --- Problem Monitor End ---
                    break;
                }

                // Convert the Uint8Array to a string
                const chunk = new TextDecoder().decode(value);
                console.log("Received chunk:", chunk);

                // Always update the content with whatever we have
                fullText += chunk;
                console.log("Updated fullText:", fullText);

                // Check if the content is a valid JSON string
                if (fullText.trim().startsWith('data:')) {
                    // Process the content
                    try {
                        // Extract the messages from the data: prefix
                        const lines = fullText.split('\n').filter(line => line.trim() !== '');

                        // Get the LAST message from the response
                        // This ensures we display the final message state
                        let lastMessageData = null;
                        let lastAssistantMessage = null;

                        // Process each line to find all messages
                        for (const line of lines) {
                            if (line.startsWith('data:')) {
                                try {
                                    const jsonStr = line.substring(5).trim();
                                    if (jsonStr === '[DONE]') { continue; }

                                    const data = JSON.parse(jsonStr);

                                    // Store the last message data we find
                                    lastMessageData = data;

                                    // If it's an assistant message, store it specifically
                                    if (data.type === 'Message' &&
                                        data.message &&
                                        data.message.role === 'assistant') {
                                        lastAssistantMessage = data.message;
                                    }
                                } catch (e) {
                                    console.error('Failed to parse JSON:', e);
                                }
                            }
                        }

                        // If we found an assistant message, use it directly
                        if (lastAssistantMessage) {
                            console.log("Using latest assistant message:", lastAssistantMessage);

                            // Update the message ID to match our expected ID pattern
                            lastAssistantMessage.id = aiMessage.id;

                            // IMPORTANT: Always use the CURRENT timestamp for consistency
                            // This ensures timestamps reflect when messages were actually received
                            lastAssistantMessage.created = Date.now();

                            // Send the extracted message directly
                            this.emit(ChatEvents.MESSAGE_RECEIVED, lastAssistantMessage);
                        }
                        // Otherwise, use any message data we found
                        else if (lastMessageData) {
                            console.log("Using latest message data:", lastMessageData);

                            // Try to extract message content
                            let messageText = '';

                            if (lastMessageData.message &&
                                lastMessageData.message.content &&
                                Array.isArray(lastMessageData.message.content) &&
                                lastMessageData.message.content[0] &&
                                lastMessageData.message.content[0].text) {
                                messageText = lastMessageData.message.content[0].text;
                            } else if (typeof lastMessageData.message === 'string') {
                                messageText = lastMessageData.message;
                            }

                            if (messageText) {
                                console.log("Extracted message text from latest data:", messageText);
                                const updatedMessage = { ...aiMessage };
                                updatedMessage.created = Date.now(); // Use current timestamp
                                updatedMessage.content = [{
                                    type: 'text',
                                    text: messageText
                                }];

                                // Send the updated message
                                this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                            } else {
                                // Last resort: use the raw JSON data
                                const updatedMessage = { ...aiMessage };
                                updatedMessage.created = Date.now(); // Use current timestamp
                                updatedMessage.content = [{
                                    type: 'text',
                                    text: JSON.stringify(lastMessageData, null, 2)
                                }];

                                this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                            }
                        } else {
                            // Extreme fallback - use raw text
                            console.log("No valid messages found, using raw text");
                            const updatedMessage = { ...aiMessage };
                            updatedMessage.created = Date.now(); // Use current timestamp
                            updatedMessage.content = [{
                                type: 'text',
                                text: fullText
                            }];

                            // Send the raw text as a message
                            this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                        }
                    } catch (e) {
                        console.error('Error processing chunk:', e);

                        // As a fallback, just use the raw text
                        const updatedMessage = { ...aiMessage };
                        updatedMessage.content = [{
                            type: 'text',
                            text: fullText
                        }];

                        // Send the raw text as a message
                        this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                    }
                } else {
                    // If it's not JSON, just use it as raw text
                    const updatedMessage = { ...aiMessage };
                    updatedMessage.created = Date.now(); // Use current timestamp
                    updatedMessage.content = [{
                        type: 'text',
                        text: fullText
                    }];

                    // Send the updated message
                    this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                }
            }
        } catch (error) {
            this.shouldStop = true;
            this.emit(ChatEvents.ERROR, error);
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    /**
     * Stop the current generation
     */
    public stopGeneration(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.shouldStop = false;

        // If there's an active message being generated, finish it with current timestamp
        if (this.currentMessages.length > 0) {
            const lastMessage = this.currentMessages[this.currentMessages.length - 1];
            if (lastMessage.role === 'assistant') {
                // Update the timestamp to the current time
                lastMessage.created = Date.now();
            }
        }

        this.emit(ChatEvents.FINISH, null, 'aborted');
    }

    /**
     * Get all current messages
     */
    public getMessages(): Message[] {
        return this.currentMessages;
    }

    /**
     * Clear all messages
     */
    public clearMessages(): void {
        this.currentMessages = [];
    }

    /**
     * Subscribe to chat events
     */
    public on(event: ChatEvents, listener: (...args: any[]) => void): void {
        this.eventEmitter.on(event, listener);
    }

    /**
     * Unsubscribe from chat events
     */
    public off(event: ChatEvents, listener: (...args: any[]) => void): void {
        this.eventEmitter.off(event, listener);
    }

    /**
     * Send a chat request to the server
     */
    private async sendChatRequest(sessionId: string | undefined, workspaceDirectory: string): Promise<Response> {
        console.log("Creating new AbortController for chat request");
        this.abortController = new AbortController();

        // Get API client from server manager
        const apiClient = this.serverManager.getApiClient();
        if (!apiClient) {
            throw new Error('API client not available');
        }

        return await apiClient.streamChatResponse(
            this.currentMessages,
            this.abortController,
            sessionId,
            workspaceDirectory
        );
    }

    private emit(event: ChatEvents, ...args: any[]): void {
        this.eventEmitter.emit(event, ...args);
    }

    // Add this helper function to ensure text content is properly formatted
    private ensureValidTextContent(text: any): string {
        // If it's already a string
        if (typeof text === 'string') {
            return text;
        }

        // If it's an object with a text property
        if (text && typeof text === 'object') {
            // Check for common message formats
            if (typeof text.text === 'string') {
                return text.text;
            }

            if (typeof text.content === 'string') {
                return text.content;
            }

            // Sometimes the content is an array of parts
            if (Array.isArray(text.content)) {
                const combinedContent = text.content
                    .map((part: any) => {
                        if (typeof part === 'string') { return part; }
                        if (part && typeof part.text === 'string') { return part.text; }
                        return '';
                    })
                    .filter(Boolean)
                    .join('\n\n');

                if (combinedContent) {
                    return combinedContent;
                }
            }

            // If the object has a 'message' property
            if (typeof text.message === 'string') {
                return text.message;
            }

            // Try to stringify the object if all else fails
            try {
                const jsonString = JSON.stringify(text);
                if (jsonString !== '{}' && jsonString !== '[]') {
                    return jsonString;
                }
            } catch (e) {
                console.error('Failed to stringify object:', e);
            }
        }

        // If it's some other type, try to convert it to string
        if (text !== undefined && text !== null) {
            try {
                return String(text);
            } catch (e) {
                console.error("Could not convert message content to string:", e);
            }
        }

        // Fallback for empty/invalid content
        return "";
    }

    /**
     * Process and handle the AI's message
     */
    private handleAIMessage(content: any, messageId: string): Message {
        // Create a fresh message object with a unique ID if we don't have one
        const aiMessage: Message = {
            id: messageId || `ai_${Date.now()}`,
            role: 'assistant',
            created: Date.now(),
            content: []
        };

        // Process the content
        const textContent = this.ensureValidTextContent(content);

        // Add the text as content
        if (textContent) {
            aiMessage.content.push({
                type: 'text',
                text: textContent
            });
        }

        // Don't emit the message event here - only in the main function
        return aiMessage;
    }

    /**
     * Update a session after a successful reply to remove the isLocal flag
     * @param sessionId The ID of the session to update
     */
    private async updateSessionAfterReply(sessionId: string): Promise<void> {
        if (!this.sessionManager) {
            return;
        }

        try {
            // Get the sessions list
            const sessions = this.sessionManager.getSessions();

            // Find the session with the matching ID
            const sessionIndex = sessions.findIndex(session => session.id === sessionId);

            if (sessionIndex !== -1 && sessions[sessionIndex].isLocal) {
                console.log(`Updating session ${sessionId} to remove isLocal flag after successful reply`);

                // Create a new session object without the isLocal flag
                const updatedSession = { ...sessions[sessionIndex] };
                delete updatedSession.isLocal;

                // Update the session in the sessions array
                const updatedSessions = [...sessions];
                updatedSessions[sessionIndex] = updatedSession;

                // Emit the sessions loaded event with the updated list
                this.sessionManager.emitEvent(SessionEvents.SESSIONS_LOADED, updatedSessions);
            }
        } catch (error) {
            console.error('Error updating session after reply:', error);
        }
    }

    /**
     * Sends a follow-up request to the AI using the current message history.
     * This is used for automatic actions like problem fixing.
     * NOTE: This duplicates stream handling logic from sendMessage. Consider refactoring.
     */
    private async _sendFollowUpRequest(sessionId: string | undefined, workspaceDirectory: string): Promise<void> {
        console.log("[ChatProcessor] Sending follow-up request for session:", sessionId, "with messages:", this.currentMessages.length);
        // Reset stop flag for the new request
        this.shouldStop = false;

        // Ensure ApiClient is available before proceeding
        const apiClient = this.serverManager.getApiClient();
        if (!apiClient) {
            console.error("[ChatProcessor] ApiClient not available for follow-up request.");
            this.emit(ChatEvents.ERROR, new Error("API client not available for follow-up request."));
            return;
        }

        try {
            // Send the message to the server using the existing history
            const response = await this.sendChatRequest(sessionId, workspaceDirectory); // sendChatRequest uses this.currentMessages
            console.log("[ChatProcessor] Got response from follow-up server request, status:", response.status);

            if (!response.ok) {
                // Attempt to read error body for more details
                let errorDetails = `HTTP error! status: ${response.status}`;
                try {
                    const errorBody = await response.text();
                    errorDetails += ` - ${errorBody}`;
                } catch (e) { /* Ignore if reading body fails */ }
                throw new Error(errorDetails);
            }

            // Process the response stream
            const aiMessageId = `ai_followup_${Date.now()}`;
            let fullText = '';
            if (!response.body) {
                throw new Error('Response body is empty');
            }
            const reader = response.body.getReader();

            const aiMessage: Message = {
                id: aiMessageId,
                role: 'assistant',
                created: Date.now(),
                content: [{ type: 'text', text: '' }]
            };
            // Add placeholder for the follow-up response *before* starting to read stream
            this.currentMessages.push(aiMessage);
            console.log("[ChatProcessor] Added follow-up AI message placeholder, total messages:", this.currentMessages.length);


            while (true) {
                if (this.shouldStop) {
                    console.log("[ChatProcessor] Stopping follow-up generation.");
                    reader.cancel(); // Attempt to cancel the stream reading
                    this.emit(ChatEvents.FINISH, aiMessage, 'stopped'); // Emit finish event for the UI
                    break;
                }

                const { value, done } = await reader.read();

                if (done) {
                    console.log("[ChatProcessor] Follow-up stream complete.");
                    this.emit(ChatEvents.FINISH, aiMessage, 'complete'); // Emit finish event for the UI

                    // --- Problem Monitor: Check *Again* After Fix Attempt ---
                    // Get the ID of the user message that contained the problem report
                    // It should be the second to last message before the current AI response placeholder
                    const fixRequestMessageId = this.currentMessages[this.currentMessages.length - 2]?.id;
                    if (fixRequestMessageId) {
                        // --- REVISED APPROACH: Simpler flow ---
                        // Let's NOT do a recursive check for now to avoid complexity.
                        // We'll just log the completion of the fix attempt.
                        console.log("[ChatProcessor] Fix attempt response complete. Manual verification needed if problems persist.");
                        // --- End Revised Approach ---

                        /* --- Original Recursive Check Logic (Commented Out) ---
                        // Capture diagnostics *before* this check, associated with the fix request message
                        // This seems complex, maybe simplify: only check once after initial response?
                        // For now, let's proceed with the check as designed.
                        // We need to ensure ProblemMonitor's state is clean before this check.
                        // The checkAndReportNewProblems method already resets the snapshot.
                        // However, we need to capture a *new* 'before' state based on the *fix attempt* response.
                        // This suggests the ProblemMonitor needs more state or a different flow.
                        const problemReportStringAfterFix = await this.problemMonitor.checkAndReportNewProblems(
                            fixRequestMessageId, // Use the ID of the "Please fix..." message
                            workspaceDirectory
                        );
                        if (problemReportStringAfterFix) {
                            console.warn("[ChatProcessor] Problems still detected after fix attempt. Stopping recursive fix for now.");
                            // Optionally, send another message indicating failure to fix, or try again (careful with loops)
                            const fixFailedMessage: Message = {
                                id: `assistant_fix_failed_${Date.now()}`,
                                role: 'assistant',
                                created: Date.now(),
                                content: [{ type: 'text', text: "I tried to fix the problems, but it seems new issues might still exist. Please review the diagnostics." }]
                            };
                            this.currentMessages.push(fixFailedMessage);
                            this.emit(ChatEvents.MESSAGE_RECEIVED, fixFailedMessage);
                        } else {
                             console.log("[ChatProcessor] No new problems detected after fix attempt.");
                        }
                        */
                    } else {
                        console.warn("[ChatProcessor] Could not find fix request message ID for post-fix problem check.");
                    }
                    // --- Problem Monitor End ---
                    break;
                }

                const chunk = new TextDecoder().decode(value);
                fullText += chunk;

                // Process and emit message updates (simplified for now, assumes text stream)
                // TODO: Refactor stream processing logic to be reusable and handle structured data
                try {
                    const lines = fullText.split('\n').filter(line => line.trim() !== '');
                    let lastAssistantMessage = null;
                    let lastMessageData = null; // Keep track of the last valid data object

                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            try {
                                const jsonStr = line.substring(5).trim();
                                if (jsonStr === '[DONE]') { continue; } // Add braces if needed by linter, though single-line continue is often allowed
                                const data = JSON.parse(jsonStr);
                                lastMessageData = data; // Update last data object
                                if (data.type === 'Message' && data.message && data.message.role === 'assistant') {
                                    lastAssistantMessage = data.message; // Store the most recent assistant message structure
                                }
                            } catch (e) { /* ignore parse errors during stream */ }
                        }
                    } // End for loop

                    // Find the placeholder message in the history
                    const placeholderIndex = this.currentMessages.findIndex(msg => msg.id === aiMessageId);

                    // Prioritize emitting the structured assistant message if found
                    if (lastAssistantMessage) {
                        lastAssistantMessage.id = aiMessageId; // Ensure ID matches placeholder
                        lastAssistantMessage.created = Date.now(); // Update timestamp
                        if (placeholderIndex !== -1) {
                            this.currentMessages[placeholderIndex] = lastAssistantMessage; // Update history
                        }
                        this.emit(ChatEvents.MESSAGE_RECEIVED, lastAssistantMessage); // Emit update
                    } else {
                        // Fallback: If no structured assistant message, update the placeholder with full text
                        if (placeholderIndex !== -1) {
                            const updatedMessage = { ...this.currentMessages[placeholderIndex] }; // Get placeholder
                            updatedMessage.created = Date.now();
                            updatedMessage.content = [{ type: 'text', text: fullText }];
                            this.currentMessages[placeholderIndex] = updatedMessage; // Update history
                            this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage); // Emit update
                        }
                    }

                } catch (e) {
                    console.error('[ChatProcessor] Error processing follow-up chunk:', e);
                    // Fallback in case of processing error
                    const placeholderIndex = this.currentMessages.findIndex(msg => msg.id === aiMessageId);
                    if (placeholderIndex !== -1) {
                        const updatedMessage = { ...this.currentMessages[placeholderIndex] };
                        updatedMessage.created = Date.now();
                        updatedMessage.content = [{ type: 'text', text: fullText }];
                        this.currentMessages[placeholderIndex] = updatedMessage; // Update history
                        this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage); // Emit update
                    }
                }
            }
        } catch (error) {
            console.error("[ChatProcessor] Error during follow-up request processing:", error);
            this.shouldStop = true; // Ensure we stop if an error occurs
            // Emit a generic error message to the UI
            const errorMessage: Message = {
                id: `error_followup_${Date.now()}`,
                role: 'assistant', // Or a dedicated 'system'/'error' role if UI supports it
                created: Date.now(),
                content: [{ type: 'text', text: `An error occurred while trying to fix the problems: ${error instanceof Error ? error.message : String(error)}` }]
            };
            this.currentMessages.push(errorMessage);
            this.emit(ChatEvents.MESSAGE_RECEIVED, errorMessage); // Show error in UI
            this.emit(ChatEvents.ERROR, error instanceof Error ? error : new Error(String(error))); // Also emit raw error event
        } finally {
            this.abortController = null; // Ensure abort controller is cleared
        }
    }
}
