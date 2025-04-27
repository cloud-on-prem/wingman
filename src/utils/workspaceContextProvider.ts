import * as vscode from 'vscode';

/**
 * Provides context about the current VS Code workspace state.
 */
export class WorkspaceContextProvider {

    /**
     * Gets the file paths of the currently visible text editors.
     * @returns An array of file system paths.
     */
    getVisibleFiles(): string[] {
        return vscode.window.visibleTextEditors
            .map(editor => editor.document.uri.fsPath)
            .filter(fsPath => !!fsPath); // Filter out potential non-file URIs if any
    }

    /**
     * Gets the file paths of the currently open tabs that are file-based.
     * @returns An array of file system paths.
     */
    getOpenTabs(): string[] {
        const openTabs: Set<string> = new Set(); // Use Set to avoid duplicates
        vscode.window.tabGroups.all.forEach(group => {
            group.tabs.forEach(tab => {
                if (tab.input instanceof vscode.TabInputText) {
                    // Check if it's a file URI
                    if (tab.input.uri.scheme === 'file') {
                        openTabs.add(tab.input.uri.fsPath);
                    }
                }
                // Add other TabInput types if needed (e.g., TabInputCustom)
            });
        });
        return Array.from(openTabs);
    }

    /**
     * Gets the current diagnostics (problems) in the workspace, grouped by URI.
     * @returns An array of tuples, where each tuple contains a URI and its associated diagnostics.
     */
    getCurrentProblemsGroupedByUri(): ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]> {
        // Get diagnostics for all URIs in the workspace
        // Note: This might be slow for very large workspaces with many diagnostics.
        // Consider scoping this if performance becomes an issue.
        return vscode.languages.getDiagnostics();
    }

    /**
     * Formats the collected workspace context into a markdown string for the AI prompt.
     * @returns A formatted markdown string, or an empty string if no relevant context is available.
     */
    formatContextForPrompt(): string {
        const visibleFiles = this.getVisibleFiles();
        const openTabs = this.getOpenTabs();
        const problemsGrouped = this.getCurrentProblemsGroupedByUri(); // This returns [Uri, Diagnostic[]][]

        let contextString = '';

        if (visibleFiles.length > 0) {
            contextString += '# VSCode Visible Files\n';
            visibleFiles.forEach(file => {
                contextString += `- ${file}\n`;
            });
            contextString += '\n';
        }

        if (openTabs.length > 0) {
            contextString += '# VSCode Open Tabs\n';
            openTabs.forEach(tab => {
                contextString += `- ${tab}\n`;
            });
            contextString += '\n';
        }

        // Flatten the diagnostics array: [Uri, Diagnostic[]][] -> { uri: Uri, diagnostic: Diagnostic }[]
        const allDiagnostics: { uri: vscode.Uri; diagnostic: vscode.Diagnostic }[] = [];
        problemsGrouped.forEach(([uri, diagnostics]) => {
            diagnostics.forEach(diagnostic => {
                allDiagnostics.push({ uri, diagnostic });
            });
        });


        if (allDiagnostics.length > 0) {
            // Optional: Limit the number of problems reported to avoid excessive context size
            const maxProblemsToShow = 20; // Configurable limit
            const problemsToShow = allDiagnostics.slice(0, maxProblemsToShow);

            contextString += '# VSCode Current Problems\n';
            problemsToShow.forEach(({ uri, diagnostic }) => {
                contextString += `- ${this.formatDiagnostic(diagnostic, uri)}\n`;
            });
            if (allDiagnostics.length > maxProblemsToShow) {
                contextString += `- ... (${allDiagnostics.length - maxProblemsToShow} more problems)\n`;
            }
            contextString += '\n';
        }

        // Remove trailing newline if present
        return contextString.trimEnd();
    }

    /**
     * Gets the file path of the currently active text editor, if any.
     * @returns The file system path or undefined if no active editor or it's not a file.
     */
    getCurrentFileName(): string | undefined {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.scheme === 'file') {
            return editor.document.uri.fsPath;
        }
        return undefined;
    }

    /**
     * Formats a list of diagnostics grouped by URI into a markdown string.
     * @param problemsGrouped Diagnostics grouped by URI.
     * @returns A formatted markdown string.
     */
    formatDiagnosticsList(problemsGrouped: ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]>): string {
         // Flatten the diagnostics array: [Uri, Diagnostic[]][] -> { uri: Uri, diagnostic: Diagnostic }[]
         const allDiagnostics: { uri: vscode.Uri; diagnostic: vscode.Diagnostic }[] = [];
         problemsGrouped.forEach(([uri, diagnostics]) => {
             diagnostics.forEach(diagnostic => {
                 allDiagnostics.push({ uri, diagnostic });
             });
         });

         if (allDiagnostics.length === 0) {
             return "No problems found.";
         }

         // Optional: Limit the number of problems reported to avoid excessive context size
         const maxProblemsToShow = 20; // Configurable limit
         const problemsToShow = allDiagnostics.slice(0, maxProblemsToShow);

         let diagnosticsString = '';
         problemsToShow.forEach(({ uri, diagnostic }) => {
             diagnosticsString += `- ${this.formatDiagnostic(diagnostic, uri)}\n`;
         });
         if (allDiagnostics.length > maxProblemsToShow) {
             diagnosticsString += `- ... (${allDiagnostics.length - maxProblemsToShow} more problems)\n`;
         }
         return diagnosticsString.trimEnd();
    }


    /**
     * Formats a single diagnostic item into a concise string.
     * @param diagnostic The diagnostic object.
     * @param uri The URI of the file the diagnostic belongs to.
     * @returns A formatted string representation of the diagnostic.
     */
    private formatDiagnostic(diagnostic: vscode.Diagnostic, uri: vscode.Uri): string {
        const severityMap: { [key in vscode.DiagnosticSeverity]: string } = {
            [vscode.DiagnosticSeverity.Error]: 'Error',
            [vscode.DiagnosticSeverity.Warning]: 'Warning',
            [vscode.DiagnosticSeverity.Information]: 'Info',
            [vscode.DiagnosticSeverity.Hint]: 'Hint',
        };
        const severity = severityMap[diagnostic.severity];
        const path = uri.fsPath;
        // Add 1 to line and character because they are 0-indexed
        const line = diagnostic.range.start.line + 1;
        const col = diagnostic.range.start.character + 1;
        const source = diagnostic.source ? ` (${diagnostic.source})` : '';

        return `[${severity}] ${path}:${line}:${col} - ${diagnostic.message}${source}`;
    }
}
