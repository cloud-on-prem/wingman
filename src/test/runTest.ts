const path = require('path');
const { runTests } = require('@vscode/test-electron');

/**
 * Custom test runner that adds flags to suppress warnings
 */
async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to the *compiled* test runner script in the output directory
        // Should match the structure resulting from tsconfig.tests.json (rootDir: 'src', outDir: 'out/test')
        const extensionTestsPath = path.resolve(__dirname, '../../out/test/test/suite/index');

        // Additional runtime options to reduce noise
        const additionalOptions = {
            execArgv: [
                '--no-warnings', // Suppress Node.js warnings
                '--force-node-api-uncaught-exceptions-policy=true', // Fix for N-API deprecation warnings
            ]
        };

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions', // Disable other extensions during testing
                '--no-sandbox',
                '--disable-gpu'
            ],
            ...additionalOptions
        });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exit(1);
    }
}

main();
