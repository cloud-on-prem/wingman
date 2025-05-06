import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { CodeReferenceManager, CodeReference } from '../../../utils/codeReferenceManager';
import { mock, instance, when, reset, anything, verify, anyString } from 'ts-mockito';

// Mocks for VS Code objects
const mockEditor = mock<vscode.TextEditor>();
const mockDocument = mock<vscode.TextDocument>();
const mockSelection = mock<vscode.Selection>();

suite('CodeReferenceManager Test Suite', () => {
    let codeReferenceManager: CodeReferenceManager;
    let editor: vscode.TextEditor;
    let document: vscode.TextDocument;
    let selection: vscode.Selection;

    // Mocking vscode.window.activeTextEditor
    let originalActiveTextEditor: typeof vscode.window.activeTextEditor;

    setup(() => {
        // Get instance before each test
        codeReferenceManager = CodeReferenceManager.getInstance();

        // Reset mocks
        reset(mockEditor);
        reset(mockDocument);
        reset(mockSelection);

        // Setup instances from mocks
        editor = instance(mockEditor);
        document = instance(mockDocument);
        selection = instance(mockSelection);

        // Default mock behaviors
        when(mockEditor.document).thenReturn(document);
        when(mockEditor.selection).thenReturn(selection);
        when(mockDocument.uri).thenReturn(vscode.Uri.file('/fake/path/test.py'));
        when(mockDocument.languageId).thenReturn('python');
        when(mockDocument.lineCount).thenReturn(10);

        // Mock vscode.window.activeTextEditor
        originalActiveTextEditor = vscode.window.activeTextEditor;
        Object.defineProperty(vscode.window, 'activeTextEditor', {
            get: () => editor,
            configurable: true // Allow redefinition in tests
        });
    });

    teardown(() => {
        // Restore original activeTextEditor
        Object.defineProperty(vscode.window, 'activeTextEditor', {
            get: () => originalActiveTextEditor,
        });
    });

    suite('getCodeReferenceFromSelection', () => {
        test('should return null if no active editor', () => {
            Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined });
            const result = codeReferenceManager.getCodeReferenceFromSelection();
            assert.strictEqual(result, null);
        });

        test('should return null if selection is empty', () => {
            when(mockSelection.isEmpty).thenReturn(true);
            const result = codeReferenceManager.getCodeReferenceFromSelection();
            assert.strictEqual(result, null);
            verify(mockDocument.getText(selection)).never(); // Should not attempt to get text
        });

        test('should return null if selected text is only whitespace', () => {
            when(mockSelection.isEmpty).thenReturn(false);
            when(mockDocument.getText(selection)).thenReturn('   \n\t  ');
            const result = codeReferenceManager.getCodeReferenceFromSelection();
            assert.strictEqual(result, null);
            verify(mockDocument.getText(selection)).once();
        });

        test('should return CodeReference if selection is valid', () => {
            const selectedText = 'print("hello")';
            const startLine = 5;
            const endLine = 5;
            const startChar = 4;
            const endChar = 18;

            when(mockSelection.isEmpty).thenReturn(false);
            when(mockDocument.getText(selection)).thenReturn(selectedText);
            when(mockSelection.start).thenReturn(new vscode.Position(startLine - 1, startChar)); // 0-based
            when(mockSelection.end).thenReturn(new vscode.Position(endLine - 1, endChar)); // 0-based

            const result = codeReferenceManager.getCodeReferenceFromSelection();

            assert.ok(result);
            assert.strictEqual(result.filePath, '/fake/path/test.py');
            assert.strictEqual(result.fileName, 'test.py');
            assert.strictEqual(result.startLine, startLine); // Expect 1-based
            assert.strictEqual(result.endLine, endLine); // Expect 1-based
            assert.strictEqual(result.selectedText, selectedText);
            assert.strictEqual(result.languageId, 'python');
            assert.ok(result.id.startsWith('test.py-5-5-'));
        });
    });

    suite('getCodeReferenceForEntireFile', () => {
        test('should return null if document is null (though type hints prevent)', () => {
            // Test the internal check, although TS prevents passing null directly
            const result = codeReferenceManager.getCodeReferenceForEntireFile(null as any);
            assert.strictEqual(result, null);
        });

        test('should return null if document content is empty', () => {
            when(mockDocument.getText()).thenReturn('');
            when(mockDocument.lineCount).thenReturn(0);
            const result = codeReferenceManager.getCodeReferenceForEntireFile(document);
            assert.strictEqual(result, null);
            verify(mockDocument.getText()).once();
        });

        test('should return null if document content is only whitespace', () => {
            when(mockDocument.getText()).thenReturn(' \n \t ');
            when(mockDocument.lineCount).thenReturn(2);
            const result = codeReferenceManager.getCodeReferenceForEntireFile(document);
            assert.strictEqual(result, null);
            verify(mockDocument.getText()).once();
        });

        test('should return CodeReference for entire valid file', () => {
            const fileContent = 'line1\nline2\nline3';
            const lineCount = 3;
            when(mockDocument.getText()).thenReturn(fileContent);
            when(mockDocument.lineCount).thenReturn(lineCount);
            when(mockDocument.uri).thenReturn(vscode.Uri.file('/another/path/script.js'));
            when(mockDocument.languageId).thenReturn('javascript');

            const result = codeReferenceManager.getCodeReferenceForEntireFile(document);

            assert.ok(result);
            assert.strictEqual(result.filePath, '/another/path/script.js');
            assert.strictEqual(result.fileName, 'script.js');
            assert.strictEqual(result.startLine, 1);
            assert.strictEqual(result.endLine, lineCount);
            assert.strictEqual(result.selectedText, fileContent);
            assert.strictEqual(result.languageId, 'javascript');
            assert.ok(result.id.startsWith('script.js-wholefile-'));
            verify(mockDocument.getText()).once();
        });

         test('should return CodeReference for entire valid file with 1 line', () => {
            const fileContent = 'line1';
            const lineCount = 1;
            when(mockDocument.getText()).thenReturn(fileContent);
            when(mockDocument.lineCount).thenReturn(lineCount);
            when(mockDocument.uri).thenReturn(vscode.Uri.file('/single/line/file.txt'));
            when(mockDocument.languageId).thenReturn('plaintext');

            const result = codeReferenceManager.getCodeReferenceForEntireFile(document);

            assert.ok(result);
            assert.strictEqual(result.filePath, '/single/line/file.txt');
            assert.strictEqual(result.fileName, 'file.txt');
            assert.strictEqual(result.startLine, 1);
            assert.strictEqual(result.endLine, 1);
            assert.strictEqual(result.selectedText, fileContent);
            assert.strictEqual(result.languageId, 'plaintext');
            assert.ok(result.id.startsWith('file.txt-wholefile-'));
            verify(mockDocument.getText()).once();
        });
    });
});
