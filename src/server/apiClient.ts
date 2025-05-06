import { EventEmitter } from "events";
import { Message } from "../types/messages";
import { logger as singletonLogger, Logger } from "../utils/logger"; // Import singleton logger
import { GooseConfig } from "../utils/configReader"; // Import GooseConfig from correct file
import * as vscode from 'vscode'; // Needed for getConfiguration

// Define interfaces for complex parameter objects
interface StreamChatParams {
    prompt: Message[]; // Expect an array of messages
    abortController?: AbortController; // Make optional if sometimes omitted
    sessionId?: string; // Make optional
    workspaceDirectory?: string; // Make optional
    // Add any other relevant parameters needed by the API
}

/**
 * Configuration for the ApiClient
 */
export interface ApiClientConfig {
    baseUrl: string;
    secretKey: string;
    logger: Logger; // Use our specific Logger type
    events?: EventEmitter;
    debug?: boolean;
}

/**
 * A platform-agnostic client for communicating with the Goose API server
 */
export class ApiClient {
    private baseUrl: string;
    private secretKey: string;
    private logger: Logger; // Store the specific Logger instance
    private events: EventEmitter;
    private secretProviderKeys: string[] = []; // Store names of secret keys
    private debug: boolean; // Declare the debug property

    constructor(config: ApiClientConfig) {
        this.baseUrl = config.baseUrl;
        this.secretKey = config.secretKey;
        this.events = config.events || new EventEmitter();
        this.logger = config.logger.createSource('ApiClient'); // Create a source-tagged logger
        this.debug = config.debug ?? false;
    }

    /**
     * Sets the list of provider configuration keys that are considered secret.
     * @param keys An array of secret key names.
     */
    public setSecretProviderKeys(keys: string[]): void {
        this.secretProviderKeys = keys;
        this.logger.debug(`Received ${keys.length} secret provider keys to redact.`);
    }

    /**
     * Sets the list of secret keys specific to the current provider for redaction.
     * @param keys An array of secret key names.
     */
    public setSecretProviderKeysForCurrentProvider(keys: string[]): void {
        // TODO: Implement logic to use these keys for redaction in the logger or request method.
        this.logger.warn(`ApiClient.setSecretProviderKeys received keys: [${keys.join(', ')}], but redaction logic is not fully implemented.`);
    }

    /**
     * Redacts sensitive information (X-Secret-Key, provider secrets) from headers or body.
     * @param data The data to redact (string or object).
     * @returns The redacted data.
     */
    private redactSecrets(data: any): any {
        const redactedPlaceholder = '***REDACTED***';
        let redactedData = JSON.parse(JSON.stringify(data)); // Deep clone to avoid modifying original

        // Redact X-Secret-Key in headers (if data is an object)
        if (typeof redactedData === 'object' && redactedData !== null && redactedData['X-Secret-Key']) {
            redactedData['X-Secret-Key'] = redactedPlaceholder;
        }

        // Redact provider secret keys (works for headers object or body object)
        if (typeof redactedData === 'object' && redactedData !== null && this.secretProviderKeys.length > 0) {
            for (const key of this.secretProviderKeys) {
                if (redactedData[key]) {
                    redactedData[key] = redactedPlaceholder;
                }
                // Basic check for nested keys (e.g., in request bodies)
                // This is NOT exhaustive for deeply nested structures
                for (const prop in redactedData) {
                    if (typeof redactedData[prop] === 'object' && redactedData[prop] !== null && redactedData[prop][key]) {
                        redactedData[prop][key] = redactedPlaceholder;
                    }
                }
            }
        }

        // If data is a string, attempt simple string replacement
        // This is less robust than object property redaction
        if (typeof redactedData === 'string') {
            // Redact X-Secret-Key value if it appears in the string body
            // Assuming the header format might be logged directly in error scenarios
            const secretKeyPattern = new RegExp(`"?X-Secret-Key"?:\s*"?${this.secretKey}"?`, 'gi');
            redactedData = redactedData.replace(secretKeyPattern, '"X-Secret-Key":"' + redactedPlaceholder + '"');

            // Redact provider secret values
            for (const key of this.secretProviderKeys) {
                // Look for patterns like "key": "value" or key=value
                // This is highly heuristic and might miss cases or have false positives
                try {
                    // JSON-like: "key": "secret_value" 
                    const jsonPattern = new RegExp(`"${key}"\s*:\s*"(.*?)"`, 'gi');
                    redactedData = redactedData.replace(jsonPattern, (_match: any, _p1: any) => `"${key}":"${redactedPlaceholder}"`);

                    // URL encoded-like: key=secret_value
                    const urlPattern = new RegExp(`${key}=([^&\s]+)`, 'gi');
                    redactedData = redactedData.replace(urlPattern, (_match: any, _p1: any) => `${key}=${redactedPlaceholder}`);
                } catch (e) {
                    // Handle potential regex errors on complex keys
                    this.logger.warn(`Regex error during string redaction for key '${key}': ${e}`);
                }
            }
        }

        return redactedData;
    }

    /**
     * Make a request to the Goose API
     * @param path The API endpoint path
     * @param options Fetch options
     * @returns The fetch response
     */
    public async request(
        path: string,
        options: RequestInit = {},
    ): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            ...options.headers,
            "Content-Type": "application/json",
            "X-Secret-Key": this.secretKey,
        };

        // Read logging configuration
        const config = vscode.workspace.getConfiguration('goose.logging');
        const logSensitive = config.get<boolean>('logSensitiveRequests', false);
        // Logging happens only if logger is enabled and level is appropriate (handled by logger itself)
        // We only need the logSensitive flag here for conditional body logging.

        this.logger.debug(`API Request: ${options.method || 'GET'} ${path}`);

        // Log redacted headers at DEBUG level
        this.logger.debug('Request Headers:', this.redactSecrets(headers));

        // Log redacted body conditionally at DEBUG level
        if (options.body && logSensitive) {
            try {
                // Attempt to parse body if JSON, otherwise log as string
                let bodyToLog: any;
                if (typeof options.body === 'string') {
                    try {
                        bodyToLog = JSON.parse(options.body);
                    } catch (e) {
                        bodyToLog = options.body; // Log as string if not JSON
                    }
                } else {
                    bodyToLog = options.body;
                }
                this.logger.debug('Request Body:', this.redactSecrets(bodyToLog));
            } catch (e) {
                this.logger.warn('Could not process request body for logging:', e);
                this.logger.debug('Raw Request Body (unredacted, use with caution):', options.body);
            }
        } else if (options.body) {
            this.logger.debug('Request Body: [REDACTED BY CONFIG]');
        }

        try {
            const response = await fetch(url, { ...options, headers });

            this.logger.debug(`API Response Status: ${response.status} ${response.statusText} for ${options.method || 'GET'} ${path}`);

            // Log response headers at DEBUG level (generally safe)
            const responseHeaders: { [key: string]: string } = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            this.logger.debug('Response Headers:', responseHeaders);

            if (!response.ok) {
                let errorBody = "[Could not read error body]";
                try {
                    errorBody = await response.text();
                } catch (e) { /* Ignore */ }

                let errorBodyToShow = logSensitive ? this.redactSecrets(errorBody) : "[REDACTED BY CONFIG]";
                this.logger.error(`API Error ${response.status} ${response.statusText} for ${options.method || 'GET'} ${path}. Body:`, errorBodyToShow);

                throw new Error(
                    `API request failed: ${response.status} ${response.statusText} - ${errorBody}` // Include body
                );
            }

            // Log response body conditionally at DEBUG level
            if (logSensitive) {
                const clone = response.clone();
                try {
                    let bodyToLog: any;
                    const contentType = clone.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        bodyToLog = await clone.json();
                    } else {
                        bodyToLog = await clone.text();
                    }
                    this.logger.debug('Response Body:', this.redactSecrets(bodyToLog));
                } catch (e) {
                    this.logger.warn('Could not process response body for logging:', e);
                    // Avoid logging raw potentially sensitive body here
                }
            } else {
                // Only log body if sensitive logging is off *and* it's not a streaming type?
                // Or just always say redacted if sensitive logging is off?
                // Let's go with always redacted if sensitive logging is off.
                this.logger.debug('Response Body: [REDACTED BY CONFIG]');
            }

            return response;
        } catch (error) {
            // Log the error object itself which might contain more details
            // The error from response.ok check is already logged above.
            if (!(error instanceof Error && error.message.startsWith('API request failed'))) {
                this.logger.error(`API request to ${path} encountered an unexpected error:`, error);
            }
            throw error;
        }
    }

    // --- START: Stub methods to fix TS2339 errors --- 

    public async listSessions(): Promise<any[]> { // Assuming returns array
        this.logger.warn('ApiClient.listSessions is not implemented');
        // Example using generic request:
        // const response = await this.request('/sessions', { method: 'GET' });
        // return response.json(); 
        return []; // Placeholder
    }

    public async getSessionHistory(sessionId: string): Promise<any | null> { // Assuming returns object or null
        this.logger.warn(`ApiClient.getSessionHistory(${sessionId}) is not implemented`);
        return null; // Placeholder
    }

    public async renameSession(sessionId: string, newName: string): Promise<boolean> {
        this.logger.warn(`ApiClient.renameSession(${sessionId}, ${newName}) is not implemented`);
        return false; // Placeholder
    }

    public async deleteSession(sessionId: string): Promise<boolean> {
        this.logger.warn(`ApiClient.deleteSession(${sessionId}) is not implemented`);
        return false; // Placeholder
    }

    public async getProviders(): Promise<any[]> { // Assuming returns array
        this.logger.warn('ApiClient.getProviders is not implemented');
        return []; // Placeholder
    }

    public async createAgent(provider: string, model: string): Promise<any> { // Assuming returns agent info
        this.logger.warn(`ApiClient.createAgent(${provider}, ${model}) is not implemented`);
        return { agentId: 'stub-agent-id' }; // Placeholder
    }

    public async setAgentPrompt(prompt: string): Promise<any> { 
        this.logger.info(`Setting agent system prompt...`); 
        const path = '/agent/prompt';
        const options: RequestInit = {
            method: 'POST',
            body: JSON.stringify({ extension: prompt })
        };
        try {
            const response = await this.request(path, options);
            const responseData = await response.json(); // Assuming success returns JSON
            this.logger.info(`Agent prompt set successfully, response: ${JSON.stringify(responseData)}`); 
            return responseData; // Return the actual response data
        } catch (error) {
            this.logger.error(`API request to ${path} failed:`, error);
            // Re-throw the error so the test can catch it
            throw error; // Re-throw the original error from this.request
        }
    }

    public async streamChatResponse(_params: StreamChatParams): Promise<Response> { // Add underscore, change return type
        this.logger.warn('ApiClient.streamChatResponse(...) is not implemented - returning fake Response');
        // This needs a proper streaming implementation later
        async function* emptyGenerator(): AsyncIterable<Uint8Array> {}
        // Return a fake Response object to satisfy callers expecting it
        const fakeResponse = {
            ok: true,
            status: 200,
            statusText: 'OK (Stubbed)',
            headers: new Headers(),
            redirected: false,
            type: 'basic',
            url: '',
            clone: () => fakeResponse, // Simple clone
            bodyUsed: false,
            body: emptyGenerator(), // Provide an empty async iterable for the body
            arrayBuffer: async () => new ArrayBuffer(0),
            blob: async () => new Blob(),
            formData: async () => new FormData(),
            json: async () => ({}),
            text: async () => '',
        } as unknown as Response; // Use type assertion carefully
        return fakeResponse;
    }

    // --- END: Stub methods --- 

    /**
     * Make a request to the Goose API
     * @param path The API endpoint path
     * @param options Fetch options
     * @returns The fetch response
     */
    // ... rest of your code remains the same ...
}
