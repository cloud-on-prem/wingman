import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { getBinaryPath } from '../utils/binaryPath';
import * as sinon from 'sinon';

export interface TestEnvironment {
    context: ExtensionContext;
    sandbox: sinon.SinonSandbox;
    cleanup: () => void;
}

/**
 * Sets up a test environment with mock VSCode extension context
 */
export function setupTestEnvironment(): TestEnvironment {
    const sandbox = sinon.createSandbox();

    const context = {
        subscriptions: [],
        extensionPath: '',
        extensionUri: vscode.Uri.parse('file:///test'),
        environmentVariableCollection: {
            persistent: false,
            replace: () => { },
            append: () => { },
            prepend: () => { },
            get: () => undefined,
            forEach: () => { },
            delete: () => { },
            has: () => false,
            clear: () => { },
            getScoped: () => ({} as vscode.EnvironmentVariableCollection),
            description: undefined,
            [Symbol.iterator]: function* () { yield* []; }
        },
        storageUri: vscode.Uri.parse('file:///test/storage'),
        globalStorageUri: vscode.Uri.parse('file:///test/global-storage'),
        logUri: vscode.Uri.parse('file:///test/logs'),
        extensionMode: vscode.ExtensionMode.Test,
        isNewInstall: false,
        extension: {
            id: 'test-extension',
            extensionUri: vscode.Uri.parse('file:///test'),
            isActive: true,
            packageJSON: {},
            extensionPath: '',
            extensionKind: vscode.ExtensionKind.UI,
            exports: {},
            activate: () => Promise.resolve({})
        },
        workspaceState: {
            get: () => undefined,
            update: () => Promise.resolve(),
            keys: () => []
        },
        globalState: {
            get: () => undefined,
            update: () => Promise.resolve(),
            setKeysForSync: () => { },
            keys: () => []
        },
        secrets: {
            get: () => Promise.resolve(undefined),
            store: () => Promise.resolve(),
            delete: () => Promise.resolve(),
            onDidChange: new vscode.EventEmitter().event
        },
        asAbsolutePath: (relativePath: string) => relativePath,
        storagePath: undefined,
        globalStoragePath: undefined,
        logPath: undefined,
        extensionRuntime: 1,
        languageModelAccessInformation: {
            canAccessLanguageModels: false,
            onDidChangeLanguageModelAccess: new vscode.EventEmitter().event
        }
    } as unknown as ExtensionContext;

    const cleanup = () => {
        sandbox.restore();
    };

    return { context, sandbox, cleanup };
}

/**
 * Creates a silent logger for testing
 */
export const silentLogger = {
    info: () => { },
    error: () => { },
    debug: () => { },
    warn: () => { }
};

/**
 * Creates a test binary path resolver
 */
export function getTestBinaryPathResolver(context: ExtensionContext): (binaryName: string) => string {
    return (binaryName: string) => getBinaryPath(context, binaryName);
} 
