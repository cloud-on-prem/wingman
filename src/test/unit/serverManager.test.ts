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

suite('ServerManager Tests', () => {
    let serverManager: ServerManager;
    let mockContext: Partial<vscode.ExtensionContext>;
    let startGoosedStub: sinon.SinonStub<Parameters<typeof actualGooseServer.startGoosed>, Promise<actualGooseServer.GooseServerInfo>>;
    let workspaceFoldersStub: sinon.SinonStub;
    let mockApiClient: any;
    let mockProcess: any;
    let getBinaryPathStub: sinon.SinonStub;
    let testEnv: ReturnType<typeof setupTestEnvironment>;

    setup(() => {
        testEnv = setupTestEnvironment();
        mockContext = testEnv.context;

        // Stub binary path resolver
        getBinaryPathStub = sinon.stub(require('../../utils/binaryPath'), 'getBinaryPath');
        getBinaryPathStub.callsFake(getTestBinaryPathResolver(testEnv.context));

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
            streamMessage: testEnv.sandbox.stub().callsFake(() => {
                const emitter = new EventEmitter();
                setTimeout(() => {
                    emitter.emit('data', { content: 'test content' });
                    emitter.emit('end');
                }, 10);
                return emitter;
            })
        };
        class MockApiClient extends EventEmitter {
            constructor() {
                super();
                Object.assign(this, mockApiClient);
            }
        }
        testEnv.sandbox.stub(require('../../server/apiClient'), 'ApiClient').value(MockApiClient);

        // Create the server manager with silent logger
        serverManager = new ServerManager(mockContext as vscode.ExtensionContext, startGoosedStub);

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

    test('should create API client when server starts', async () => {
        await serverManager.start();
        const apiClient = serverManager.getApiClient();
        assert.ok(apiClient instanceof require('../../server/apiClient').ApiClient, 'ApiClient instance not created');
        sinon.assert.calledOnce(startGoosedStub);
    });

    test('should return server port after started', async () => {
        await serverManager.start();
        const port = serverManager.getPort();
        assert.strictEqual(port, 8000);
        sinon.assert.calledOnce(startGoosedStub);
    });

    test('should handle errors during server start', async () => {
        testEnv.sandbox.stub(serverManager as any, 'getWorkspaceDirectory').throws(new Error('Workspace directory error'));
        const errorListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.ERROR, errorListener);

        const result = await serverManager.start();

        assert.strictEqual(result, false, 'Server start should fail');
        assert.strictEqual(serverManager.getStatus(), ServerStatus.ERROR, 'Status should be ERROR');
        sinon.assert.calledOnce(errorListener);
        sinon.assert.notCalled(startGoosedStub);
    });

    test('should handle server start failure gracefully', async () => {
        startGoosedStub.rejects(new Error('Test error from injected stub'));
        const errorListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.ERROR, errorListener);

        const result = await serverManager.start();

        assert.strictEqual(result, false, 'Server start should fail due to injected stub rejection');
        assert.strictEqual(serverManager.getStatus(), ServerStatus.ERROR, 'Status should be ERROR');
        sinon.assert.calledOnce(errorListener);
        sinon.assert.calledOnce(startGoosedStub);
    });

    test('should handle server process exit', async () => {
        await serverManager.start();

        const exitListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        const serverProcess = (serverManager as any).serverInfo.process;
        serverProcess.emit('close', 0);

        sinon.assert.calledWith(exitListener, 0);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should handle server process crash', async () => {
        await serverManager.start();

        const exitListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        const serverProcess = (serverManager as any).serverInfo.process;
        serverProcess.emit('close', 1);

        sinon.assert.calledWith(exitListener, 1);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should handle server process exit with null code', async () => {
        await serverManager.start();

        const exitListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = testEnv.sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        const serverProcess = (serverManager as any).serverInfo.process;
        serverProcess.emit('close', null);

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
}); 
