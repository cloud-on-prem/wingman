import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { setupTestEnvironment } from '../testUtils';
import { readGooseConfig, FileSystem, OS } from '../../utils/configReader';
import * as logging from '../../utils/logging';

suite('ConfigReader Tests', () => {
    let testEnv: ReturnType<typeof setupTestEnvironment>;

    // Mock implementations
    const mockFs: FileSystem = {
        existsSync: () => true,
        readFileSync: () => 'GOOSE_PROVIDER: "databricks"\nGOOSE_MODEL: "claude-3-7-sonnet"'
    };
    
    const mockOs: OS = {
        homedir: () => '/mock/home/dir',
        platform: () => 'linux'
    };

    setup(() => {
        testEnv = setupTestEnvironment();
        
        // Create a proper Logger that implements the interface
        const mockLogger: logging.Logger = {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            setLevel: () => {},
            getLevel: () => logging.LogLevel.INFO
        };
        
        // Stub the logger
        testEnv.sandbox.stub(logging, 'getLogger').returns(mockLogger);
    });

    teardown(() => {
        testEnv.cleanup();
    });

    test('should parse valid config file and extract provider and model', () => {
        // Call the function with our mocks
        const result = readGooseConfig(mockFs, mockOs);
        
        // Verify expected result when config is valid
        assert.strictEqual(result.provider, 'databricks');
        assert.strictEqual(result.model, 'claude-3-7-sonnet');
    });

    test('should handle missing config file', () => {
        // Create mock with non-existent file
        const mockFsMissing: FileSystem = {
            existsSync: () => false,
            readFileSync: () => { throw new Error('Should not be called'); }
        };
        
        // Call the function
        const result = readGooseConfig(mockFsMissing, mockOs);
        
        // Verify null result due to missing config
        assert.strictEqual(result.provider, null);
        assert.strictEqual(result.model, null);
    });

    test('should handle invalid YAML content', () => {
        // Create mock with invalid YAML
        const mockFsInvalid: FileSystem = {
            existsSync: () => true,
            readFileSync: () => 'This is not valid YAML:::::'
        };
        
        // Call the function
        const result = readGooseConfig(mockFsInvalid, mockOs);
        
        // Verify null result due to YAML parse error
        assert.strictEqual(result.provider, null);
        assert.strictEqual(result.model, null);
    });

    test('should handle file read errors', () => {
        // Create mock that throws an error
        const mockFsError: FileSystem = {
            existsSync: () => true,
            readFileSync: () => { throw new Error('Failed to read file'); }
        };
        
        // Call the function
        const result = readGooseConfig(mockFsError, mockOs);
        
        // Verify null result due to file read error
        assert.strictEqual(result.provider, null);
        assert.strictEqual(result.model, null);
    });

    test('should handle missing GOOSE_PROVIDER key', () => {
        // Create mock with missing provider
        const mockFsNoProvider: FileSystem = {
            existsSync: () => true,
            readFileSync: () => 'GOOSE_MODEL: "claude-3-7-sonnet"'
        };
        
        // Call the function
        const result = readGooseConfig(mockFsNoProvider, mockOs);
        
        // Verify partial result with missing provider
        assert.strictEqual(result.provider, null);
        assert.strictEqual(result.model, 'claude-3-7-sonnet');
    });

    test('should handle missing GOOSE_MODEL key', () => {
        // Create mock with missing model
        const mockFsNoModel: FileSystem = {
            existsSync: () => true,
            readFileSync: () => 'GOOSE_PROVIDER: "databricks"'
        };
        
        // Call the function
        const result = readGooseConfig(mockFsNoModel, mockOs);
        
        // Verify partial result with missing model
        assert.strictEqual(result.provider, 'databricks');
        assert.strictEqual(result.model, null);
    });

    test('should handle non-string values for keys', () => {
        // Create mock with invalid types
        const mockFsInvalidTypes: FileSystem = {
            existsSync: () => true,
            readFileSync: () => 'GOOSE_PROVIDER: 123\nGOOSE_MODEL: true'
        };
        
        // Call the function
        const result = readGooseConfig(mockFsInvalidTypes, mockOs);
        
        // Verify null results due to incorrect types
        assert.strictEqual(result.provider, null);
        assert.strictEqual(result.model, null);
    });

    test('should handle empty YAML file', () => {
        // Create mock with empty file
        const mockFsEmpty: FileSystem = {
            existsSync: () => true,
            readFileSync: () => ''
        };
        
        // Call the function
        const result = readGooseConfig(mockFsEmpty, mockOs);
        
        // Verify null results due to missing config
        assert.strictEqual(result.provider, null);
        assert.strictEqual(result.model, null);
    });

    test('should use correct path for Windows', () => {
        // Spy on the mock implementation
        const readFileSpy = sinon.spy();
        
        // Create Windows mock
        const mockWinOs: OS = {
            homedir: () => 'C:\\Users\\test',
            platform: () => 'win32'
        };
        
        const mockWinFs: FileSystem = {
            existsSync: () => true,
            readFileSync: (path) => {
                readFileSpy(path);
                return 'GOOSE_PROVIDER: "databricks"\nGOOSE_MODEL: "claude-3-7-sonnet"';
            }
        };
        
        // Set APPDATA for Windows path
        const originalAppData = process.env.APPDATA;
        process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
        
        // Call the function
        const result = readGooseConfig(mockWinFs, mockWinOs);
        
        // Check the path used is Windows format
        sinon.assert.calledOnce(readFileSpy);
        const pathUsed = readFileSpy.firstCall.args[0];
        
        assert.ok(
            pathUsed.includes('AppData') && 
            pathUsed.includes('Roaming') && 
            pathUsed.includes('Block') &&
            pathUsed.includes('goose') &&
            pathUsed.includes('config')
        );
        
        // Restore environment
        if (originalAppData) {
            process.env.APPDATA = originalAppData;
        } else {
            delete process.env.APPDATA;
        }
    });
});
