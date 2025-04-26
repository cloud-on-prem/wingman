# Goose VSCode Extension

This extension brings Goose AI functionality to Visual Studio Code.

## Features

* Interactive chat UI
* Access to Goose's AI capabilities directly within VSCode
* Support for coding assistance, explanations, and more
* Code referencing with visual chips in the chat UI
* Quick actions for common coding tasks
* Code action suggestions for diagnostics and selection
* Keyboard shortcuts for improved productivity (cmd/ctrl+shift+g by default; configurable)

## Requirements

> ⚠️ **VSCode 1.95.0 or higher is required** for this extension to function properly.

> ⚠️ **Goose Desktop must be installed** before using this extension. 
👉 Install Goose Desktop from [here](https://block.github.io/goose/)

## Installation

There are two ways to install the Goose VSCode Extension:

### Method 1: Install from GitHub Releases

1. Go to the [GitHub Releases page](https://github.com/cloud-on-prem/goose/releases)
2. Find the latest release with the tag `vscode-v*`
3. Download the `.vsix` file
4. In VS Code, go to the Extensions view (Ctrl+Shift+X)
5. Click on the "..." menu at the top of the Extensions view
6. Select "Install from VSIX..."
7. Locate and select the downloaded `.vsix` file
8. Restart VS Code if prompted

### Method 2: Install from VS Code Marketplace (Coming soon)

The extension will be available in the VS Code Marketplace in the future.

### Chat Interface

The Goose chat interface appears in the sidebar activity bar. Click the Goose icon to open the chat panel.

### Code References

You can reference code from your editor in your conversations with Goose:

1. Select code in your editor (or don't select anything to use the entire file)
2. Right-click and choose "Ask Goose about this code" or use the keyboard shortcut <kbd>Ctrl+Shift+G</kbd> (<kbd>Cmd+Shift+G</kbd> on macOS)
3. The chat input will be automatically focused, allowing you to immediately start typing your question

The behavior varies based on how much code is selected:

- **No selection:** The entire active file is sent as a reference chip
- **Small selections (< 100 lines):** The selected code is automatically included inline with your message
- **Large selections (≥ 100 lines):** The code is added as a reference chip above the input box

This adaptive approach provides the best experience for different code sizes.

### Quick Actions

The extension currently provides the following quick action command that can be accessed by right-clicking on selected code:

* **Ask Goose about this code** - General question about the selected code

### Keyboard Shortcuts

| Command | Shortcut (Windows/Linux) | Shortcut (macOS) |
|---------|--------------------------|------------------|
| Ask Goose about selected code | <kbd>Ctrl+Shift+G</kbd> | <kbd>Cmd+Shift+G</kbd> |

## Extension Settings

This extension contributes the following settings:

* `goose.enable`: enable/disable this extension

----

## Architecture

Detailed information about the extension's architecture can be found in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Development

Information for developers contributing to this extension can be found in [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

## License

This extension is licensed under the MIT License.
