import * as vscode from 'vscode';

/**
 * Defines the available log levels.
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

// Helper function to map config string to LogLevel enum
function mapStringToLogLevel(levelStr: string | undefined): LogLevel {
    switch (levelStr?.toUpperCase()) {
        case 'DEBUG': return LogLevel.DEBUG;
        case 'INFO': return LogLevel.INFO;
        case 'WARN': return LogLevel.WARN;
        case 'ERROR': return LogLevel.ERROR;
        default: return LogLevel.INFO; // Default to INFO if undefined or invalid
    }
}

/**
 * Maps LogLevel enum to string representation.
 */
const LogLevelMap: { [key in LogLevel]: string } = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
};

/**
 * Interface for a logger instance, potentially tagged with a source.
 */
export interface ILogger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string | Error, ...args: any[]): void;
}

/**
 * Central logger utility for the Goose extension.
 *
 * Wraps a VS Code OutputChannel and provides leveled logging methods.
 * Follows a singleton pattern.
 */
export class Logger implements ILogger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private currentLogLevel: LogLevel = LogLevel.INFO;
    private isEnabled: boolean = true;
    private source: string = 'Goose'; // Default source tag

    // Private constructor for singleton and source tagging
    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Goose', { log: true });
        // Read initial configuration when the instance is created
        this.updateConfiguration(); 
    }

    /**
     * Gets the singleton logger instance.
     */
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Updates the logger's configuration based on current VS Code settings.
     * Call this from extension.ts on activation and config change (Task 3).
     */
    public updateConfiguration(): void {
        const config = vscode.workspace.getConfiguration('goose.logging');
        const newEnabled = config.get<boolean>('enabled', false);
        const newLevelStr = config.get<string>('level', 'INFO');
        const newLevel = mapStringToLogLevel(newLevelStr);

        // Only log enable/disable messages if the state actually changes
        if (newEnabled !== this.isEnabled) {
            this.isEnabled = newEnabled;
            this.log(LogLevel.INFO, this.isEnabled ? 'Logging enabled.' : 'Logging disabled.');
        }
        
        // Log level change if logging is enabled
        if (this.isEnabled && newLevel !== this.currentLogLevel) {
             this.log(LogLevel.INFO, `Log level set to: ${LogLevelMap[newLevel]}`);
        }
        this.currentLogLevel = newLevel;

        // Note: goose.logging.logSensitiveRequests is read elsewhere (e.g., ApiClient)
    }

    /**
     * Creates a new logger instance tagged with a specific source.
     * Messages logged through this instance will include the source tag.
     */
    public createSource(sourceName: string): Logger { 
        // Create a new logger instance based on the current one
        const sourceLogger = Object.create(this) as Logger;
        // Assign the specific source name to this new instance
        sourceLogger.source = sourceName; // Store the source name
        return sourceLogger;
    }

    // Method to satisfy ILogger for tests or specific scenarios if needed
    public getILogger(): ILogger {
        return this;
    }

    /**
     * Updates the logger configuration based on VS Code settings.
     */
    /**
     * Implementation of ILogger methods (delegating to the private log method)
     */
    public debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    public info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, ...args);
    }

    public warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, ...args);
    }

    public error(message: string | Error, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, ...args);
    }

    /**
     * Central log processing method.
     */
    private log(level: LogLevel, message: string | Error, _source?: string /* Unused */, ...args: any[]): void {
        // Special handling for the initial enable/disable messages from updateConfiguration
        const isConfigMsg = message === 'Logging disabled.' || message.toString().startsWith('Logging enabled.') || message.toString().startsWith('Log level set to:');
        
        // Check if logging is enabled and the message level is sufficient
        // Allow config messages through even if the level is INFO but the setting is WARN/ERROR
        if (!isConfigMsg && (!this.isEnabled || level < this.currentLogLevel)) {
            return; // Skip logging if disabled or below configured level
        }

        const levelStr = LogLevelMap[level];
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', ''); // More standard format

        let formattedMessage = `[${timestamp}] [${levelStr}] [${this.source}] `; 

        if (message instanceof Error) {
            formattedMessage += `${message.message}${message.stack ? `\nStack: ${message.stack}` : ''}`;
        } else {
            formattedMessage += message;
        }

        // Append additional arguments
        const formattedArgs = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
        ).join(' ');
        if (formattedArgs.length > 0) {
            formattedMessage += ` ${formattedArgs}`;
        }

        this.outputChannel.appendLine(formattedMessage);
    }
}

// Export the singleton instance for global use
export const logger = Logger.getInstance();
