import * as path from 'path';
import Mocha from 'mocha'; // Use default import for constructor
import { glob } from 'glob'; // Use named import for the function

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd', // Use TDD interface (suite, test)
		color: true,
		timeout: 15000 // Increase timeout for potentially slower integration tests
	});

	const testsRoot = path.resolve(__dirname, '..'); // Relative to out/test/suite

	return new Promise((c, e) => {
		// Determine which tests to run based on environment variable
		const isPackageTest = process.env.VSCODE_PKG_TEST === '1';
		const globPattern = isPackageTest ? 'activation.test.js' : '**/**.test.js';
		const testFilesDescription = isPackageTest ? 'activation test' : 'all tests';

		console.log(`Running ${testFilesDescription} from ${testsRoot} using pattern: ${globPattern}`);

		// Use glob to find the specified test files
		glob(globPattern, { cwd: testsRoot })
		  .then(files => {
				if (files.length === 0) {
					return e(new Error(`No test files found matching pattern '${globPattern}' in ${testsRoot}`));
				}
				console.log(`Found test files: ${files.join(', ')}`);

				// Add files to the test suite
				files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

				try {
					// Run the mocha test
					mocha.run((failures: number) => {
						if (failures > 0) {
							e(new Error(`${failures} tests failed.`));
						} else {
							c();
						}
					});
				} catch (runErr) {
					console.error(runErr);
					e(runErr);
				}
			})
		  .catch(globErr => {
				console.error(globErr);
				return e(globErr);
			});
	});
}
