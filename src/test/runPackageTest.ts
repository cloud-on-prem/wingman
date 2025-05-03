// @ts-check // Use JSDoc type checking

const path = require('path');
const fs = require('fs');
const os = require('os');
const { runTests } = require('@vscode/test-electron');
const { execSync } = require('child_process'); // To run npm commands

async function main() {
    let userDataDir; // Declare here to be accessible in catch block
    try {
        console.log('Starting package integration test...');

        // 1. Get package info
        const packageJsonPath = path.resolve(__dirname, '../../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        // const packageName = packageJson.name; // Not used for VSIX name construction here
        const packageVersion = packageJson.version;
        // Construct the VSIX name to match the output of the 'package:dist' script
        const vsixName = `goose-vscode-${packageVersion}.vsix`;
        const vsixDistDir = path.resolve(__dirname, '../../dist');
        const vsixPath = path.join(vsixDistDir, vsixName); // Expected path after packaging

        console.log(`Expecting VSIX: ${vsixPath}`);

        // 2. Run the package:dist command
        console.log('Packaging extension...');
        // Run from the project root directory
        execSync('npm run package:dist', { cwd: path.resolve(__dirname, '../../'), stdio: 'inherit' });
        console.log('Packaging complete.');

        // 3. Check if VSIX exists
        if (!fs.existsSync(vsixPath)) {
            throw new Error(`Failed to find packaged VSIX at ${vsixPath}`);
        }
        console.log(`Found VSIX: ${vsixPath}`);

        // 4. Set up VS Code test environment options
        const extensionDevelopmentPath = path.resolve(__dirname, '../../'); // Project root
        // Point to the *compiled* suite runner, which will handle running the correct test(s)
        const extensionTestsPath = path.resolve(__dirname, '../../out/test/suite/index.js');
        const testWorkspace = path.resolve(__dirname, '../../test-workspace'); // Optional: use a specific workspace
        // Create a temporary directory for user data to ensure clean state
        userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-test-user-data-'));

        // Ensure test workspace exists
        if (!fs.existsSync(testWorkspace)) {
            fs.mkdirSync(testWorkspace);
        }
        console.log(`Using temporary user data dir: ${userDataDir}`);


        // 5. Run the tests with the VSIX installed
        console.log('Launching VS Code with packaged extension installed...');
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            // Set environment variable to signal suite runner to only run package tests
            extensionTestsEnv: { 'VSCODE_PKG_TEST': '1' },
            // workspacePath: testWorkspace, // Optional
            launchArgs: [
                `--install-extension=${vsixPath}`,
                `--user-data-dir=${userDataDir}`, // Use clean user data dir
                // '--disable-extensions' // Optionally disable other extensions
                testWorkspace // Open specific workspace if needed
            ],
        });
        console.log('Tests finished.');
        // Clean up temporary user data dir
        console.log(`Cleaning up temporary user data dir: ${userDataDir}`);
        fs.rmSync(userDataDir, { recursive: true, force: true });


    } catch (err) {
        console.error('Failed to run package integration tests:', err);
        // Clean up temporary dir even on error
        if (typeof userDataDir !== 'undefined' && fs.existsSync(userDataDir)) {
            console.log(`Cleaning up temporary user data dir after error: ${userDataDir}`);
            fs.rmSync(userDataDir, { recursive: true, force: true });
        }
        process.exit(1);
    }
}

main();
