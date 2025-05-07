import * as vscode from 'vscode';
import * as path from 'path';

export interface CodeReference {
    id: string;
    filePath: string;
    fileName: string;
    startLine: number;
    endLine: number;
    selectedText: string;
    languageId: string;
}

export class CodeReferenceManager {
    private static instance: CodeReferenceManager;

    private constructor() { }

    public static getInstance(): CodeReferenceManager {
        if (!CodeReferenceManager.instance) {
            CodeReferenceManager.instance = new CodeReferenceManager();
        }
        return CodeReferenceManager.instance;
    }

    /**
     * Gets a code reference from the active editor's selection
     */
    public getCodeReferenceFromSelection(): CodeReference | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        const document = editor.document;
        const selection = editor.selection;

        if (selection.isEmpty) {
            return null;
        }

        const selectedText = document.getText(selection);
        // If the selected text is only whitespace, treat it as empty
        if (selectedText.trim() === '') {
            return null;
        }

        const filePath = document.uri.fsPath;
        const fileName = path.basename(filePath);
        const startLine = selection.start.line + 1; // 1-based line numbers
        const endLine = selection.end.line + 1; // 1-based line numbers
        const languageId = document.languageId;

        return {
            id: `${fileName}-${startLine}-${endLine}-${Date.now()}`,
            filePath,
            fileName,
            startLine,
            endLine,
            selectedText,
            languageId
        };
    }

    /**
     * Gets a code reference for the entire content of a document.
     */
    public getCodeReferenceForEntireFile(document: vscode.TextDocument): CodeReference | null {
        if (!document) {
            return null;
        }

        const fileContent = document.getText();
        if (fileContent.trim() === '') {
            return null; // Do not create reference for empty or whitespace-only file
        }

        const filePath = document.uri.fsPath;
        const fileName = path.basename(filePath);
        const startLine = 1; // For the whole file, starts at line 1
        const endLine = document.lineCount > 0 ? document.lineCount : 1; // Ends at the last line
        const languageId = document.languageId;

        return {
            id: `${fileName}-wholefile-${Date.now()}`,
            filePath,
            fileName,
            startLine,
            endLine,
            selectedText: fileContent, // The entire file content
            languageId
        };
    }

    /**
     * Formats a code reference for display in the chat
     */
    public formatCodeReferenceForChat(codeRef: CodeReference): string {
        return `From ${codeRef.filePath}:${codeRef.startLine}-${codeRef.endLine}:\n\`\`\`${codeRef.languageId}\n${codeRef.selectedText}\n\`\`\``;
    }

    /**
     * Gets a short display string for the code reference chip
     */
    public getCodeReferenceDisplayString(codeRef: CodeReference): string {
        return `${codeRef.fileName}:${codeRef.startLine}-${codeRef.endLine}`;
    }
} 
