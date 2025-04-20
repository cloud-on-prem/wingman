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

    // Setup test environment
    const { sandbox, cleanup } = setupTestEnvironment();

    setup(() => {
        // Stub binary path resolver
        getBinaryPathStub = sinon.stub(require('../../utils/binaryPath'), 'getBinaryPath');
        getBinaryPathStub.callsFake(getTestBinaryPathResolver());

        // Create mock process using Object.create and assign properties
        mockProcess = Object.create(EventEmitter.prototype);
        Object.assign(mockProcess, {
            kill: sandbox.stub(),
            pid: 12345,
            stdin: null,
            stdout: Object.assign(new EventEmitter(), { pipe: sandbox.stub() }),
            stderr: Object.assign(new EventEmitter(), { pipe: sandbox.stub() }),
            stdio: [null, null, null, null, null],
            unref: sandbox.stub(),
            ref: sandbox.stub(),
            connected: false,
            disconnect: sandbox.stub(),
            send: sandbox.stub(),
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
        startGoosedStub = sandbox.stub<Parameters<typeof actualGooseServer.startGoosed>, Promise<actualGooseServer.GooseServerInfo>>();
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
                get: sandbox.stub(),
                update: sandbox.stub(),
                setKeysForSync: sandbox.stub()
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
        workspaceFoldersStub = sandbox.stub(vscode.workspace, 'workspaceFolders');
        workspaceFoldersStub.value([mockWorkspaceFolder]);

        // Mock the ApiClient constructor
        mockApiClient = {
            getAgentVersions: sandbox.stub().resolves({ versions: ['1.0.0', '2.0.0'] }),
            createAgent: sandbox.stub().resolves({ id: 'test-agent-id' }),
            request: sandbox.stub().resolves({}),
            getConversations: sandbox.stub().resolves([]),
            createConversation: sandbox.stub().resolves({ id: 'test-conversation-id' }),
            sendMessage: sandbox.stub().resolves({ id: 'test-message-id' }),
            getConfiguration: sandbox.stub().resolves({}),
            updateConfiguration: sandbox.stub().resolves({}),
            checkStatus: sandbox.stub().resolves(true),
            addExtension: sandbox.stub().resolves({ id: 'test-extension-id' }),
            streamMessage: sandbox.stub().callsFake(() => {
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
        sandbox.stub(require('../../server/apiClient'), 'ApiClient').value(MockApiClient);

        // Create the server manager with silent logger
        serverManager = new ServerManager(mockContext as vscode.ExtensionContext, startGoosedStub);

        // Replace the logger with a silent one to prevent console output
        (serverManager as any).logger = silentLogger;
    });

    teardown(() => {
        getBinaryPathStub.restore();
        cleanup();
    });

    test('should have stopped status initially', () => {
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should emit status change events', async () => {
        const statusChangeListener = sandbox.spy();
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
        sandbox.stub(serverManager as any, 'getWorkspaceDirectory').throws(new Error('Workspace directory error'));
        const errorListener = sandbox.spy();
        serverManager.on(ServerEvents.ERROR, errorListener);

        const result = await serverManager.start();

        assert.strictEqual(result, false, 'Server start should fail');
        assert.strictEqual(serverManager.getStatus(), ServerStatus.ERROR, 'Status should be ERROR');
        sinon.assert.calledOnce(errorListener);
        sinon.assert.notCalled(startGoosedStub);
    });

    test('should handle server start failure gracefully', async () => {
        startGoosedStub.rejects(new Error('Test error from injected stub'));
        const errorListener = sandbox.spy();
        serverManager.on(ServerEvents.ERROR, errorListener);

        const result = await serverManager.start();

        assert.strictEqual(result, false, 'Server start should fail due to injected stub rejection');
        assert.strictEqual(serverManager.getStatus(), ServerStatus.ERROR, 'Status should be ERROR');
        sinon.assert.calledOnce(errorListener);
        sinon.assert.calledOnce(startGoosedStub);
    });

    test('should handle server process exit', async () => {
        await serverManager.start();

        const exitListener = sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        const serverProcess = (serverManager as any).serverInfo.process;
        serverProcess.emit('close', 0);

        sinon.assert.calledWith(exitListener, 0);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should handle server process crash', async () => {
        await serverManager.start();

        const exitListener = sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        const serverProcess = (serverManager as any).serverInfo.process;
        serverProcess.emit('close', 1);

        sinon.assert.calledWith(exitListener, 1);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should handle server process exit with null code', async () => {
        await serverManager.start();

        const exitListener = sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        const statusChangeListener = sandbox.spy();
        serverManager.on(ServerEvents.STATUS_CHANGE, statusChangeListener);

        const serverProcess = (serverManager as any).serverInfo.process;
        serverProcess.emit('close', null);

        sinon.assert.calledWith(exitListener, null);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });

    test('should not emit server exit event when stopping server manually', async () => {
        await serverManager.start();

        const exitListener = sandbox.spy();
        serverManager.on(ServerEvents.SERVER_EXIT, exitListener);

        await serverManager.stop();

        // No exit event should be emitted, only status changes
        sinon.assert.notCalled(exitListener);
        assert.strictEqual(serverManager.getStatus(), ServerStatus.STOPPED);
    });
}); 
