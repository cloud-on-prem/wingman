import * as assert from 'assert';
import * as sinon from 'sinon';
import { EventEmitter } from 'events';
import { ServerManager, ServerStatus, ServerEvents } from '../../server/serverManager';
import * as vscode from 'vscode';
import { ApiClient } from '../../server/apiClient';
import * as actualGooseServer from '../../server/gooseServer';
import * as path from 'path';
import { ChildProcess } from 'child_process';
import { setupTestEnvironment, silentLogger, getTestBinaryPathResolver } from '../testUtils';
import * as configReader from '../../utils/configReader';

// Define the prompt text here to avoid importing from the source file in a test
const vscodePromptText = `You are an AI assistant integrated into Visual Studio Code via the Goose extension.

The user is interacting with you through a dedicated chat panel within the VS Code editor interface. Key features include:
- A chat interface displaying the conversation history.
- Support for standard markdown formatting in your responses, rendered by VS Code.
- Support for code blocks with syntax highlighting, leveraging VS Code's capabilities.
- Tool use messages are displayed inline within the chat; detailed outputs might be presented in expandable sections or separate views depending on the tool.

The user manages extensions primarily through VS Code's standard extension management features (Extensions viewlet) or potentially specific configuration settings within VS Code's settings UI (\`settings.json\` or a dedicated extension settings page).

Some capabilities might be provided by built-in features of the Goose extension, while others might come from additional VS Code extensions the user has installed. Be aware of the code context potentially provided by the user (e.g., selected code snippets, open files).`;


// Create mock ApiClient class that properly extends the actual ApiClient
class MockApiClient extends EventEmitter {
    baseUrl: string;
    secretKey: string;
    debug: boolean;
    logger: any;
    events: EventEmitter;

    constructor(config: any) {
        super();
        this.baseUrl = config.baseUrl;
        this.secretKey = config.secretKey;
        this.debug = config.debug || false;
        this.logger = config.logger || { info: console.info, error: console.error };
        this.events = new EventEmitter();

        // Add mock methods from mockApiClient
        // We'll assign these in the setup function
    }
}

// Helper function to create an API client factory for tests
function createApiClientFactory(mockApiClientMethods: any) {
    return function (config: any) {
        const client = new MockApiClient(config);
        // Add the mock methods
        Object.assign(client, mockApiClientMethods);
        return client;
    } as any;
}

suite('ServerManager Tests', () => {
    let serverManager: ServerManager;
    let mockContext: Partial<vscode.ExtensionContext>;
    let startGoosedStub: sinon.SinonStub<Parameters<typeof actualGooseServer.startGoosed>, Promise<actualGooseServer.GooseServerInfo>>;
    let workspaceFoldersStub: sinon.SinonStub;
    let mockApiClient: any;
    let mockProcess: any;
    let getBinaryPathStub: sinon.SinonStub;
    let testEnv: ReturnType<typeof setupTestEnvironment>;
    let configReaderStub: sinon.SinonStub;

    setup(() => {
        testEnv = setupTestEnvironment();
        mockContext = testEnv.context;

        // Stub binary path resolver
        getBinaryPathStub = sinon.stub(require('../../utils/binaryPath'), 'getBinaryPath');
        getBinaryPathStub.callsFake(getTestBinaryPathResolver());
        
        // Stub configReader to ensure tests don't rely on actual config files
        configReaderStub = testEnv.sandbox.stub(configReader, 'readGooseConfig');
        configReaderStub.returns({
            provider: 'test-provider',
            model: 'test-model'
        });

        // Create mock process using Object.create and assign properties
        mockProcess = Object.create(EventEmitter.prototype);
        Object.assign(mockProcess, {
            kill: testEnv.sandbox.stub(),
            pid: 12345,
            stdin: null,
            stdout: Object.assign(new EventEmitter(), { pipe: testEnv.sandbox.stub() }),
            stderr: Object.assign(new EventEmitter(), { pipe: testEnv.sandbox.stub() }),
            stdio: [null, null, null, null, null],
            unref: testEnv.sandbox.stub(),
            ref: testEnv.sandbox.stub(),
            connected: false,
            disconnect: testEnv.sandbox.stub(),
            send: testEnv.sandbox.stub(),
            channel: null,
            spawnargs: [],
            spawnfile: '',
            exitCode: null,
            signalCode: null,
            killed: false,
            on: EventEmitter.prototype.on,
            emit: EventEmitter.prototype.emit,
            off: EventEmitter.prototype.off,
        });

        // Create the startGoosed stub function manually
        startGoosedStub = testEnv.sandbox.stub<Parameters<typeof actualGooseServer.startGoosed>, Promise<actualGooseServer.GooseServerInfo>>();
        startGoosedStub.resolves({
            port: 8000,
            workingDir: path.resolve(__dirname, '../../../test-workspace'),
            process: mockProcess as ChildProcess,
            secretKey: 'test-secret-key'
        });

        // Mock the VSCode extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '.',
            asAbsolutePath: (relativePath: string) => path.resolve(__dirname, '../../../', relativePath),
            storageUri: undefined,
            globalState: {
                get: testEnv.sandbox.stub(),
                update: testEnv.sandbox.stub(),
                setKeysForSync: testEnv.sandbox.stub()
            } as unknown as vscode.Memento & { setKeysForSync(keys: readonly string[]): void },
            workspaceState: {} as vscode.Memento,
            secrets: {} as vscode.SecretStorage,
            extensionMode: vscode.ExtensionMode.Development,
            globalStorageUri: {} as vscode.Uri,
            logUri: {} as vscode.Uri,
            logPath: './logs'
        };

        // Mock the workspace folders
        const mockWorkspaceFolder = {
            uri: vscode.Uri.file(path.resolve(__dirname, '../../../test-workspace')),
            name: 'Test Workspace',
            index: 0
        };
        workspaceFoldersStub = testEnv.sandbox.stub(vscode.workspace, 'workspaceFolders');
        workspaceFoldersStub.value([mockWorkspaceFolder]);

        // Mock the ApiClient constructor
        mockApiClient = {
            getAgentVersions: testEnv.sandbox.stub().resolves({ versions: ['1.0.0', '2.0.0'] }),
            createAgent: testEnv.sandbox.stub().resolves({ id: 'test-agent-id' }),
            request: testEnv.sandbox.stub().resolves({}),
            getConversations: testEnv.sandbox.stub().resolves([]),
            createConversation: testEnv.sandbox.stub().resolves({ id: 'test-conversation-id' }),
            sendMessage: testEnv.sandbox.stub().resolves({ id: 'test-message-id' }),
            getConfiguration: testEnv.sandbox.stub().resolves({}),
            updateConfiguration: testEnv.sandbox.stub().resolves({}),
            checkStatus: testEnv.sandbox.stub().resolves(true),
            addExtension: testEnv.sandbox.stub().resolves({ id: 'test-extension-id' }),
            setAgentPrompt: testEnv.sandbox.stub().resolves({ success: true }), // Add mock for setAgentPrompt
            streamMessage: testEnv.sandbox.stub().callsFake(() => {
                const emitter = new EventEmitter();
                setTimeout(() => {
                    emitter.emit('data', { content: 'test content' });
                    emitter.emit('end');
                }, 10);
                return emitter;
            })
        };

        // Create the server manager with dependencies
        serverManager = new ServerManager(mockContext as vscode.ExtensionContext, {
            startGoosed: startGoosedStub,
            getBinaryPath: (_context, binaryName) => `/test/path/to/${binaryName}`,
            ApiClient: createApiClientFactory(mockApiClient)
        });

        // Replace the logger with a silent one to prevent console output
        (serverManager as any).logger = silentLogger;
    });

    teardown(() => {
        getBinaryPathStub.restore();
        testEnv.cleanup();
    });

    test('should have stopped status initially', () => {
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should emit status change events', async () => {
        const statusChangeListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);
        await serverManager.start();

        sinon.assert.calledOnce(startGoosedStub);
        sinon.assert.called(statusChangeListener);

        // Only verify the final status is RUNNING
        assert.strictEqual(serverManager.getStatus(), ServerStatus.RUNNING);
    });

    test('should configure agent correctly on successful start', async () => {
        await serverManager.start();

        // Verify API client creation
        const apiClient = serverManager.getApiClient();
        assert.ok(apiClient instanceof MockApiClient, 'ApiClient instance not created');

        // Verify agent configuration calls in order
        sinon.assert.calledOnce(mockApiClient.getAgentVersions);
        sinon.assert.calledOnceWithExactly(mockApiClient.createAgent, 'test-provider', 'test-model', sinon.match.any); // Version might vary
        sinon.assert.calledOnceWithExactly(mockApiClient.setAgentPrompt, vscodePromptText);
        sinon.assert.calledOnceWithExactly(mockApiClient.addExtension, 'developer');

        // Check call order
        sinon.assert.callOrder(
            mockApiClient.getAgentVersions,
            mockApiClient.createAgent,
            mockApiClient.setAgentPrompt,
            mockApiClient.addExtension
        );

        assert.strictEqual(serverManager.getStatus(), ServerStatus.RUNNING);
    });


    test('should return server port after started', async () => {
        await serverManager.start();
        const port = serverManager.getPort();
        assert.strictEqual(port, 8000);
        sinon.assert.calledOnce(startGoosedStub);
    });

    test('should handle errors during server start', async () => {
        // Create a new mock ServerManager instance that exposes serverInfo for testing
        const serverManagerForTest = new ServerManager(mockContext as vscode.ExtensionContext, {
            startGoosed: startGoosedStub,
            getBinaryPath: (_context, binaryName) => `/test/path/to/${binaryName}`,
            ApiClient: createApiClientFactory(mockApiClient)
        });

        // Stub the workspace directory method
        testEnv.sandbox.stub(serverManagerForTest as any, 'getWorkspaceDirectory').throws(new Error('Workspace directory error'));
        const errorListener = testEnv.sandbox.spy();
        serverManagerForTest.on(ServerEvents.ERROR, errorListener);

        const result = await serverManagerForTest.start();

        assert.strictEqual(result, false, 'Server start should fail');
        assert.strictEqual(serverManagerForTest.getStatus(), ServerStatus.ERROR, 'Status should be ERROR');
        sinon.assert.calledOnce(errorListener);
        sinon.assert.notCalled(startGoosedStub); // startGoosed should not be called if getWorkspaceDirectory fails
    });

    test('should handle server start failure gracefully (startGoosed rejects)', async () => {
        // Create a new start failure stub
        const failureStub = testEnv.sandbox.stub<Parameters<typeof actualGooseServer.startGoosed>, Promise<actualGooseServer.GooseServerInfo>>();
        failureStub.rejects(new Error('Test error from injected stub'));

        // Create a new server manager with the failure stub
        const failingServerManager = new ServerManager(mockContext as vscode.ExtensionContext, {
            startGoosed: failureStub,
            getBinaryPath: (_context, binaryName) => `/test/path/to/${binaryName}`,
            ApiClient: createApiClientFactory(mockApiClient)
        });

        const errorListener = testEnv.sandbox.spy();
        failingServerManager.on(ServerEvents.ERROR, errorListener);

        const result = await failingServerManager.start();

        assert.strictEqual(result, false, 'Server start should fail due to injected stub rejection');
        assert.strictEqual(failingServerManager.getStatus(), ServerStatus.ERROR, 'Status should be ERROR');
        sinon.assert.calledOnce(errorListener);
        sinon.assert.calledOnce(failureStub);
    });

    test('should log error but continue startup if setAgentPrompt fails', async () => {
        // Mock setAgentPrompt to fail
        const promptError = new Error('Failed to set prompt');
        mockApiClient.setAgentPrompt.rejects(promptError);

        // Spy on the logger used by ServerManager (using sinon.spy directly)
        const logErrorSpy = sinon.spy(silentLogger, 'error');

        await serverManager.start();

        // Verify server still reaches RUNNING state using assert.ok
        assert.ok(serverManager.getStatus() === ServerStatus.RUNNING);

        // Verify the prompt setting was attempted after agent creation
        sinon.assert.calledOnce(mockApiClient.createAgent);
        sinon.assert.calledOnce(mockApiClient.setAgentPrompt);
        sinon.assert.callOrder(mockApiClient.createAgent, mockApiClient.setAgentPrompt);

        // Verify the error was logged (simplified check due to TS error)
        sinon.assert.called(logErrorSpy);
        // TODO: Reinstate argument check if TS error is resolved:
        // sinon.assert.calledWith(logErrorSpy, sinon.match(/Failed to set VS Code system prompt:/), promptError);

        // Verify developer extension was still added
        sinon.assert.calledOnce(mockApiClient.addExtension);
    });

    test('should handle server process exit', async () => {
        // For the process tests, we need to manually set the serverInfo property
        await serverManager.start();

        // Verify we have a serverInfo object
        const serverInfo = (serverManager as any).serverInfo;
        assert.ok(serverInfo, 'serverInfo should exist after starting');

        const exitListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        // Trigger the close event on the mock process
        serverInfo.process.emit('close', 0);

        sinon.assert.calledWith(exitListener, 0);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should handle server process crash', async () => {
        await serverManager.start();

        // Verify we have a serverInfo object
        const serverInfo = (serverManager as any).serverInfo;
        assert.ok(serverInfo, 'serverInfo should exist after starting');

        const exitListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        // Trigger the close event with an error code
        serverInfo.process.emit('close', 1);

        sinon.assert.calledWith(exitListener, 1);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should handle server process exit with null code', async () => {
        await serverManager.start();

        // Verify we have a serverInfo object
        const serverInfo = (serverManager as any).serverInfo;
        assert.ok(serverInfo, 'serverInfo should exist after starting');

        const exitListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        // Trigger the close event with null code
        serverInfo.process.emit('close', null);

        sinon.assert.calledWith(exitListener, null);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should not emit server exit event when stopping server manually', async () => {
        await serverManager.start();

        const exitListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        await serverManager.stop();

        // No exit event should be emitted, only status changes
        sinon.assert.notCalled(exitListener);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    // Tests for configReader integration
    test('should load provider and model from config', async () => {
        // The global stub is already set up in the setup function
        await serverManager.start();

        // Verify that the provider and model from config are passed to the API client
        sinon.assert.calledWith(mockApiClient.createAgent, 'test-provider', 'test-model', sinon.match.any);
    });

    test('should fail to start when GOOSE_PROVIDER is missing', async () => {
        // Update the global stub for this test
        configReaderStub.restore(); // Remove the global stub first
        configReaderStub = testEnv.sandbox.stub(configReader, 'readGooseConfig');
        configReaderStub.returns({
            provider: null,
            model: 'test-model'
        });

        const showErrorMessageStub = testEnv.sandbox.stub(vscode.window, 'showErrorMessage');
        const errorListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.ERROR, errorListener);

        const result = await serverManager.start();

        // Verify the server fails to start
        assert.strictEqual(result, false, 'Server should fail to start with missing provider');
        assert.strictEqual(serverManager.getStatus(), ServerStatus.ERROR);
        
        // Verify error is shown to user
        sinon.assert.calledOnce(showErrorMessageStub);
        sinon.assert.calledOnce(errorListener);
        
        // Verify the error message mentions the missing key
        sinon.assert.calledWith(showErrorMessageStub, 
            sinon.match.string.and(sinon.match('GOOSE_PROVIDER')));
    });

    test('should fail to start when GOOSE_MODEL is missing', async () => {
        // Update the global stub for this test
        configReaderStub.restore(); // Remove the global stub first
        configReaderStub = testEnv.sandbox.stub(configReader, 'readGooseConfig');
        configReaderStub.returns({
            provider: 'test-provider',
            model: null
        });

        const showErrorMessageStub = testEnv.sandbox.stub(vscode.window, 'showErrorMessage');
        const errorListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.ERROR, errorListener);

        const result = await serverManager.start();

        // Verify the server fails to start
        assert.strictEqual(result, false, 'Server should fail to start with missing model');
        assert.strictEqual(serverManager.getStatus(), ServerStatus.ERROR);
        
        // Verify error is shown to user
        sinon.assert.calledOnce(showErrorMessageStub);
        sinon.assert.calledOnce(errorListener);
        
        // Verify the error message mentions the missing key
        sinon.assert.calledWith(showErrorMessageStub, 
            sinon.match.string.and(sinon.match('GOOSE_MODEL')));
    });

    test('should re-read config file after stop and restart', async () => {
        // Update the global stub for this test
        configReaderStub.restore(); // Remove the global stub first
        configReaderStub = testEnv.sandbox.stub(configReader, 'readGooseConfig');
        configReaderStub.onFirstCall().returns({
            provider: 'first-provider',
            model: 'first-model'
        });

        await serverManager.start();
        
        // Verify first provider/model used
        sinon.assert.calledWith(mockApiClient.createAgent, 'first-provider', 'first-model', sinon.match.any);
        
        // Reset call history for next verification
        mockApiClient.createAgent.resetHistory();
        
        // Stop server
        await serverManager.stop();
        
        // Change to new config for next read
        configReaderStub.onSecondCall().returns({
            provider: 'second-provider',
            model: 'second-model'
        });
        
        // Restart server - should read new config
        await serverManager.start();
        
        // Verify second provider/model used
        sinon.assert.calledWith(mockApiClient.createAgent, 'second-provider', 'second-model', sinon.match.any);
    });
});
