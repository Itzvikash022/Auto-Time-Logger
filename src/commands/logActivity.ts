import * as vscode from 'vscode';
import * as path from 'path';
import { LogEntry } from '../types/logEntry';
import { appendLogEntry, hashSnippet, getISTTimestamp } from '../utils/fsHelper';
import { summarizeCode } from '../utils/geminiHelper';

const SECRET_KEY = 'geminiApiKey';

/**
 * Attempts to retrieve the Gemini API key from SecretStorage.
 * If not found, prompts the user to enter it and stores it securely.
 * Returns undefined if the user cancels.
 */
async function getOrPromptApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    let apiKey = await context.secrets.get(SECRET_KEY);
    if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
            title: 'Auto Time Logger – Gemini API Key',
            prompt: 'Enter your Google Gemini API key. It will be stored securely in VS Code Secret Storage.',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'AIza...',
        });
        if (!apiKey) {
            return undefined;
        }
        await context.secrets.store(SECRET_KEY, apiKey);
        vscode.window.showInformationMessage('Gemini API key saved securely.');
    }
    return apiKey;
}

/**
 * Resolves the absolute path of the daily log file.
 * e.g. <workspaceRoot>/.project-logs/2026-02-28.logs.json
 */
function resolveLogFilePath(dateStr: string): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }
    const root = workspaceFolders[0].uri.fsPath;
    const logsPath: string =
        vscode.workspace.getConfiguration('taskLogger').get('logsPath') ?? '.project-logs/';
    return path.join(root, logsPath, `${dateStr}.logs.json`);
}

/**
 * Heuristically infers the nearest enclosing function/method name
 * by scanning upward from the cursor position for common patterns.
 */
function inferMethodName(document: vscode.TextDocument, position: vscode.Position): string {
    const patterns = [
        /(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
        /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/,
        /(?:public|private|protected|static|async|\s)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/,
    ];

    for (let line = position.line; line >= 0; line--) {
        const text = document.lineAt(line).text;
        for (const pattern of patterns) {
            const match = pattern.exec(text);
            if (match && match[1]) {
                return match[1];
            }
        }
    }
    return '';
}

/**
 * Retrieves a code snippet from the active editor.
 * If there is a selection, returns the selected text.
 * Otherwise returns up to 2 000 characters around the cursor.
 */
function getCodeSnippet(editor: vscode.TextEditor): string {
    const selection = editor.selection;
    if (!selection.isEmpty) {
        return editor.document.getText(selection);
    }

    const fullText = editor.document.getText();
    const offset = editor.document.offsetAt(editor.selection.active);
    const start = Math.max(0, offset - 1000);
    const end = Math.min(fullText.length, offset + 1000);
    return fullText.slice(start, end);
}

/**
 * Handler for the "Auto Time Logger: Log Activity" command.
 * This is the original manual logging flow — unchanged from v0.1.
 */
export async function logActivity(context: vscode.ExtensionContext): Promise<void> {
    // 1. Prompt user for task description
    const description = await vscode.window.showInputBox({
        title: 'Auto Time Logger – Log Activity',
        prompt: 'Describe the task you are working on:',
        placeHolder: 'e.g. Fixed null-pointer bug in UserService.authenticate()',
        ignoreFocusOut: true,
    });

    if (!description) {
        return;
    }

    // 2. Gather context from active editor
    const editor = vscode.window.activeTextEditor;
    const timestamp = getISTTimestamp();
    let file = '';
    let method = '';
    let codeSnippet = '';

    if (editor) {
        file = editor.document.uri.fsPath;
        method = inferMethodName(editor.document, editor.selection.active);
        codeSnippet = getCodeSnippet(editor);
    } else {
        vscode.window.showInformationMessage(
            'Auto Time Logger: No active editor — logging without code context.'
        );
    }

    const codeContextSnippetHash = hashSnippet(codeSnippet);

    // 3. Get API key
    const apiKey = await getOrPromptApiKey(context);
    if (!apiKey) {
        vscode.window.showErrorMessage('Auto Time Logger: Gemini API key is required to log activities.');
        return;
    }

    // 4. Generate AI summary
    let summary = '(AI summary unavailable)';
    try {
        summary = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Auto Time Logger: Generating AI summary…',
                cancellable: false,
            },
            () => summarizeCode(apiKey, codeSnippet, description)
        );
    } catch {
        // summarizeCode is already resilient; this is a safety net
    }

    // 5. Resolve log file path
    const dateStr = timestamp.slice(0, 10);
    const logFilePath = resolveLogFilePath(dateStr);
    if (!logFilePath) {
        vscode.window.showErrorMessage(
            'Auto Time Logger: No workspace folder is open. Please open a folder first.'
        );
        return;
    }

    // 6. Build and persist log entry (v0.2 schema with backward-compat fields)
    const entry: LogEntry = {
        timestamp,
        description,           // v0.1 backward-compat alias
        aiPrompt: description, // v0.2 canonical field
        file,
        method,
        codeContextSnippetHash,
        summary,
        source: 'manual',
    };

    try {
        appendLogEntry(logFilePath, entry);
    } catch (err) {
        vscode.window.showErrorMessage(`Auto Time Logger: Failed to write log entry. ${err}`);
        return;
    }

    vscode.window.showInformationMessage(
        `✅ Activity logged at ${new Date(timestamp).toLocaleTimeString()}`
    );
}
