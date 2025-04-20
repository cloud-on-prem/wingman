import { vi, beforeEach, afterEach } from 'vitest';

// Setup console output suppression for all tests
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;
let originalConsoleWarn: typeof console.warn;
let originalConsoleInfo: typeof console.info;

beforeEach(() => {
    // Save original console methods
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    originalConsoleInfo = console.info;

    // Mock console methods to prevent output during tests
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    console.info = vi.fn();
});

afterEach(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;
});

// Setup other common test utilities here if needed 
