import * as vscode from 'vscode';

/**
 * Log levels, in order of verbosity (lowest to highest)
 */
export enum LogLevel {
    NONE = 0,   // No logging
    ERROR = 1,  // Only errors
    WARN = 2,   // Errors and warnings
    INFO = 3,   // Errors, warnings, and info
    DEBUG = 4   // Everything, including debug messages
}

/**
 * Logger interface that components can implement
 */
export interface Logger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
}

/**
 * Default logger implementation that respects log level settings
 */
export class DefaultLogger implements Logger {
    private level: LogLevel;
    private category: string;
    private static globalLevel: LogLevel = LogLevel.INFO; // Default global level

    /**
     * Create a new logger
     * @param category Category name for this logger (usually the component name)
     * @param level Optional specific level for this logger
     */
    constructor(category: string, level?: LogLevel) {
        this.category = category;
        this.level = level !== undefined ? level : DefaultLogger.globalLevel;
    }

    /**
     * Update all loggers with VS Code configuration
     * @param context VS Code extension context
     */
    public static initializeFromConfig(context: vscode.ExtensionContext): void {
        // Read initial configuration
        const updateLogLevel = () => {
            const config = vscode.workspace.getConfiguration('goose');
            const configLevel = config.get<string>('logLevel', 'info').toLowerCase();

            // Convert string to LogLevel enum
            let level = LogLevel.INFO;
            switch (configLevel) {
                case 'none': level = LogLevel.NONE; break;
                case 'error': level = LogLevel.ERROR; break;
                case 'warn': level = LogLevel.WARN; break;
                case 'info': level = LogLevel.INFO; break;
                case 'debug': level = LogLevel.DEBUG; break;
                default: level = LogLevel.INFO;
            }

            DefaultLogger.setGlobalLevel(level);
            console.info(`[Logger] Set global log level to ${LogLevel[level]}`);
        };

        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('goose.logLevel')) {
                    updateLogLevel();
                }
            })
        );

        // Initial update
        updateLogLevel();
    }

    /**
     * Set the global log level for all loggers
     */
    public static setGlobalLevel(level: LogLevel): void {
        DefaultLogger.globalLevel = level;
    }

    /**
     * Get the global log level
     */
    public static getGlobalLevel(): LogLevel {
        return DefaultLogger.globalLevel;
    }

    /**
     * Set this specific logger's level
     */
    public setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * Get this logger's level
     */
    public getLevel(): LogLevel {
        return this.level;
    }

    /**
     * Log a debug message
     */
    public debug(message: string, ...args: any[]): void {
        if (this.level >= LogLevel.DEBUG) {
            console.debug(`[${this.category}] ${message}`, ...args);
        }
    }

    /**
     * Log an info message
     */
    public info(message: string, ...args: any[]): void {
        if (this.level >= LogLevel.INFO) {
            console.info(`[${this.category}] ${message}`, ...args);
        }
    }

    /**
     * Log a warning message
     */
    public warn(message: string, ...args: any[]): void {
        if (this.level >= LogLevel.WARN) {
            console.warn(`[${this.category}] ${message}`, ...args);
        }
    }

    /**
     * Log an error message
     */
    public error(message: string, ...args: any[]): void {
        if (this.level >= LogLevel.ERROR) {
            console.error(`[${this.category}] ${message}`, ...args);
        }
    }
}

/**
 * Get a logger for a specific category
 * @param category The category name (usually component name)
 * @returns A logger for that category
 */
export function getLogger(category: string): Logger {
    return new DefaultLogger(category);
} 
