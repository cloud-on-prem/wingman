import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as myExtension from '../extension';
import * as sinon from 'sinon';
import { setupTestEnvironment, getTestBinaryPathResolver } from './testUtils';

suite('Extension Test Suite', () => {
	let testEnv: ReturnType<typeof setupTestEnvironment>;
	let getBinaryPathStub: sinon.SinonStub;
	let serverManagerStub: sinon.SinonStub;

	setup(() => {
		testEnv = setupTestEnvironment();
		// Stub getBinaryPath to prevent errors when the server tries to start
		getBinaryPathStub = sinon.stub(require('../utils/binaryPath'), 'getBinaryPath');
		getBinaryPathStub.callsFake(getTestBinaryPathResolver());

		// Create a new stub for ServerManager each time to avoid "already wrapped" error
		// Make sure the stub is clean each time
		const serverManagerModule = require('../server/serverManager');
		if (serverManagerModule.ServerManager.restore) {
			serverManagerModule.ServerManager.restore();
		}
		serverManagerStub = sinon.stub(serverManagerModule, 'ServerManager').callsFake(function () {
			return {
				start: sinon.stub().resolves(true),
				stop: sinon.stub(),
				on: sinon.stub(),
				getStatus: sinon.stub().returns('stopped')
			};
		});
	});

	teardown(() => {
		getBinaryPathStub.restore();
		if (serverManagerStub && serverManagerStub.restore) {
			serverManagerStub.restore();
		}
		// Ensure all stubs are properly restored
		testEnv.sandbox.restore();
	});

	test('Extension should be present', () => {
		assert.ok(myExtension);
	});

	// Test the extension exports
	test('Extension exports activate and deactivate functions', () => {
		assert.strictEqual(typeof myExtension.activate, 'function');
		assert.strictEqual(typeof myExtension.deactivate, 'function');
	});

	// Test command registration - mock approach instead of requiring actual extension installation
	test('Commands should be registered during activation', async () => {
		// Create a mock context object
		const context: Partial<vscode.ExtensionContext> = {
			subscriptions: [],
			extensionPath: '/test/extension',
			extensionUri: {} as vscode.Uri,
			asAbsolutePath: (path: string) => `/test/extension/${path}`,
			storageUri: undefined,
			globalState: {
				get: sinon.stub(),
				update: sinon.stub(),
				setKeysForSync: sinon.stub()
			} as unknown as vscode.Memento & { setKeysForSync(keys: readonly string[]): void },
			workspaceState: {} as vscode.Memento,
			secrets: {} as vscode.SecretStorage,
			extensionMode: vscode.ExtensionMode.Development,
			globalStorageUri: {} as vscode.Uri,
			logUri: {} as vscode.Uri,
			logPath: '/test/extension/logs'
		};

		// Create a stub for vscode.commands.registerCommand
		const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');

		try {
			// Activate the extension with our mock context
			await myExtension.activate(context as vscode.ExtensionContext);

			// Verify that registerCommand was called with our expected commands
			assert.ok(
				registerCommandStub.calledWith('goose.helloWorld'),
				'Hello World command not registered'
			);
			assert.ok(
				registerCommandStub.calledWith('goose.start'),
				'Start command not registered'
			);

			// Check that context.subscriptions was updated (command disposables should be pushed)
			assert.strictEqual(
				context.subscriptions?.length,
				10, // Updated from 9 to 10 to account for themeChangeListener
				'Expected 10 subscriptions to be added to context'
			);
		} finally {
			// Restore the stubs
			registerCommandStub.restore();
		}
	});

	/**
	 * Integration test for WebView message handling.
	 * This test is skipped because it requires a running WebView instance,
	 * which is complex to set up in a unit test environment.
	 * 
	 * A proper implementation would require:
	 * 1. Setting up a mock WebView panel
	 * 2. Mocking the message passing between the extension and WebView
	 * 3. Verifying the message handlers correctly process the messages
	 * 
	 * TODO: Implement as an integration test with proper WebView setup
	 */
	test.skip('WebView should handle messages correctly', async () => {
		// This would be a complex integration test requiring a running WebView
		assert.ok(true, 'Placeholder for WebView message handling test');
	});
});
