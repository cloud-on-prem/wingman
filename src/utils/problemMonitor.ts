import * as vscode from 'vscode';
import { ApiClient } from '../server/apiClient'; // Assuming ApiClient path
import { Message } from '../types'; // Assuming Message type path

/**
 * Represents the state of diagnostics at a specific point in time.
 * Keyed by file URI (fsPath) for efficient comparison.
 */
type DiagnosticSnapshot = Map<string, ReadonlyArray<vscode.Diagnostic>>;

/**
 * Monitors workspace diagnostics before and after potential code modifications
 * (e.g., tool actions) and reports new problems back to the AI.
 */
export class ProblemMonitor {
    private apiClient: ApiClient | null = null;
    private beforeSnapshot: DiagnosticSnapshot | null = null;
    private lastMessageIdForSnapshot: string | null = null;
    private sessionIdForSnapshot: string | undefined = undefined; // Added to store session ID

    constructor() {
        // Dependencies like ApiClient might be injected later or retrieved dynamically
    }

    /**
     * Sets the ApiClient instance needed for sending reports.
     * @param apiClient The ApiClient instance.
     */
    setApiClient(apiClient: ApiClient): void {
        this.apiClient = apiClient;
    }

    /**
     * Captures the current state of workspace diagnostics.
     * Should be called *before* an action that might modify code.
     * @param associatedMessageId The ID of the user message triggering the potential action.
     * @param sessionId The session ID associated with the action.
     */
    captureDiagnosticsBeforeAction(associatedMessageId: string, sessionId: string | undefined): void {
        console.log(`[ProblemMonitor] Capturing diagnostics before action for message: ${associatedMessageId} in session: ${sessionId}`);
        this.beforeSnapshot = this.getCurrentDiagnosticsSnapshot();
        this.lastMessageIdForSnapshot = associatedMessageId;
        this.sessionIdForSnapshot = sessionId; // Store the session ID
        console.log(`[ProblemMonitor] Captured ${this.beforeSnapshot.size} files with diagnostics.`);
    }

    /**
     * Compares the current diagnostics against the previously captured snapshot
     * and reports any new problems found.
     * Should be called *after* a potentially code-modifying action has completed.
     * @param triggeringMessageId The ID of the user message that triggered the action.
     * @returns A formatted string containing the new problems, or null if no new problems were found or checks failed.
     */
    async checkAndReportNewProblems(triggeringMessageId: string): Promise<string | null> {
        // Use the stored session ID - might be useful for logging or future context
        const sessionId = this.sessionIdForSnapshot;

        if (!this.beforeSnapshot || this.lastMessageIdForSnapshot !== triggeringMessageId) {
            console.log('[ProblemMonitor] No "before" snapshot available or message ID mismatch. Skipping problem check.');
            this.resetSnapshot(); // Reset before returning
            return null; // Explicitly return null
        }

        // Although not sending directly, keeping the apiClient check might be useful
        // if we add other functionality later. Let's keep it for robustness.
        if (!this.apiClient) {
             console.error('[ProblemMonitor] ApiClient not set. Cannot perform related actions if needed in the future.');
             // Decide if this should prevent checking - for now, let's allow checking but log error.
             // If check should be prevented, uncomment below:
             // this.resetSnapshot();
             // return null;
        }


        console.log(`[ProblemMonitor] Checking for new problems after action for message: ${triggeringMessageId} in session: ${sessionId}`);

        // Allow a brief moment for VS Code diagnostics to update after potential file changes
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay - adjust if needed

        const afterSnapshot = this.getCurrentDiagnosticsSnapshot();
        const newProblems = this.compareDiagnostics(this.beforeSnapshot, afterSnapshot);

        // Clean up the snapshot state *after* comparison but *before* returning
        this.resetSnapshot();

        if (newProblems.length > 0) {
            console.log(`[ProblemMonitor] Detected ${newProblems.length} new problems.`);
            const reportContent = this.formatProblemReport(newProblems);
            // Return the formatted report string
            return reportContent;
        } else {
            console.log('[ProblemMonitor] No new problems detected.');
            // Return null if no new problems
            return null;
        }
        // No code should be here due to return statements above
    }

    /**
     * Resets the stored diagnostic snapshot.
     */
    private resetSnapshot(): void {
        this.beforeSnapshot = null;
        this.lastMessageIdForSnapshot = null;
        this.sessionIdForSnapshot = undefined; // Reset stored session ID
        console.log('[ProblemMonitor] Diagnostic snapshot reset.');
    }

    /**
     * Gets the current workspace diagnostics as a structured map.
     */
    private getCurrentDiagnosticsSnapshot(): DiagnosticSnapshot {
        const snapshot: DiagnosticSnapshot = new Map();
        const diagnostics = vscode.languages.getDiagnostics(); // Returns [Uri, Diagnostic[]][]
        diagnostics.forEach(([uri, diags]) => {
            if (uri.scheme === 'file' && diags.length > 0) {
                snapshot.set(uri.fsPath, diags);
            }
        });
        return snapshot;
    }

    /**
     * Compares two diagnostic snapshots and returns diagnostics present in the 'after'
     * snapshot but not in the 'before' snapshot.
     * @param before The snapshot taken before the action.
     * @param after The snapshot taken after the action.
     * @returns An array of new diagnostic objects with their URIs.
     */
    private compareDiagnostics(before: DiagnosticSnapshot, after: DiagnosticSnapshot): { uri: vscode.Uri; diagnostic: vscode.Diagnostic }[] {
        const newProblems: { uri: vscode.Uri; diagnostic: vscode.Diagnostic }[] = [];

        after.forEach((afterDiags, fsPath) => {
            const beforeDiags = before.get(fsPath);
            const fileUri = vscode.Uri.file(fsPath); // Recreate URI for context

            if (!beforeDiags) {
                // All diagnostics in this file are new
                afterDiags.forEach(diag => newProblems.push({ uri: fileUri, diagnostic: diag }));
            } else {
                // Compare diagnostics within the file
                const beforeDiagSet = new Set(beforeDiags.map(d => this.diagnosticToString(d)));
                afterDiags.forEach(afterDiag => {
                    if (!beforeDiagSet.has(this.diagnosticToString(afterDiag))) {
                        newProblems.push({ uri: fileUri, diagnostic: afterDiag });
                    }
                });
            }
        });

        return newProblems;
    }

    /**
     * Creates a unique string representation of a diagnostic for comparison purposes.
     */
    private diagnosticToString(diag: vscode.Diagnostic): string {
        // Include range, severity, message, source, and code for uniqueness
        const rangeStr = `L${diag.range.start.line}C${diag.range.start.character}-L${diag.range.end.line}C${diag.range.end.character}`;
        const codeStr = typeof diag.code === 'object' ? JSON.stringify(diag.code) : diag.code;
        return `${rangeStr}|${diag.severity}|${diag.message}|${diag.source || ''}|${codeStr || ''}`;
    }


    /**
     * Formats the list of new problems into a markdown string for the report.
     * @param newProblems Array of new diagnostic objects with their URIs.
     * @returns A formatted markdown string.
     */
    private formatProblemReport(newProblems: { uri: vscode.Uri; diagnostic: vscode.Diagnostic }[]): string {
        // Optional: Limit the number of problems reported
        const maxProblemsToReport = 15;
        const problemsToReport = newProblems.slice(0, maxProblemsToReport);

        let report = `# VSCode Workspace Update\n`;
        report += `The previous action may have resulted in the following new problems being detected:\n\n`;
        report += `# New Problems\n`;

        problemsToReport.forEach(({ uri, diagnostic }) => {
            report += `- ${this.formatDiagnosticForReport(diagnostic, uri)}\n`;
        });

        if (newProblems.length > maxProblemsToReport) {
            report += `- ... (${newProblems.length - maxProblemsToReport} more new problems)\n`;
        }

        // TODO: Optionally add code context around problems (more complex)

        report += `\n(This information is provided for context. Please proceed with the original task, taking these potential new issues into account.)`;
        return report;
    }

    /**
     * Formats a single diagnostic item for the report string.
     * (Similar to WorkspaceContextProvider, but kept separate for potential variations)
     */
    private formatDiagnosticForReport(diagnostic: vscode.Diagnostic, uri: vscode.Uri): string {
        const severityMap: { [key in vscode.DiagnosticSeverity]: string } = {
            [vscode.DiagnosticSeverity.Error]: 'Error',
            [vscode.DiagnosticSeverity.Warning]: 'Warning',
            [vscode.DiagnosticSeverity.Information]: 'Info',
            [vscode.DiagnosticSeverity.Hint]: 'Hint',
        };
        const severity = severityMap[diagnostic.severity];
        const path = uri.fsPath;
        const line = diagnostic.range.start.line + 1;
        const col = diagnostic.range.start.character + 1;
        const source = diagnostic.source ? ` (${diagnostic.source})` : '';

        return `[${severity}] ${path}:${line}:${col} - ${diagnostic.message}${source}`;
    }

}
