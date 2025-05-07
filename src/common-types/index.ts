// Types shared between the Extension and the Webview UI

export enum MessageType {
    HELLO = 'hello',
    GET_ACTIVE_EDITOR_CONTENT = 'getActiveEditorContent',
    ACTIVE_EDITOR_CONTENT = 'activeEditorContent',
    ERROR = 'error',
    SERVER_STATUS = 'serverStatus',
    CHAT_MESSAGE = 'chatMessage',
    SEND_CHAT_MESSAGE = 'sendChatMessage',
    AI_MESSAGE = 'aiMessage',
    STOP_GENERATION = 'stopGeneration',
    GENERATION_FINISHED = 'generationFinished',
    CODE_REFERENCE = 'codeReference',
    ADD_CODE_REFERENCE = 'addCodeReference',
    REMOVE_CODE_REFERENCE = 'removeCodeReference',
    GET_WORKSPACE_CONTEXT = 'getWorkspaceContext',
    WORKSPACE_CONTEXT = 'workspaceContext',
    CHAT_RESPONSE = 'chatResponse',
    SESSIONS_LIST = 'sessionsList',
    SESSION_LOADED = 'sessionLoaded',
    SWITCH_SESSION = 'switchSession',
    CREATE_SESSION = 'createSession',
    RENAME_SESSION = 'renameSession',
    DELETE_SESSION = 'deleteSession',
    GET_SESSIONS = 'getSessions',
    SERVER_EXIT = 'serverExit',
    GET_SERVER_STATUS = 'getServerStatus',
    RESTART_SERVER = 'restartServer',
    FOCUS_CHAT_INPUT = 'focusChatInput',
    PREPARE_MESSAGE_WITH_CODE = 'prepareMessageWithCode', // Added for <100 line selections
    OPEN_SETTINGS_FILE = 'openSettingsFile', // Added for opening settings
    SET_THEME = 'setTheme', // Added for Shiki theme synchronization
    WEBVIEW_READY = 'webviewReady' // Added for webview readiness check
}

// Types copied from src/types/messages.ts to be shared

export type Role = 'user' | 'assistant';

export interface TextContent {
    type: 'text';
    text: string;
    annotations?: Record<string, unknown>;
}

export interface ImageContent {
    type: 'image';
    data: string; // Assuming base64 encoded data for webview compatibility
    mimeType: string;
    annotations?: Record<string, unknown>;
}

// Simplified Content type for webview - excluding tool-related types for now
// If tool interactions are needed in webview later, these can be added back carefully
export type SimpleContent = TextContent | ImageContent;

// Basic Message structure shared between extension and webview
export interface Message {
    id?: string; // Optional ID, might be assigned later
    role: Role;
    created: number; // Unix timestamp (seconds)
    content: SimpleContent[]; // Use simplified content for now
    // Removed tool-related fields for simplicity in shared type
}

// Note: Tool-related types (ToolCall, ToolResult, etc.) are kept in src/types/messages.ts
// as they are primarily used within the extension host logic for now.
// If the webview needs to display or interact with tool calls/results directly,
// these types would need to be shared and potentially adapted.
