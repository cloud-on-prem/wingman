import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { GooseServerConfig, GooseServerInfo, startGoosed as actualStartGoosed } from './gooseServer';
import { ApiClient as ActualApiClient } from './apiClient';
import { getBinaryPath as actualGetBinaryPath } from '../utils/binaryPath';
import { Message } from 'src/types';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import { DefaultLogger, getLogger, LogLevel, Logger } from '../utils/logging';
import { readGooseConfig } from '../utils/configReader';

// Get a logger instance for the ServerManager
const logger = getLogger('ServerManager');

/**
 * Server status options
 */
export enum ServerStatus {
    STOPPED = 'stopped',
    STARTING = 'starting',
    RUNNING = 'running',
    ERROR = 'error'
}

/**
 * Events emitted by the server manager
 */
export enum ServerEvents {
    STATUS_CHANGE = 'statusChange',
    ERROR = 'error',
    MESSAGE = 'message',
    SERVER_EXIT = 'serverExit'
}

// Define the type for the startGoosed function
type StartGoosedFn = typeof actualStartGoosed;

// Define the type for the getBinaryPath function
type GetBinaryPathFn = typeof actualGetBinaryPath;

// Define the type for the ApiClient constructor
type ApiClientConstructor = typeof ActualApiClient;

/**
 * Interface for dependencies that can be injected into ServerManager
 */
export interface ServerManagerDependencies {
    startGoosed?: StartGoosedFn;
    getBinaryPath?: GetBinaryPathFn;
    ApiClient?: ApiClientConstructor;
    logger?: Logger;
}

/**
 * Server manager for the VSCode extension
 */
export class ServerManager {
    private serverInfo: GooseServerInfo | null = null;
    private apiClient: ActualApiClient | null = null;
    private status: ServerStatus = ServerStatus.STOPPED;
    private eventEmitter: EventEmitter;
    private context: vscode.ExtensionContext;
    private extensionEvents: EventEmitter;
    private secretKey: string;
    private serverProcess: cp.ChildProcess | null = null;
    private startGoosedFn: StartGoosedFn;
    private getBinaryPathFn: GetBinaryPathFn;
    private ApiClientConstructor: ApiClientConstructor;
    private logger: Logger;
    private gooseProvider: string | null = null;
    private gooseModel: string | null = null;
    private configLoadAttempted: boolean = false;

    constructor(
        context: vscode.ExtensionContext,
        dependencies: ServerManagerDependencies = {}
    ) {
        this.context = context;
        this.eventEmitter = new EventEmitter();
        this.extensionEvents = new EventEmitter();

        // Use injected or default dependencies
        this.startGoosedFn = dependencies.startGoosed || actualStartGoosed;
        this.getBinaryPathFn = dependencies.getBinaryPath || actualGetBinaryPath;
        this.ApiClientConstructor = dependencies.ApiClient || ActualApiClient;
        this.logger = dependencies.logger || logger;

        // Generate a new secret key on initialization
        this.secretKey = this.generateSecretKey();

        // Register cleanup on extension deactivation
        context.subscriptions.push({
            dispose: () => this.stop()
        });
    }

    /**
     * Generate a secure random secret key
     */
    private generateSecretKey(): string {
        // Create a random string of 32 characters
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';

        // Use crypto.randomBytes for cryptographically secure random key generation
        // No fallback - if this fails, we should let the error propagate
        const randomBytes = crypto.randomBytes(32);
        for (let i = 0; i < randomBytes.length; i++) {
            result += chars[randomBytes[i] % chars.length];
        }

        return result;
    }

    /**
     * Start the Goose server
     */
    public async start(): Promise<boolean> {
        if (this.status !== ServerStatus.STOPPED) {
            this.logger.info('Server is already running or starting');
            return false;
        }

        // --- Load Configuration ---
        if (!this.configLoadAttempted) { // Attempt loading only once per instance lifecycle or restart
             const config = readGooseConfig();
             this.gooseProvider = config.provider;
             this.gooseModel = config.model;
             this.configLoadAttempted = true; // Mark as attempted

             // --- Validate Configuration ---
             if (!this.gooseProvider || !this.gooseModel) {
                 const missing = [];
                 if (!this.gooseProvider) { missing.push('GOOSE_PROVIDER'); }
                 if (!this.gooseModel) { missing.push('GOOSE_MODEL'); }
                 const errorMsg = `Goose: Failed to load required configuration (${missing.join(', ')}) from config file. Please ensure ~/.config/goose/config.yaml (or Windows equivalent) exists and contains valid GOOSE_PROVIDER and GOOSE_MODEL keys.`;
                 this.logger.error(errorMsg);
                 vscode.window.showErrorMessage(errorMsg);
                 this.setStatus(ServerStatus.ERROR); // Set error status
                 this.eventEmitter.emit(ServerEvents.ERROR, new Error(errorMsg)); // Emit error event
                 return false; // Prevent server start
             }
             // --- End Validate Configuration ---
        }
        // --- End Load Configuration ---

        // Generate a new secret key each time we start the server
        this.secretKey = this.generateSecretKey();

        this.setStatus(ServerStatus.STARTING);
        this.logger.info('Starting Goose server...');

        // Log partial secret key for debugging (without revealing the full key)
        const keyPrefix = this.secretKey.substring(0, 4);
        const keySuffix = this.secretKey.substring(this.secretKey.length - 4);
        this.logger.debug(`Using secret key: ${keyPrefix}...${keySuffix} (${this.secretKey.length} chars)`);

        try {
            // Configure and start the server
            const serverConfig: GooseServerConfig = {
                workingDir: this.getWorkspaceDirectory(),
                getBinaryPath: (binaryName: string) => this.getBinaryPathFn(this.context, binaryName),
                logger: {
                    info: (message: string, ...args: any[]) => this.logger.info(`[GooseServer] ${message}`, ...args),
                    error: (message: string, ...args: any[]) => this.logger.error(`[GooseServer] ${message}`, ...args)
                },
                events: this.extensionEvents,
                secretKey: this.secretKey
            };

            // Use the stored startGoosed function
            this.serverInfo = await this.startGoosedFn(serverConfig);

            // Set up process exit handler
            this.serverInfo.process.on('close', (code) => {
                this.logger.info(`Server process exited with code ${code}`);
                this.setStatus(ServerStatus.STOPPED);
                this.eventEmitter.emit(ServerEvents.SERVER_EXIT, code);
            });

            // Create API client for the server
            this.apiClient = new this.ApiClientConstructor({
                baseUrl: `http://127.0.0.1:${this.serverInfo.port}`,
                secretKey: this.secretKey,
                debug: true,
                logger: {
                    info: (message: string, ...args: any[]) => this.logger.info(`[ApiClient] ${message}`, ...args),
                    error: (message: string, ...args: any[]) => this.logger.error(`[ApiClient] ${message}`, ...args)
                }
            });

            // Configure the agent
            await this.configureAgent();

            this.setStatus(ServerStatus.RUNNING);
            return true;
        } catch (error) {
            this.logger.error('Error starting Goose server:', error);

            // Check for specific binary not found error
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('find the') && errorMessage.includes('executable')) {
                // The error message from getBinaryPath already includes instructions and shows a VS Code notification
                // So we don't need to show another message, just set the status to ERROR
                this.logger.error('Failed to find Goose Desktop installation. Please install it from https://block.github.io/goose/');
            } else {
                // For other errors, show a generic error message
                vscode.window.showErrorMessage(
                    `Failed to start Goose server: ${errorMessage}. Please check logs for details.`,
                    { modal: false }
                );
            }

            this.setStatus(ServerStatus.ERROR);
            this.eventEmitter.emit(ServerEvents.ERROR, error);
            return false;
        }
    }

    /**
     * Configure the agent with appropriate provider and settings
     */
    private async configureAgent(): Promise<void> {
        if (!this.apiClient) {
            this.logger.error('Cannot configure agent: API client not initialized');
            throw new Error('API client not initialized'); // Throw to be caught by start()
        }

        try {
            this.logger.info('Configuring Goose agent...');

            // --- Use Loaded Config (Must be present due to validation in start()) ---
            const providerToUse = this.gooseProvider!; // Non-null assertion ok due to check in start()
            const modelToUse = this.gooseModel!;     // Non-null assertion ok due to check in start()

            this.logger.info(`Using Provider from Config: ${providerToUse}`);
            this.logger.info(`Using Model from Config: ${modelToUse}`);
            // --- End Use Loaded Config ---

            let versionToUse = 'truncate'; // Default version

            try {
                // Get available versions first
                const versions = await this.apiClient.getAgentVersions();
                this.logger.info(`Available versions: ${JSON.stringify(versions)}`);

                if (versions && versions.default_version) {
                    versionToUse = versions.default_version;
                    this.logger.info(`Using default version: ${versionToUse}`);
                }
            } catch (err) {
                this.logger.error('Error getting versions, using default:', err);
                // Continue with default version
            }

            // Create the agent with the configured provider and model
            try {
                this.logger.info(`Creating agent with provider: ${providerToUse}, model: ${modelToUse}, version: ${versionToUse}`);

                const agentResult = await this.apiClient.createAgent(
                    providerToUse,  // Use provider from config
                    modelToUse,      // Use model from config
                    versionToUse     // Use the version we determined
                );

                this.logger.info(`Agent created successfully: ${JSON.stringify(agentResult)}`);

                // Extend the agent with the VSCode developer extension
                try {
                    await this.apiClient.addExtension('developer');
                    this.logger.info('Added developer extension to agent');
                } catch (promptErr) {
                    this.logger.error('Failed to add developer extension:', promptErr);
                    // Continue even if extension addition fails
                }

            } catch (agentErr) {
                this.logger.error(`Failed to create agent with provider ${providerToUse}:`, agentErr);
                throw agentErr; // Re-throw the error
            }

        } catch (error) {
            this.logger.error('Error configuring agent:', error);
            this.eventEmitter.emit(ServerEvents.ERROR, error);
            throw error;
        }
    }

    /**
     * Stop the Goose server
     */
    public stop(): void {
        if (this.serverInfo?.process) {
            this.logger.info('Stopping Goose server');

            try {
                if (process.platform === 'win32' && this.serverInfo.process.pid) {
                    const { spawn } = require('child_process');
                    spawn('taskkill', ['/pid', this.serverInfo.process.pid.toString(), '/T', '/F']);
                } else {
                    this.serverInfo.process.kill();
                }
            } catch (error) {
                this.logger.error('Error stopping Goose server:', error);
            }

            this.serverInfo = null;
            this.apiClient = null;
            this.configLoadAttempted = false; // Allow re-loading config on next start
            this.setStatus(ServerStatus.STOPPED);
        }
    }

    /**
     * Restart the Goose server
     */
    public async restart(): Promise<boolean> {
        this.stop();
        return await this.start();
    }

    /**
     * Get the server status
     */
    public getStatus(): ServerStatus {
        return this.status;
    }

    /**
     * Get the API client
     */
    public getApiClient(): ActualApiClient | null {
        return this.apiClient;
    }

    /**
     * Get the server port
     */
    public getPort(): number | null {
        return this.serverInfo?.port || null;
    }

    /**
     * Send a chat message and stream the response
     */
    public async sendChatMessage(
        messages: Message[],
        abortController?: AbortController
    ): Promise<Response | null> {
        if (!this.apiClient || this.status !== ServerStatus.RUNNING) {
            throw new Error('Server is not running');
        }

        try {
            // Get the current workspace directory
            let workingDir = process.cwd();

            // If VSCode has an active workspace folder, use that instead
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                workingDir = workspaceFolders[0].uri.fsPath;
            }

            return await this.apiClient.streamChatResponse(
                messages,
                abortController,
                undefined, // No session ID for now
                workingDir
            );
        } catch (error) {
            this.logger.error('Error sending chat message:', error);
            this.eventEmitter.emit(ServerEvents.ERROR, error);
            return null;
        }
    }

    /**
     * Get the server URL
     */
    public getServerUrl(): string | null {
        if (this.serverInfo) {
            return `http://127.0.0.1:${this.serverInfo.port}`;
        }
        return null;
    }

    /**
     * Get the secret key
     */
    public getSecretKey(): string {
        return this.secretKey;
    }

    /**
     * Check if the server is ready to handle requests
     */
    public isReady(): boolean {
        return this.status === ServerStatus.RUNNING && this.apiClient !== null;
    }

    /**
     * Set the server status and emit an event
     */
    private setStatus(status: ServerStatus) {
        this.status = status;
        this.eventEmitter.emit(ServerEvents.STATUS_CHANGE, status);
        // Also emit a general event for extension to listen to
        this.extensionEvents.emit('statusChanged', status);
        this.logger.info(`Server status changed to ${status}`);
    }

    /**
     * Add event listener for both ServerEvents and custom events
     */
    public on(event: ServerEvents | string, listener: (...args: any[]) => void): void {
        if (Object.values(ServerEvents).includes(event as ServerEvents)) {
            this.eventEmitter.on(event, listener);
        } else {
            this.extensionEvents.on(event, listener);
        }
    }

    /**
     * Unsubscribe from server events
     */
    public off(event: ServerEvents, listener: (...args: any[]) => void): void {
        this.eventEmitter.off(event, listener);
    }

    private getBinaryPath(): string {
        // Use the utility function to get the binary path
        return this.getBinaryPathFn(this.context, 'goosed');
    }

    private getWorkspaceDirectory(): string {
        // Implement the logic to get the workspace directory
        // This is a placeholder and should be replaced with the actual implementation
        return process.cwd();
    }
}
