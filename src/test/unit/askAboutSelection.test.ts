import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { setupTestEnvironment } from '../testUtils';
import { CodeReferenceManager, CodeReference } from '../../utils/codeReferenceManager';
import { MessageType } from '../../common-types';
import { ChatProcessor } from '../../server/chat/chatProcessor';

suite('Enhanced Ask About Selection Feature Tests', () => {
    let testEnv: ReturnType<typeof setupTestEnvironment>;

    // Mock dependencies and helpers
    let mockEditor: any;
    let mockDocument: any;
    let mockSelection: any;
    let mockWebviewProvider: any;
    let mockChatProcessor: any;
    let mockCodeReferenceManager: any;
    const SELECTION_LINE_LIMIT = 100; // Same constant used in extension.ts

    setup(() => {
        testEnv = setupTestEnvironment();
        
        // Set up common mocks
        mockDocument = {
            getText: sinon.stub().returns('Mock file content'),
            uri: { fsPath: '/path/to/mockFile.ts' },
            fileName: 'mockFile.ts',
            languageId: 'typescript',
            lineCount: 50
        };
        
        mockSelection = {
            isEmpty: false,
            start: { line: 0 },
            end: { line: 0 }
        };
        
        mockEditor = {
            document: mockDocument,
            selection: mockSelection
        };
        
        // Mock VS Code window.activeTextEditor
        sinon.stub(vscode.window, 'activeTextEditor').get(() => mockEditor);
        
        // Mock CodeReferenceManager
        mockCodeReferenceManager = {
            getInstance: sinon.stub().returns({
                getCodeReferenceFromSelection: sinon.stub().returns({
                    id: 'mock-ref-id',
                    filePath: '/path/to/mockFile.ts',
                    fileName: 'mockFile.ts',
                    startLine: 1,
                    endLine: 1,
                    selectedText: 'Mock selection',
                    languageId: 'typescript'
                })
            })
        };
        
        // Mock the webview provider
        mockWebviewProvider = {
            sendMessageToWebview: sinon.spy()
        };
        
        // Mock ChatProcessor for message handling
        mockChatProcessor = {
            sendMessage: sinon.spy()
        };
        
        // No need to stub global objects - we'll provide the mock directly to the handler
    });

    teardown(() => {
        testEnv.cleanup();
        sinon.restore();
    });

    /**
     * Test the behavior when there is no selection (whole file case)
     */
    test('should send entire file as code reference when no selection exists', () => {
        // Setup test: empty selection
        mockSelection.isEmpty = true;
        
        // Execute the askAboutSelection command handler logic
        executeAskAboutSelectionHandler(mockWebviewProvider);
        
        // Verify: ADD_CODE_REFERENCE message sent with file content
        assert.strictEqual(mockWebviewProvider.sendMessageToWebview.callCount, 2);
        
        const firstCall = mockWebviewProvider.sendMessageToWebview.getCall(0);
        assert.strictEqual(firstCall.args[0].command, MessageType.ADD_CODE_REFERENCE);
        
        const codeRef = firstCall.args[0].codeReference;
        assert.strictEqual(codeRef.selectedText, 'Mock file content');
        assert.strictEqual(codeRef.fileName, 'mockFile.ts');
        assert.strictEqual(codeRef.startLine, 1); // 1-based
        assert.strictEqual(codeRef.endLine, 50); // lineCount
        
        // Verify focus message
        const secondCall = mockWebviewProvider.sendMessageToWebview.getCall(1);
        assert.strictEqual(secondCall.args[0].command, MessageType.FOCUS_CHAT_INPUT);
    });

    /**
     * Test the behavior when the selection is small (< 100 lines)
     */
    test('should send PREPARE_MESSAGE_WITH_CODE when selection is < 100 lines', () => {
        // Setup test: selection with less than 100 lines
        mockSelection.isEmpty = false;
        mockSelection.start.line = 5;
        mockSelection.end.line = 14; // 10 lines total
        mockDocument.getText = sinon.stub().returns('const smallSelection = "test";\nconsole.log(smallSelection);');
        
        // Execute the askAboutSelection command handler logic
        executeAskAboutSelectionHandler(mockWebviewProvider);
        
        // Verify: PREPARE_MESSAGE_WITH_CODE message sent
        assert.strictEqual(mockWebviewProvider.sendMessageToWebview.callCount, 2);
        
        const firstCall = mockWebviewProvider.sendMessageToWebview.getCall(0);
        assert.strictEqual(firstCall.args[0].command, MessageType.PREPARE_MESSAGE_WITH_CODE);
        
        const payload = firstCall.args[0].payload;
        assert.strictEqual(payload.content, 'const smallSelection = "test";\nconsole.log(smallSelection);');
        assert.strictEqual(payload.fileName, 'mockFile.ts');
        assert.strictEqual(payload.languageId, 'typescript');
        
        // Verify focus message
        const secondCall = mockWebviewProvider.sendMessageToWebview.getCall(1);
        assert.strictEqual(secondCall.args[0].command, MessageType.FOCUS_CHAT_INPUT);
    });

    /**
     * Test the behavior when the selection is large (>= 100 lines)
     */
    test('should send ADD_CODE_REFERENCE when selection is >= 100 lines', () => {
        // Setup test: selection with 100+ lines
        mockSelection.isEmpty = false;
        mockSelection.start.line = 1;
        mockSelection.end.line = 100; // 100 lines total
        
        // Create a stub to ensure getCodeReferenceFromSelection is called
        const getCodeRefStub = sinon.stub().returns({
            id: 'large-selection-id',
            filePath: '/path/to/mockFile.ts',
            fileName: 'mockFile.ts',
            startLine: 1,
            endLine: 100,
            selectedText: 'Large selection content...',
            languageId: 'typescript'
        });
        
        mockCodeReferenceManager.getInstance = sinon.stub().returns({
            getCodeReferenceFromSelection: getCodeRefStub
        });
        
        // Execute the askAboutSelection command handler logic
        executeAskAboutSelectionHandler(mockWebviewProvider);
        
        // Verify: ADD_CODE_REFERENCE message is sent with the code reference
        assert.strictEqual(mockWebviewProvider.sendMessageToWebview.callCount, 2);
        
        // Check if getCodeReferenceFromSelection was called
        assert.strictEqual(getCodeRefStub.called, true, "getCodeReferenceFromSelection should be called");
        
        const firstCall = mockWebviewProvider.sendMessageToWebview.getCall(0);
        assert.strictEqual(firstCall.args[0].command, MessageType.ADD_CODE_REFERENCE);
        
        const codeRef = firstCall.args[0].codeReference;
        assert.strictEqual(codeRef.fileName, 'mockFile.ts');
        assert.strictEqual(codeRef.startLine, 1);
        assert.strictEqual(codeRef.endLine, 100);
        
        // Verify focus message
        const secondCall = mockWebviewProvider.sendMessageToWebview.getCall(1);
        assert.strictEqual(secondCall.args[0].command, MessageType.FOCUS_CHAT_INPUT);
    });

    /**
     * Test the ChatProcessor's handling of prependedCode
     */
    test('ChatProcessor should format prependedCode in markdown when present', () => {
        // Create a real ChatProcessor instance with mock dependencies
        const processor = new ChatProcessor({
            getApiClient: () => ({
                streamChatResponse: sinon.stub().resolves(new Response())
            })
        } as any);
        
        // Store the original method to restore it after the test
        const originalSendChatRequest = (processor as any).sendChatRequest;
        
        try {
            // Replace sendChatRequest with a simple stub that does nothing
            (processor as any).sendChatRequest = sinon.stub().resolves(new Response());
            
            // Prepare test data
            const prependedCode = {
                content: 'const code = "small snippet";\nconsole.log(code);',
                fileName: 'snippet.ts',
                languageId: 'typescript'
            };
            
            // Call the method we're testing
            processor.sendMessage(
                'Explain this code', // text
                [], // codeReferences 
                prependedCode, // prependedCode
                'msg123', // messageId
                'session123' // sessionId
            );
            
            // Get the message directly from the ChatProcessor's internal state
            const userMessage = (processor as any).currentMessages[0];
            
            // Basic checks
            assert.ok(userMessage, 'User message should be created');
            assert.strictEqual(userMessage.role, 'user', 'Message should have user role');
            assert.ok(Array.isArray(userMessage.content), 'Message should have content array');
            assert.ok(userMessage.content.length > 0, 'Message content array should not be empty');
            
            // Get the text content of the message
            const messageText = userMessage.content[0].text;
            
            // Test the formatting
            assert.ok(
                messageText.includes('```typescript'),
                'Message should include typescript code block'
            );
            assert.ok(
                messageText.includes('const code'),
                'Message should include the code content'
            );
            assert.ok(
                messageText.includes('console.log'),
                'Message should include the complete code'
            );
            assert.ok(
                messageText.includes('Explain this code'),
                'Message should include the user question'
            );
            
            // Check that the markdown formatting is correct
            // Code block should be before the question
            const codeBlockIndex = messageText.indexOf('```typescript');
            const questionIndex = messageText.indexOf('Explain this code');
            assert.ok(codeBlockIndex < questionIndex, 'Code block should appear before the user question');
        } finally {
            // Restore the original method
            if (originalSendChatRequest) {
                (processor as any).sendChatRequest = originalSendChatRequest;
            }
        }
    });

    /**
     * Helper function that simulates the core logic of the askAboutSelection command handler
     */
    function executeAskAboutSelectionHandler(provider: any) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const codeReferenceManager = mockCodeReferenceManager.getInstance();

        let codeReferenceToSend: CodeReference | null = null;
        let prepayloadToSend: any = null;
        let actionTaken = false;

        if (selection.isEmpty) {
            // No selection - use whole file
            const fileContent = document.getText();
            if (!fileContent) {
                return;
            }
            const fileName = 'mockFile.ts'; // Simplified for test
            const lineCount = document.lineCount;
            codeReferenceToSend = {
                id: `${fileName}-1-${lineCount}-${Date.now()}`,
                filePath: document.uri.fsPath,
                fileName: fileName,
                startLine: 1,
                endLine: lineCount,
                selectedText: fileContent,
                languageId: document.languageId
            };
            actionTaken = true;
        } else {
            // Selection exists
            const selectedLines = selection.end.line - selection.start.line + 1;

            if (selectedLines >= SELECTION_LINE_LIMIT) {
                // >= 100 lines - use code reference chip
                codeReferenceToSend = codeReferenceManager.getCodeReferenceFromSelection();
                if (codeReferenceToSend) {
                    actionTaken = true;
                }
            } else {
                // < 100 lines - prepare message with code
                const selectedText = document.getText(selection);
                prepayloadToSend = {
                    content: selectedText,
                    fileName: 'mockFile.ts', // Simplified for test
                    languageId: document.languageId,
                };
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

        // Focus the chat view and input
        if (actionTaken) {
            // Skipping actual vscode.commands.executeCommand for tests
            provider.sendMessageToWebview({
                command: MessageType.FOCUS_CHAT_INPUT
            });
        }
    }
});
