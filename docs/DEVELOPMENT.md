# Goose VSCode Extension Development

This document provides information for developers working on the Goose VSCode extension.
For user documentation, see the main [README.md](../README.md).
For architectural details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Dev Set up

1. Clone the repository
2. Navigate to the project root directory
3. Install dependencies: `npm install`
4. Install webview dependencies: `cd webview-ui && npm install && cd ..`
5. Build the extension and webview: `npm run compile`
6. Open the project root in VSCode: `code .`
7. Press F5 to start debugging (this will usually run the `compile` script automatically based on `.vscode/launch.json` preLaunchTask).

## Build Process

The extension uses a multi-step build process defined in `package.json` scripts:

1.  **`npm run build:extension`**: Uses `esbuild` to bundle the main extension code (`src/extension.ts` and its direct/indirect imports) into a single file (`out/extension.js`) with a sourcemap. This significantly reduces the package size and improves load times. The `vscode` module is marked as external as it's provided by the VS Code runtime. Dependencies listed in `devDependencies` (like `yaml`) should be correctly bundled.
2.  **`npm run compile:tests`**: Uses the TypeScript compiler (`tsc`) based on the specific `tsconfig.tests.json` configuration. This compiles *only* the test files (`src/test/**/*.ts`) into JavaScript files within the `out/test/` directory, preserving the test file structure. This ensures test files are compiled separately from the main extension bundle and placed where the test runner expects them.
3.  **`npm run build:webview`**: Navigates to the `webview-ui/` directory, installs its dependencies, and runs its build process (using Vite) to create the optimized chat interface assets in `webview-ui/dist/`.
4.  **`npm run compile`**: Orchestrates the above steps, running `build:extension`, then `compile:tests`, then `build:webview`. This is the main script used for building the entire extension before testing or packaging. It ensures the main bundle is created first, followed by the separate compilation of tests, and finally the webview build.

## Testing

### Running Tests

Run tests from the project root:

- Run all tests (lint, extension unit/integration, webview, package activation): `npm run test:all`
- Run only extension unit/integration tests: `npm run test`
- Run only webview tests: `npm run test:webview`
- Run packaged activation test: `npm run test:package` (Note: This runs against the packaged `.vsix` and verifies successful activation, catching bundling issues).

### Writing Tests

When writing new tests:

1. Add test cases to the appropriate test file
2. Follow the existing pattern using `suite()` for test groups and `test()` for individual tests
3. Use `assert` functions from the Node.js assert module for validations

### Debugging Tests

To debug tests:

1. Set breakpoints in your test files
2. Use the "Extension Tests" launch configuration from `.vscode/launch.json`
3. Select "Debug Tests" from the Testing panel's menu

### WebView UI Testing

For testing the webview UI components directly:

1. Navigate to the webview directory: `cd webview-ui`
2. Run tests: `npm run test`
3. Run type-checking: `npm run type-check`
4. Return to root: `cd ..`

## Packaging and Releasing

### Packaging the Extension (Manual)

While the official release packaging is handled by the GitHub workflow, you can manually package the extension for local testing or distribution using commands run from the project root.

The available npm scripts use `vsce` (VS Code Extension Manager) and rely on the standard build (`npm run compile`):

- `npm run package`: Runs linting and all tests, then compiles and packages the extension into a `.vsix` file in the project root.
- `npm run package:dist`: Runs linting and all tests, then compiles and packages the extension into the `dist/` directory, naming the file `goose-vscode-[version].vsix`.
- `npm run package:skip-tests`: Skips linting and tests, compiles, and packages the extension into a `.vsix` file in the project root.

Example for creating a distributable package in the `dist` folder:

```bash
npm run package:dist
```

This will create a `.vsix` file in the `dist/` directory with the name `goose-vscode-[version].vsix`.

### Using the Release Script

A helper script is provided to automate the version bumping, committing, and tagging process:

```bash
./scripts/release.sh <new_version>
# Example: ./scripts/release.sh 0.1.0
```

This script performs the following actions:
1. Updates the `version` in `package.json`.
2. Runs `npm install` to update `package-lock.json`.
3. Stages `package.json` and `package-lock.json`.
4. Commits the changes with the message "Bump vscode extension to v<new_version>".
5. Creates a Git tag named `vscode-v<new_version>`.
6. Prints a confirmation message and reminds you to push the commit and tag (`git push && git push --tags`).

**Note:** This script no longer handles packaging. Packaging is now done automatically by the GitHub release workflow.

### GitHub Release Workflow

The repository includes a GitHub Actions workflow that automatically builds and releases the extension when a tag with the format `vscode-v*` is pushed to the repository.

The workflow:
1. Checks out the code
2. Sets up Node.js
3. Installs dependencies
4. Builds and packages the extension
5. Creates a GitHub release with the packaged extension attached

#### Releasing with Protected Branches

Since direct commits to the main branch are restricted, follow this process for releases:

1. Create a feature branch for the version update:
   ```bash
   git checkout -b release/vscode-v0.1.0
   ```

2. Update the version in `package.json` and make any other necessary changes
   ```bash
   ./scripts/release.sh 0.1.0  # Updates version, runs npm install, commits, and tags
   ```

3. Push the commit and the new tag:
   ```bash
   git push origin release/vscode-v0.1.0
   # Do NOT push the tag from the feature branch
   ```

4. Create a pull request and get it reviewed/approved

5. After the PR is merged to main, checkout the main branch and pull the latest changes:
   ```bash
   git checkout main
   git pull
   ```

6. Push the tag **from the main branch**:
   ```bash
   # Ensure you are on the main branch and it's up-to-date first!
   # git checkout main
   # git pull
   git push origin vscode-v0.1.0 # Push the specific tag created by the script
   ```

Pushing the tag (e.g., `vscode-v0.1.0`) from the `main` branch triggers the GitHub workflow to build, package, and create a release.

The workflow can also be triggered manually from the GitHub Actions tab, where you can specify the version to release.

## Known Issues

Refer to the [GitHub issues page](https://github.com/cloud-on-prem/goose/issues) for any known issues related to the VSCode extension.
