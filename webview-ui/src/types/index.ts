// Message types for communication with the extension
export enum MessageType {
    HELLO = 'hello',
    GET_ACTIVE_EDITOR_CONTENT = 'getActiveEditorContent',
    ACTIVE_EDITOR_CONTENT = 'activeEditorContent',
    ERROR = 'error',
    SERVER_STATUS = 'serverStatus',
    SERVER_EXIT = 'serverExit',
    CHAT_MESSAGE = 'chatMessage',
    SEND_CHAT_MESSAGE = 'sendChatMessage',
    AI_MESSAGE = 'aiMessage',
    STOP_GENERATION = 'stopGeneration',
    GENERATION_FINISHED = 'generationFinished',
    CODE_REFERENCE = 'codeReference',
    ADD_CODE_REFERENCE = 'addCodeReference',
    REMOVE_CODE_REFERENCE = 'removeCodeReference',
    CHAT_RESPONSE = 'chatResponse',
    SESSIONS_LIST = 'sessionsList',
    SESSION_LOADED = 'sessionLoaded',
    SWITCH_SESSION = 'switchSession',
    CREATE_SESSION = 'createSession',
    RENAME_SESSION = 'renameSession',
    DELETE_SESSION = 'deleteSession',
    GET_SESSIONS = 'getSessions',
    RESTART_SERVER = 'restartServer',
    GET_SERVER_STATUS = 'getServerStatus',
    FOCUS_CHAT_INPUT = 'focusChatInput',
    OPEN_SETTINGS_FILE = 'openSettingsFile', // Added for opening settings
    SET_THEME = 'setTheme', // Added for Shiki theme synchronization
    WEBVIEW_READY = 'webviewReady', // Added for webview readiness check
    SET_EXTENSION_VERSION = 'setExtensionVersion' // Added for passing extension version to webview
}

// Type for code references
export interface CodeReference {
    id: string;
    filePath: string;
    fileName: string;
    startLine: number;
    endLine: number;
    selectedText: string;
    languageId: string;
}

// Type for workspace context
export interface WorkspaceContext {
    currentLanguage?: string;
    projectType?: string;
    currentFile?: string;
    currentFilePath?: string;
    diagnostics?: any[];
    recentFiles?: string[];
    openFiles?: string[];
}

// VS Code API global declaration
export interface VSCodeAPI {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
}

// Re-export Message type from shared types
export type { Message } from '../../../src/common-types/index'; // Re-added with correct path

// Export TextContent and MessageContent types
// Note: These might differ slightly from the shared SimpleContent if webview needs specific handling
export interface TextContent {
    type: 'text';
    text: string;
}

export interface ImageContent {
    type: 'image';
    url: string;
}

export interface ActionContent {
    type: 'action';
    id: string;
    label: string;
    action: string;
}

export type MessageContent = TextContent | ImageContent | ActionContent;
