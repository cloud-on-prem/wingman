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

1.  **`npm run build:extension`**: Uses `esbuild` to bundle the main extension code (`src/extension.ts` and its direct/indirect imports) into a single file (`out/extension.js`) with a sourcemap. This significantly reduces the package size and improves load times. The `vscode` module is marked as external as it's provided by the VS Code runtime.
2.  **`npm run compile:tests`**: Uses the TypeScript compiler (`tsc`) based on `tsconfig.json` to compile all remaining TypeScript files in `src/` (including tests, types, utils not bundled by esbuild) into JavaScript files in the `out/` directory, preserving the directory structure. This is necessary for running tests and potentially for parts of the extension not covered by the main bundle.
3.  **`npm run build:webview`**: Navigates to the `webview-ui/` directory, installs its dependencies, and runs its build process (using Vite) to create the optimized chat interface assets in `webview-ui/dist/`.
4.  **`npm run compile`**: Orchestrates the above steps, running `build:extension`, then `compile:tests`, then `build:webview`. This is the main script used for building the entire extension before testing or packaging.

## Testing

### Running Tests

Run tests from the project root:

- Run all tests (extension + webview): `npm run test:all`
- Run only extension tests: `npm run test`
- Run only webview tests: `npm run test:webview`
- Run packaged activation test: `npm run test:package` (Note: This runs against the packaged `.vsix` and might not be suitable for all CI environments due to VS Code instance requirements).

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

### Packaging the Extension

Run packaging commands from the project root.

The extension can be packaged into a `.vsix` file for distribution. There are several npm scripts available for packaging:

- `npm run package` - Runs tests, then packages the extension
- `npm run package:dist` - Runs tests, then packages the extension into the `dist` directory with version number
- `npm run package:skip-tests` - Skips tests and packages the extension

To package the extension for distribution:

```bash
npm run package:dist
```

This will create a `.vsix` file in the `dist` directory with the name `goose-vscode-[version].vsix`.

### Using the Release Script

A helper script is provided to simplify the release process:

```bash
./scripts/release.sh 0.1.0  # Replace with your desired version
```

This script:
1. Updates the version in `package.json`
2. Packages the extension to the `dist` directory
3. Provides instructions for creating a Git tag and pushing to GitHub

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
   ./scripts/release.sh 0.1.0  # Creates the package and updates version
   ```

3. Commit the changes:
   ```bash
   git add .
   git commit -m "Bump vscode extension to v0.1.0"
   ```

4. Create a pull request and get it reviewed/approved

5. After the PR is merged to main, checkout the main branch and pull the latest changes:
   ```bash
   git checkout main
   git pull
   ```

6. Create and push the tag from the main branch:
   ```bash
   git tag vscode-v0.1.0
   git push origin vscode-v0.1.0
   ```

This will trigger the GitHub workflow to create a release with the packaged extension.

The workflow can also be triggered manually from the GitHub Actions tab, where you can specify the version to release.

## Known Issues

Refer to the [GitHub issues page](https://github.com/cloud-on-prem/goose/issues) for any known issues related to the VSCode extension.
