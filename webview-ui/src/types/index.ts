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

// Re-export Message type from the primary source in src/types
// This ensures the webview uses the same comprehensive Message structure as the backend,
// including TextPart, CodeContextPart, and tool-related content parts.
export type { Message, Role as MessageRole, TextPart, CodeContextPart as WebviewCodeContextPart, ImageContent as WebviewImageContent, MessageContent as WebviewMessageContentSource } from '../../../src/types/messages';

// Define Webview-specific types, aligning with or extending backend types where necessary.

// TextContent for webview (aligns with TextPart from backend)
export interface TextContent {
    type: 'text';
    text: string;
    // annotations?: Record<string, unknown>; // annotations not currently used in webview
}

// CodeContextPart for webview (aligns with CodeContextPart from backend)
// It uses the local CodeReference interface.
export interface CodeContextPart extends CodeReference {
    type: 'code_context';
}

// ImageContent for webview
export interface ImageContent {
    type: 'image';
    url: string; // Webview might use URL directly if data is handled by extension
    // data?: string; // from backend ImageContent
    // mimeType?: string; // from backend ImageContent
}

// ActionContent remains webview-specific for now
export interface ActionContent {
    type: 'action';
    id: string;
    label: string;
    action: string;
}

// Webview's MessageContent union.
// This should include all types of content parts the webview needs to render.
export type MessageContent = TextContent | CodeContextPart | ImageContent | ActionContent;

// Note: The re-exported 'Message' from '../../../src/types/messages' will have its
// 'content' property typed as 'MessageContent[]' from *that* file.
// The webview's rendering logic (e.g., MessageContentRenderer) will iterate over this array.
// It's crucial that the 'type' discriminators and structures of parts like
// TextContent (matching TextPart) and CodeContextPart are compatible.
