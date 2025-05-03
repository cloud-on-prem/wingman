import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Packaged Extension Activation Test Suite', () => {
	test('Extension should activate successfully', async () => {
		console.log('Running activation test...');

		// Find the extension by its ID (name in package.json)
		const extensionId = 'prempillai.wingman-goose'; // Make sure this matches package.json publisher.name
		const extension = vscode.extensions.getExtension(extensionId);

		// 1. Check if the extension is present
		if (!extension) {
			// Log available extensions if not found
			const availableExtensions = vscode.extensions.all.map((ext: vscode.Extension<any>) => ext.id).join(', ');
			console.error(`Available extensions: ${availableExtensions}`);
			assert.fail(`Extension with ID '${extensionId}' not found.`);
		}
		console.log(`Extension '${extensionId}' found.`);

		// 2. Check if it's already active (it might activate on startup)
		if (extension.isActive) {
			console.log(`Extension '${extensionId}' is already active.`);
			assert.ok(true, 'Extension was already active.');
			return; // Test passes if already active
		}

		// 3. Activate the extension
		console.log(`Activating extension '${extensionId}'...`);
		try {
			await extension.activate();
			console.log(`Extension '${extensionId}' activated successfully.`);
			assert.ok(extension.isActive, 'Extension should be active after activation.');
		} catch (err) {
			console.error(`Error activating extension '${extensionId}':`, err);
			assert.fail(`Failed to activate extension '${extensionId}': ${err}`);
		}
	});
});
