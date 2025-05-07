import { EventEmitter } from 'events';
import { TextDecoder } from 'util';
import { ServerManager } from '../serverManager';
import { Message, createUserMessage, Content } from '../../types';
import * as vscode from 'vscode';
import { SessionManager, SessionEvents } from './sessionManager';
import { logger } from '../../utils/logger';

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

    constructor(serverManager: ServerManager) {
        this.serverManager = serverManager;
        this.eventEmitter = new EventEmitter();
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
        prependedCode?: any,  
        messageId?: string, 
        sessionId?: string
    ): Promise<void> {
        if (!text || text.trim() === '') {
            if ((!codeReferences || codeReferences.length === 0) && !prependedCode) {
                logger.info('ChatProcessor: sendMessage called with empty user text and no code context. Not proceeding.');
            } else {
                logger.info('ChatProcessor: sendMessage called with empty user text (but with code context). Not proceeding as per task 2.1 focusing on user text.');
            }
            return;
        }

        console.log("--- ChatProcessor.sendMessage Start ---");
        console.log("Received text:", text);
        console.log("Received codeReferences:", JSON.stringify(codeReferences));
        console.log("Received prependedCode:", JSON.stringify(prependedCode));
        console.log("Received messageId:", messageId);
        console.log("Received sessionId:", sessionId);
        
        codeReferences = codeReferences || [];

        let effectiveSessionId: string | undefined = sessionId;

        if (!effectiveSessionId && this.sessionManager) {
            const currentSessionId = this.sessionManager.getCurrentSessionId();
            if (currentSessionId) {
                effectiveSessionId = currentSessionId;
            }
        }

        console.log("Using session ID:", effectiveSessionId || "none (creating new session)");

        let formattedText = text || '';
        
        let prependedCodeProcessedAndValid = false; 

        if (prependedCode) {
            if (prependedCode.content && typeof prependedCode.content === 'string') {
                const originalContent = prependedCode.content;
                const trimmedContent = originalContent.trim();

                if (trimmedContent === '') {
                    logger.info('ChatProcessor: prependedCode.content is empty or whitespace after trimming. Not including it.');
                } else {
                    const languageId = prependedCode.languageId || '';
                    const fileName = prependedCode.fileName || 'snippet'; 
                    
                    console.log(`DEBUG: Adding prepended code block for ${fileName} (${languageId})`);
                    console.log(`DEBUG: Prepended code content length (trimmed): ${trimmedContent.length}`);
                    
                    const codeBlock = "```" + languageId + "\n" + trimmedContent + "\n```\n\n";
                    
                    formattedText = codeBlock + formattedText;
                    codeReferences = []; 
                    prependedCodeProcessedAndValid = true;
                    
                    console.log("Formatted message with prepended code block");
                    console.log("DEBUG: Final formatted text with prepended code:", formattedText);
                }
            } else {
                logger.warn('ChatProcessor: prependedCode object present but its content is missing or not a string. Ignoring prependedCode.');
            }
        }

        const validReferenceSummaryLines: string[] = [];
        const additionalContentBlocks: Content[] = [];

        if (!prependedCodeProcessedAndValid && codeReferences && codeReferences.length > 0) {
            for (const reference of codeReferences) {
                if (reference && reference.selectedText && typeof reference.selectedText === 'string') {
                    const trimmedSelectedText = reference.selectedText.trim();
                    if (trimmedSelectedText === '') {
                        logger.info(`ChatProcessor: codeReference from ${reference.filePath || 'unknown file'} selectedText is empty. Excluding this reference.`);
                    } else {
                        validReferenceSummaryLines.push(`From ${reference.filePath}:${reference.startLine}-${reference.endLine}`);
                        
                        const codeBlock = "```" + (reference.languageId || '') + "\n" + trimmedSelectedText + "\n```";
                        additionalContentBlocks.push({ type: 'text', text: codeBlock });
                        logger.info(`ChatProcessor: Adding content from codeReference ${reference.filePath}.`);
                    }
                } else {
                    logger.warn(`ChatProcessor: codeReference from ${reference.filePath || 'unknown file'} has missing, null, or invalid selectedText. Excluding this reference.`);
                }
            }

            if (validReferenceSummaryLines.length > 0) {
                if (formattedText.length > 0) {
                    formattedText += '\n\n'; 
                }
                formattedText += validReferenceSummaryLines.join('\n'); 
                console.log("Formatted message with valid code references summary.");
            }
        }

        console.log("Final formatted message text (with reference summaries):", formattedText);
        additionalContentBlocks.forEach((block, index) => {
            if (block.type === 'text') {
                console.log(`Additional content block ${index + 1}:`, block.text.substring(0, 100) + '...'); 
            } else if (block.type === 'image') {
                console.log(`Additional content block ${index + 1}: Image block (mimeType: ${block.mimeType}, data length: ${block.data.length})`);
            } else {
                console.log(`Additional content block ${index + 1}: Unknown block type`, block);
            }
        });

        const userMessageContent: Content[] = [{ type: 'text', text: formattedText }];
        userMessageContent.push(...additionalContentBlocks); 

        const userMessage: Message = {
            id: messageId || `user_${Date.now()}`,
            role: 'user',
            created: Date.now(),
            content: userMessageContent
        };

        this.currentMessages.push(userMessage);
        console.log("Added user message to conversation, total messages:", this.currentMessages.length);

        this.shouldStop = false;

        try {
            console.log("Sending chat request to server...");
            const response = await this.sendChatRequest(effectiveSessionId);
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

            const aiMessageId = `ai_${Date.now()}`;
            console.log("Created AI message ID:", aiMessageId);

            let fullText = '';

            if (!response.body) {
                throw new Error('Response body is null');
            }

            const reader = response.body.getReader();
            console.log("Created reader for response body");

            const aiMessage: Message = {
                id: aiMessageId,
                role: 'assistant',
                created: Date.now(),
                content: [{
                    type: 'text',
                    text: ''
                }]
            };

            this.currentMessages.push(aiMessage);
            console.log("Added AI message placeholder to conversation, total messages:", this.currentMessages.length);

            while (true) {
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
                    break;
                }

                const chunk = new TextDecoder().decode(value);
                console.log("Received chunk:", chunk);

                fullText += chunk;

                if (fullText.trim().startsWith('data:')) {
                    try {
                        const lines = fullText.split('\n').filter(line => line.trim() !== '');

                        let lastMessageData = null;
                        let lastAssistantMessage = null;

                        for (const line of lines) {
                            if (line.startsWith('data:')) {
                                try {
                                    const jsonStr = line.substring(5).trim();
                                    if (jsonStr === '[DONE]') { continue; }

                                    const data = JSON.parse(jsonStr);

                                    lastMessageData = data;

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

                        if (lastAssistantMessage) {
                            console.log("Using latest assistant message:", lastAssistantMessage);

                            lastAssistantMessage.id = aiMessage.id;
                            lastAssistantMessage.created = Date.now();

                            this.emit(ChatEvents.MESSAGE_RECEIVED, lastAssistantMessage);
                        } else if (lastMessageData) {
                            console.log("Using latest message data:", lastMessageData);

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
                                updatedMessage.created = Date.now();
                                updatedMessage.content = [{
                                    type: 'text',
                                    text: messageText
                                }];

                                this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                            } else {
                                const updatedMessage = { ...aiMessage };
                                updatedMessage.created = Date.now();
                                updatedMessage.content = [{
                                    type: 'text',
                                    text: JSON.stringify(lastMessageData, null, 2)
                                }];

                                this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                            }
                        } else {
                            const updatedMessage = { ...aiMessage };
                            updatedMessage.created = Date.now();
                            updatedMessage.content = [{
                                type: 'text',
                                text: fullText
                            }];

                            this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                        }
                    } catch (e) {
                        console.error('Error processing chunk:', e);

                        const updatedMessage = { ...aiMessage };
                        updatedMessage.content = [{
                            type: 'text',
                            text: fullText
                        }];

                        this.emit(ChatEvents.MESSAGE_RECEIVED, updatedMessage);
                    }
                } else {
                    const updatedMessage = { ...aiMessage };
                    updatedMessage.created = Date.now();
                    updatedMessage.content = [{
                        type: 'text',
                        text: fullText
                    }];

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

        if (this.currentMessages.length > 0) {
            const lastMessage = this.currentMessages[this.currentMessages.length - 1];
            if (lastMessage.role === 'assistant') {
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
    private async sendChatRequest(sessionId?: string): Promise<Response> {
        console.log("Creating new AbortController for chat request");
        this.abortController = new AbortController();

        const workspaceDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

        const apiClient = this.serverManager.getApiClient();
        if (!apiClient) {
            throw new Error('API client not available');
        }

        const params = {
            prompt: this.currentMessages,
            abortController: this.abortController,
            sessionId: sessionId,
            workspaceDirectory: workspaceDirectory,
        };

        return await apiClient.streamChatResponse(params);
    }

    private emit(event: ChatEvents, ...args: any[]): void {
        this.eventEmitter.emit(event, ...args);
    }

    private ensureValidTextContent(text: any): string {
        if (typeof text === 'string') {
            return text;
        }

        if (text && typeof text === 'object') {
            if (typeof text.text === 'string') {
                return text.text;
            }

            if (typeof text.content === 'string') {
                return text.content;
            }

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

            if (typeof text.message === 'string') {
                return text.message;
            }

            try {
                const jsonString = JSON.stringify(text);
                if (jsonString !== '{}' && jsonString !== '[]') {
                    return jsonString;
                }
            } catch (e) {
                console.error('Failed to stringify object:', e);
            }
        }

        if (text !== undefined && text !== null) {
            try {
                return String(text);
            } catch (e) {
                console.error("Could not convert message content to string:", e);
            }
        }

        return "";
    }

    private handleAIMessage(content: any, messageId: string): Message {
        const aiMessage: Message = {
            id: messageId || `ai_${Date.now()}`,
            role: 'assistant',
            created: Date.now(),
            content: []
        };

        const textContent = this.ensureValidTextContent(content);

        if (textContent) {
            aiMessage.content.push({
                type: 'text',
                text: textContent
            });
        }

        return aiMessage;
    }

    private async updateSessionAfterReply(sessionId: string): Promise<void> {
        if (!this.sessionManager) {
            return;
        }

        try {
            const sessions = this.sessionManager.getSessions();

            const sessionIndex = sessions.findIndex(session => session.id === sessionId);

            if (sessionIndex !== -1 && sessions[sessionIndex].isLocal) {
                console.log(`Updating session ${sessionId} to remove isLocal flag after successful reply`);

                const updatedSession = { ...sessions[sessionIndex] };
                delete updatedSession.isLocal;

                const updatedSessions = [...sessions];
                updatedSessions[sessionIndex] = updatedSession;

                this.sessionManager.emitEvent(SessionEvents.SESSIONS_LOADED, updatedSessions);
            }
        } catch (error) {
            console.error('Error updating session after reply:', error);
        }
    }
}
