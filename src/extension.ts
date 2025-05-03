// The module 'vscode' contains the VS Code extensibility API
 // Import the module and reference it with the alias vscode in your code below
 import * as vscode from 'vscode';
 import { ColorThemeKind } from 'vscode'; // Import ColorThemeKind
 import * as path from 'path';
 import * as fs from 'fs';
import { ServerManager, ServerStatus, ServerEvents } from './server/serverManager';
import { ChatProcessor, ChatEvents } from './server/chat/chatProcessor';
import { Message, getTextContent } from './types';
// Import CodeReference type explicitly if needed, or rely on CodeReferenceManager export
import { CodeReferenceManager, CodeReference } from './utils/codeReferenceManager';
import { WorkspaceContextProvider } from './utils/workspaceContextProvider';
import { GooseCodeActionProvider } from './utils/codeActionProvider';
import { SessionManager, SessionEvents } from './server/chat/sessionManager';
// Import MessageType from common types
import { MessageType } from './common-types';
// Import config reader function
import { getConfigFilePath } from './utils/configReader';
// Import logging utilities
import { DefaultLogger, getLogger, LogLevel } from './utils/logging';

// Create logger for the extension
const logger = getLogger('Extension');

// Define line limit constant for prepending code vs. adding reference chip
const SELECTION_LINE_LIMIT_FOR_PREPEND = 100;

// Interface for messages sent between extension and webview
interface WebviewMessage {
	command: string;
	[key: string]: any; // Additional properties
}

/**
 * Manages webview panels and sidebar view
 */
class GooseViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'goose.chatView';
	private _view?: vscode.WebviewView;
	private readonly _extensionUri: vscode.Uri;
	private readonly _serverManager: ServerManager;
	private readonly _chatProcessor: ChatProcessor;
	private readonly _codeReferenceManager: CodeReferenceManager;
	private readonly _workspaceContextProvider: WorkspaceContextProvider;
	private readonly _sessionManager: SessionManager;

	constructor(extensionUri: vscode.Uri, serverManager: ServerManager, chatProcessor: ChatProcessor, sessionManager: SessionManager) {
		this._extensionUri = extensionUri;
		this._serverManager = serverManager;
		this._chatProcessor = chatProcessor;
		this._codeReferenceManager = CodeReferenceManager.getInstance();
		this._workspaceContextProvider = WorkspaceContextProvider.getInstance();
		this._sessionManager = sessionManager;
	}

	/**
	 * Maps VS Code theme kind to a shiki theme identifier.
	 * Uses 'light-plus' and 'dark-plus' as they are built-in themes in shiki
	 * that correspond well to VS Code's default light and dark themes.
	 * @param kind The VS Code theme kind.
	 * @returns A shiki theme identifier string.
	 */
	public getShikiTheme(kind: ColorThemeKind): string { // Made public for listener access
		switch (kind) {
			case ColorThemeKind.Light:
			case ColorThemeKind.HighContrastLight:
				return 'light-plus'; // Shiki's equivalent for Light+
			case ColorThemeKind.Dark:
			case ColorThemeKind.HighContrast:
				return 'dark-plus'; // Shiki's equivalent for Dark+
			default:
				return 'dark-plus'; // Default fallback
		}
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
 	) {
 		this._view = webviewView;

		// --- Detect and Map Theme ---
		const activeTheme = vscode.window.activeColorTheme;
		const shikiTheme = this.getShikiTheme(activeTheme.kind);
		logger.info(`Detected VS Code theme kind: ${ColorThemeKind[activeTheme.kind]}, Mapped to shiki theme: ${shikiTheme}`);
		// --- End Detect and Map Theme ---

		webviewView.webview.options = {
			// Enable scripts in the webview
			enableScripts: true,
			// Restrict the webview to only load resources from the `out` directory
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'out'),
				vscode.Uri.joinPath(this._extensionUri, 'webview-ui/dist')
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (message) => {
			await this._onDidReceiveMessage(message);
		});

		// Set up event listeners for server status changes
		this._serverManager.on(ServerEvents.STATUS_CHANGE, (status: ServerStatus) => {
			this._sendMessageToWebview({
				command: MessageType.SERVER_STATUS,
				status
			});
		});

		// Set up event listeners for chat events
		this._chatProcessor.on(ChatEvents.MESSAGE_RECEIVED, (message: Message) => {
			this._sendMessageToWebview({
				command: MessageType.CHAT_RESPONSE,
				message: message
			});
		});

		this._chatProcessor.on(ChatEvents.ERROR, (error: Error) => {
			this._sendMessageToWebview({
				command: MessageType.ERROR,
				errorMessage: error.message
			});
		});

		this._chatProcessor.on(ChatEvents.FINISH, (message: Message, reason: string) => {
			this._sendMessageToWebview({
				command: MessageType.GENERATION_FINISHED,
				message,
				reason
			});
		});

		// Send initial server status
		this._sendMessageToWebview({
			command: MessageType.SERVER_STATUS,
			status: this._serverManager.getStatus()
		});

		// Send initial theme
		this._sendMessageToWebview({
			command: MessageType.SET_THEME, // Use the new message type
			theme: shikiTheme
		});

		// Log that the view has been resolved
		console.log(`Webview view resolved with context: ${context.state}`);
	}

	private async _onDidReceiveMessage(message: any) {
		switch (message.command) {
			case MessageType.HELLO:
				break;

			case MessageType.GET_ACTIVE_EDITOR_CONTENT:
				this._getActiveEditorContent();
				break;

			case MessageType.SEND_CHAT_MESSAGE:
				// Check if there's text, explicit code references (chips), or prepended code
				if (message.text?.trim() || message.codeReferences?.length > 0 || message.prependedCode) {
					try {
						// Pass relevant data to the chat processor
						// Note: The signature of sendMessage might need adjustment in Task 1.6
						await this._chatProcessor.sendMessage(
							message.text,
							message.codeReferences, // Existing code reference chips
							message.prependedCode, // Pass the new prepended code data
							message.messageId,
							message.sessionId || this._sessionManager.getCurrentSessionId()
						);
					} catch (error) {
						logger.error('Error sending message to chat processor:', error); // Use logger
						this._sendMessageToWebview({
							command: MessageType.ERROR,
							errorMessage: error instanceof Error ? error.message : String(error)
						});
					}
				} else {
					logger.warn('Received SEND_CHAT_MESSAGE with no content.');
				}
				break;

			case MessageType.STOP_GENERATION:
				this._chatProcessor.stopGeneration();
				break;

			case MessageType.REMOVE_CODE_REFERENCE:
				// Handle removing a code reference from the UI
				if (message.id) {
					console.log('Removing code reference with ID:', message.id);
					// Send back confirmation to the webview to update its state
					this._sendMessageToWebview({
						command: MessageType.REMOVE_CODE_REFERENCE,
						id: message.id
					});
				}
				break;

			case MessageType.GET_SESSIONS:
				try {
					const sessions = await this._sessionManager.fetchSessions();
					this._sendMessageToWebview({
						command: MessageType.SESSIONS_LIST,
						sessions
					});
				} catch (error) {
					console.error('Error fetching sessions:', error);
					this._sendMessageToWebview({
						command: MessageType.ERROR,
						error: 'Failed to fetch sessions'
					});
				}
				break;

			case MessageType.SWITCH_SESSION:
				try {
					const success = await this._sessionManager.switchSession(message.sessionId);
					if (success) {
						const session = this._sessionManager.getCurrentSession();
						if (session) {
							this._sendMessageToWebview({
								command: MessageType.SESSION_LOADED,
								sessionId: session.session_id,
								messages: session.messages
							});
						}
					} else {
						this._sendMessageToWebview({
							command: MessageType.ERROR,
							error: 'Failed to switch session'
						});
					}
				} catch (error) {
					console.error('Error switching session:', error);
					this._sendMessageToWebview({
						command: MessageType.ERROR,
						error: 'Failed to switch session'
					});
				}
				break;

			case MessageType.CREATE_SESSION:
				try {
					const workspaceDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
					if (!workspaceDirectory) {
						this._sendMessageToWebview({
							command: MessageType.ERROR,
							error: 'No workspace folder found'
						});
						return;
					}

					const sessionId = await this._sessionManager.createSession(
						workspaceDirectory,
						message.description
					);

					if (sessionId) {
						// Get the session data to send to the webview
						const session = this._sessionManager.getCurrentSession();
						if (session) {
							this._sendMessageToWebview({
								command: MessageType.SESSION_LOADED,
								sessionId: session.session_id,
								messages: session.messages
							});

							// Also send the updated session list
							this._sendMessageToWebview({
								command: MessageType.SESSIONS_LIST,
								sessions: this._sessionManager.getSessions()
							});
						}
					} else {
						this._sendMessageToWebview({
							command: MessageType.ERROR,
							error: 'Failed to create session'
						});
					}
				} catch (error) {
					console.error('Error creating session:', error);
					this._sendMessageToWebview({
						command: MessageType.ERROR,
						error: 'Failed to create session'
					});
				}
				break;

			case MessageType.RENAME_SESSION:
				try {
					// Get current session or let user pick one
					let sessionId = this._sessionManager.getCurrentSessionId();
					let sessionDescription = '';

					if (!sessionId) {
						// Fetch available sessions
						const sessions = await this._sessionManager.fetchSessions();

						if (sessions.length === 0) {
							vscode.window.showInformationMessage('No sessions available to rename.');
							return;
						}

						// Create quick pick items from session list
						const sessionItems = sessions.map(session => ({
							label: session.metadata.description || `Session ${session.id}`,
							description: new Date(session.modified).toLocaleString(),
							detail: `${session.metadata.message_count} messages`,
							id: session.id
						}));

						// Show quick pick menu
						const selectedItem = await vscode.window.showQuickPick(sessionItems, {
							placeHolder: 'Select a session to rename'
						});

						if (!selectedItem) {
							return; // User cancelled
						}

						sessionId = selectedItem.id;
						sessionDescription = selectedItem.label;
					} else {
						// Get current session description
						const currentSession = this._sessionManager.getCurrentSession();
						if (currentSession) {
							sessionDescription = currentSession.metadata.description;
						}
					}

					// Get new description from user
					const newDescription = await vscode.window.showInputBox({
						placeHolder: 'Enter a new description for the session',
						prompt: 'This helps identify your session later',
						value: sessionDescription
					});

					if (newDescription !== undefined && sessionId) { // User didn't cancel
						const apiClient = this._serverManager.getApiClient();
						if (apiClient) {
							const result = await apiClient.renameSession(sessionId, newDescription);
							if (result) {
								vscode.window.showInformationMessage(`Renamed session to: ${newDescription}`);

								// Refresh sessions and notify webview
								await this._sessionManager.fetchSessions();
								this._sendMessageToWebview({
									command: MessageType.SESSIONS_LIST,
									sessions: this._sessionManager.getSessions()
								});
							} else {
								vscode.window.showErrorMessage('Failed to rename session');
							}
						}
					}
				} catch (error) {
					console.error('Error renaming session:', error);
					vscode.window.showErrorMessage('Failed to rename session');
				}
				break;

			case MessageType.DELETE_SESSION:
				try {
					// Fetch available sessions
					const sessions = await this._sessionManager.fetchSessions();

					if (sessions.length === 0) {
						vscode.window.showInformationMessage('No sessions available to delete.');
						return;
					}

					// Create quick pick items from session list
					const sessionItems = sessions.map(session => ({
						label: session.metadata.description || `Session ${session.id}`,
						description: new Date(session.modified).toLocaleString(),
						detail: `${session.metadata.message_count} messages`,
						id: session.id
					}));

					// Show quick pick menu
					const selectedItem = await vscode.window.showQuickPick(sessionItems, {
						placeHolder: 'Select a session to delete'
					});

					if (!selectedItem) {
						return; // User cancelled
					}

					// Confirm deletion
					const confirmed = await vscode.window.showWarningMessage(
						`Are you sure you want to delete "${selectedItem.label}"?`,
						{ modal: true },
						'Delete'
					);

					if (confirmed === 'Delete') {
						const apiClient = this._serverManager.getApiClient();
						if (apiClient) {
							const result = await apiClient.deleteSession(selectedItem.id);
							if (result) {
								vscode.window.showInformationMessage(`Deleted session: ${selectedItem.label}`);

								// If we deleted the current session, switch to a new one
								if (selectedItem.id === this._sessionManager.getCurrentSessionId()) {
									// Create a new session or switch to another one
									if (sessions.length > 1) {
										// Find a different session to switch to
										const differentSession = sessions.find(s => s.id !== selectedItem.id);
										if (differentSession) {
											await this._sessionManager.switchSession(differentSession.id);
										}
									} else {
										// Create a new session if this was the only one
										vscode.commands.executeCommand('goose.createSession');
									}
								}

								// Refresh sessions and notify webview
								await this._sessionManager.fetchSessions();
								this._sendMessageToWebview({
									command: MessageType.SESSIONS_LIST,
									sessions: this._sessionManager.getSessions()
								});
							} else {
								vscode.window.showErrorMessage('Failed to delete session');
							}
						}
					}
				} catch (error) {
					console.error('Error deleting session:', error);
					vscode.window.showErrorMessage('Failed to delete session');
				}
				break;

			case MessageType.GET_SERVER_STATUS:
				this._sendMessageToWebview({
					command: MessageType.SERVER_STATUS,
					status: this._serverManager.getStatus()
				});
				break;

			case MessageType.RESTART_SERVER:
				console.log('Restarting Goose server...');
				// Restart the server
				this._serverManager.restart().then(success => {
					// Send updated status
					this._sendMessageToWebview({
						command: MessageType.SERVER_STATUS,
						status: this._serverManager.getStatus()
					});

					if (success) {
						console.log('Server restarted successfully');
					} else {
						console.error('Failed to restart server');
						this._sendMessageToWebview({
							command: MessageType.ERROR,
							errorMessage: 'Failed to restart the Goose server'
						});
					}
				});
				break;

			case MessageType.OPEN_SETTINGS_FILE:
				try {
					const configPath = getConfigFilePath(); // Use the imported function
					if (configPath) {
						const uri = vscode.Uri.file(configPath);
						try {
							const doc = await vscode.workspace.openTextDocument(uri);
							await vscode.window.showTextDocument(doc);
							logger.info(`Opened settings file: ${configPath}`);
						} catch (err) {
							logger.error(`Failed to open settings file at ${configPath}:`, err);
							vscode.window.showErrorMessage(`Could not open settings file. It might not exist or there was a read error. Expected location: ${configPath}`);
						}
					} else {
						logger.error('Could not determine the path to the settings file.');
						vscode.window.showErrorMessage('Could not determine the path to the Goose settings file for your OS.');
					}
				} catch (error) {
					logger.error('Error handling OPEN_SETTINGS_FILE:', error);
					vscode.window.showErrorMessage('An unexpected error occurred while trying to open the settings file.');
				}
				break;

			default:
				console.log(`Unhandled message: ${message.command}`);
		}
	}

	private _getActiveEditorContent() {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			const content = document.getText();
			const fileName = document.fileName;
			const languageId = document.languageId;

			this._sendMessageToWebview({
				command: MessageType.ACTIVE_EDITOR_CONTENT,
				content,
				fileName,
				languageId,
			});
		} else {
			this._sendMessageToWebview({
				command: MessageType.ERROR,
				errorMessage: 'No active editor found'
			});
		}
	}

	/**
	 * Sends a message to the webview
	 */
	public _sendMessageToWebview(message: any) {
		this.sendMessageToWebview(message);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Path to the built webview UI
		const distPath = vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist');
		const webviewDistPath = webview.asWebviewUri(distPath);

		// Get paths to CSS and JS files
		const indexPath = path.join(this._extensionUri.fsPath, 'webview-ui', 'dist', 'index.html');

		// Read the file
		let indexHtml = fs.readFileSync(indexPath, 'utf8');

		// Update the asset paths to be webview-friendly
		indexHtml = indexHtml.replace(
			/(href|src)="([^"]*)"/g,
			(match, p1, p2) => {
				// Skip external URLs and data URLs
				if (p2.startsWith('http') || p2.startsWith('data:')) {
					return match;
				}
				return `${p1}="${webviewDistPath.toString()}/${p2}"`;
			}
		);

		return indexHtml;
	}

	/**
	 * Adds a code reference to the chat input
	 */
	public addCodeReference() {
		const codeReference = this._codeReferenceManager.getCodeReferenceFromSelection();
		if (codeReference) {
			this._sendMessageToWebview({
				command: MessageType.ADD_CODE_REFERENCE,
				codeReference
			});
		} else {
			vscode.window.showInformationMessage('Please select some code first');
		}
	}

	/**
	 * Adds the current diagnostics to the chat
	 */
	public async addCurrentDiagnostics() {
		const diagnostics = this._workspaceContextProvider.getCurrentDiagnostics();
		const formattedDiagnostics = this._workspaceContextProvider.formatDiagnostics(diagnostics);
		const currentFile = this._workspaceContextProvider.getCurrentFileName();

		if (diagnostics.length === 0) {
			this._sendMessageToWebview({
				command: MessageType.CHAT_MESSAGE,
				text: `No issues found in ${currentFile || 'the current file'}.`
			});
		} else {
			this._sendMessageToWebview({
				command: MessageType.CHAT_MESSAGE,
				text: `Please help me fix these issues in ${currentFile || 'my code'}:\n\n${formattedDiagnostics}`
			});
		}

		vscode.commands.executeCommand('goose.chatView.focus');
	}

	// Add event handler to confirm message was sent to webview
	public sendMessageToWebview(message: any): void {
		if (this._view && this._view.webview) {
			try {
				console.log(`Sending message to webview: ${message.command}`);
				this._view.webview.postMessage(message);
				console.log(`Successfully sent message to webview: ${message.command}`);
				if (message.command === MessageType.AI_MESSAGE && message.message && message.message.id) {
					console.log(`Sent AI message with ID: ${message.message.id}`);
				}
			} catch (error) {
				console.error('Error sending message to webview:', error);
			}
		} else {
			console.warn('Webview is not available, message not sent');
		}
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Activating Goose extension');

	// Initialize logger with configuration
	DefaultLogger.initializeFromConfig(context);
	logger.info('Goose extension activated with log level: ' + LogLevel[DefaultLogger.getGlobalLevel()]);

	// Create server manager with dependencies (using defaults)
	const serverManager = new ServerManager(context, {
		// All dependencies use defaults, but we show the explicit structure
		// which allows for easier mocking in tests or future customization
	});

	// Create chat processor
	const chatProcessor = new ChatProcessor(serverManager);

	// Create session manager
	const sessionManager = new SessionManager(serverManager);

	// Connect chat processor to session manager
	chatProcessor.setSessionManager(sessionManager);

	// Create workspace context provider
	const workspaceContextProvider = WorkspaceContextProvider.getInstance();

	// Create the provider before starting the server
	const provider = new GooseViewProvider(context.extensionUri, serverManager, chatProcessor, sessionManager);

	// Register the Goose View Provider
	const viewRegistration = vscode.window.registerWebviewViewProvider(
		GooseViewProvider.viewType,
		provider,
		{
			webviewOptions: { retainContextWhenHidden: true }
		}
	);

	// Listen for server status changes and update the UI
	serverManager.on('statusChanged', (status: string) => {
		console.log(`Extension received server status change: ${status}`);
		if (provider) {
			provider.sendMessageToWebview({
				command: MessageType.SERVER_STATUS,
				status: status
			});
		}
	});

	// Listen for server exit events
	serverManager.on('serverExit', (code: number | null) => {
		console.log(`Extension received server exit with code: ${code}`);
		if (provider) {
			provider.sendMessageToWebview({
				command: MessageType.SERVER_EXIT,
				code: code
			});
		}
	});

	// Automatically start the server when the extension activates
	serverManager.start().then(success => {
		if (success) {
			console.log('Goose server started automatically on extension activation');
		} else {
			console.error('Failed to automatically start the Goose server');
		}
	}).catch(error => {
		console.error('Error starting Goose server:', error);
	});

	// Register code action provider
	const codeActionProvider = new GooseCodeActionProvider();
	const supportedLanguages = [
		'javascript', 'typescript', 'python', 'java', 'csharp',
		'cpp', 'c', 'rust', 'go', 'php', 'ruby', 'swift', 'kotlin',
		'html', 'css', 'markdown', 'json', 'yaml', 'plaintext'
	];

	const codeActionRegistration = vscode.languages.registerCodeActionsProvider(
		supportedLanguages.map(lang => ({ language: lang })),
		codeActionProvider
	);

	// The command has been defined in the package.json file
	const helloDisposable = vscode.commands.registerCommand('goose.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Goose!');
	});

	// Command to focus the Goose view
	const startDisposable = vscode.commands.registerCommand('goose.start', () => {
		vscode.commands.executeCommand('goose.chatView.focus');
	});

	// Command to manually start the server
	const startServerDisposable = vscode.commands.registerCommand('goose.startServer', async () => {
		try {
			vscode.window.showInformationMessage('Starting Goose server...');
			await serverManager.start();
			vscode.window.showInformationMessage('Goose server started successfully');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to start Goose server: ${error}`);
		}
	});

	// Command to manually stop the server
	const stopServerDisposable = vscode.commands.registerCommand('goose.stopServer', () => {
		try {
			serverManager.stop();
			vscode.window.showInformationMessage('Goose server stopped');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to stop Goose server: ${error}`);
		}
	});

	// Command to ask Goose about selected code
	const askAboutSelectionDisposable = vscode.commands.registerCommand('goose.askAboutSelection', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active text editor found.');
			return;
		}

		const document = editor.document;
		const selection = editor.selection;
		const codeReferenceManager = CodeReferenceManager.getInstance();

		let codeReferenceToSend: CodeReference | null = null;
		let prepayloadToSend: any = null;
		let actionTaken = false; // Flag to track if we should focus

		if (selection.isEmpty) {
			// Task 1.2: No selection - use whole file
			const fileContent = document.getText();
			if (!fileContent) {
				vscode.window.showInformationMessage('Active file is empty.');
				return;
			}
			const fileName = path.basename(document.fileName);
			const lineCount = document.lineCount;
			codeReferenceToSend = {
				// Generate ID similar to manager's pattern
				id: `${fileName}-1-${lineCount}-${Date.now()}`,
				filePath: document.uri.fsPath,
				fileName: fileName,
				startLine: 1, // 1-based
				endLine: lineCount, // 1-based
				selectedText: fileContent, // Use correct property name
				languageId: document.languageId
			};
			logger.info(`No selection, creating reference for whole file: ${codeReferenceToSend.fileName}`);
			actionTaken = true;

		} else {
			// Selection exists
			const selectedLines = selection.end.line - selection.start.line + 1;

			if (selectedLines >= SELECTION_LINE_LIMIT_FOR_PREPEND) {
				// Task 1.3: >= 100 lines - use manager to create code reference chip
				codeReferenceToSend = codeReferenceManager.getCodeReferenceFromSelection();
				if (codeReferenceToSend) {
					logger.info(`Selection >= ${SELECTION_LINE_LIMIT_FOR_PREPEND} lines, creating code reference chip.`);
					actionTaken = true;
				} else {
					// Should not happen if selection is not empty, but good practice
					logger.warn('getCodeReferenceFromSelection returned null despite non-empty selection.');
				}
			} else {
				// Task 1.4: < 100 lines - prepare message with code
				const selectedText = document.getText(selection);
				prepayloadToSend = {
					content: selectedText,
					fileName: path.basename(document.fileName),
					languageId: document.languageId,
					// Add line numbers to the payload
					startLine: selection.start.line + 1, // VS Code lines are 0-based, display is 1-based
					endLine: selection.end.line + 1
				};
				logger.info(`Selection < ${SELECTION_LINE_LIMIT_FOR_PREPEND} lines (${prepayloadToSend.startLine}-${prepayloadToSend.endLine}), preparing message with code.`);
				actionTaken = true;
			}
		}

		// Send the appropriate message to the webview
		if (codeReferenceToSend) {
			provider.sendMessageToWebview({
				command: MessageType.ADD_CODE_REFERENCE,
				codeReference: codeReferenceToSend
			});
		} else if (prepayloadToSend) {
			provider.sendMessageToWebview({
				command: MessageType.PREPARE_MESSAGE_WITH_CODE,
				payload: prepayloadToSend
			});
		}

		// Focus the chat view and input only if an action was taken
		if (actionTaken) {
			vscode.commands.executeCommand('goose.chatView.focus');
			provider.sendMessageToWebview({
				command: MessageType.FOCUS_CHAT_INPUT
			});
		}
	});

	// Register session management commands
	const listSessionsDisposable = vscode.commands.registerCommand('goose.listSessions', async () => {
		try {
			const sessions = await sessionManager.fetchSessions();
			if (provider) {
				provider.sendMessageToWebview({
					command: MessageType.SESSIONS_LIST,
					sessions
				});
			}
		} catch (error) {
			console.error('Error listing sessions:', error);
			vscode.window.showErrorMessage('Failed to list sessions');
		}
	});

	// --- Add Theme Change Listener ---
	const themeChangeListener = vscode.window.onDidChangeActiveColorTheme(theme => {
		const newShikiTheme = provider.getShikiTheme(theme.kind);
		logger.info(`VS Code theme changed. New kind: ${ColorThemeKind[theme.kind]}, Mapped shiki theme: ${newShikiTheme}`);
		provider.sendMessageToWebview({
			command: MessageType.SET_THEME,
			theme: newShikiTheme
		});
	});
	// --- End Theme Change Listener ---

	// Add all disposables to the extension context's subscriptions
	context.subscriptions.push(
		viewRegistration,
		helloDisposable,
		startDisposable,
		startServerDisposable,
		stopServerDisposable,
		askAboutSelectionDisposable,
		codeActionRegistration,
		listSessionsDisposable,
		themeChangeListener // Add the new listener here
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
