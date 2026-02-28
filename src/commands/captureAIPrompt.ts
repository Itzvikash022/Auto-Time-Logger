import * as vscode from 'vscode';
import * as path from 'path';
import { LogEntry, LogSource } from '../types/logEntry';
import { appendLogEntry, hashSnippet, isDuplicateEntry, getISTTimestamp } from '../utils/fsHelper';
import { summarizeCode } from '../utils/geminiHelper';

const SECRET_KEY = 'geminiApiKey';

type PromptCaptureMode = 'manual' | 'clipboard' | 'activeInputCapture';

// ─── Shared helpers (duplicated from logActivity to keep modules self-contained) ─────

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
            if (match?.[1]) {
                return match[1];
            }
        }
    }
    return '';
}

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

// ─── Prompt resolution strategies ───────────────────────────────────────────────────

/**
 * Reads the OS clipboard and returns its text content.
 * Returns undefined if the clipboard is empty.
 */
async function captureFromClipboard(retries = 3): Promise<string | undefined> {
    let text = await vscode.env.clipboard.readText();
    text = text.trim();

    // If empty and we have retries, wait 100ms and try again. 
    // This helps when the OS clipboard buffer is slightly delayed.
    if (!text && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return captureFromClipboard(retries - 1);
    }

    return text || undefined;
}

/**
 * Returns the currently selected text in the active editor.
 * Falls back to clipboard if there is no selection.
 */
async function captureFromActiveInput(editor: vscode.TextEditor | undefined): Promise<string | undefined> {
    if (editor && !editor.selection.isEmpty) {
        const selectedText = editor.document.getText(editor.selection).trim();
        if (selectedText.length > 0) {
            return selectedText;
        }
    }
    // fallback to clipboard if no selection or selection was just whitespace
    return captureFromClipboard();
}

/**
 * Resolves the AI prompt text according to the configured capture mode.
 * In 'manual' mode it opens an input box (same as Log Activity).
 * Returns undefined if the user cancels or nothing is available.
 */
async function resolvePrompt(
    mode: PromptCaptureMode,
    editor: vscode.TextEditor | undefined
): Promise<{ text: string; source: LogSource } | undefined> {
    switch (mode) {
        case 'clipboard': {
            const text = await captureFromClipboard();
            if (!text) {
                vscode.window.showWarningMessage(
                    'Auto Time Logger: Clipboard is empty. Nothing to log.'
                );
                return undefined;
            }
            return { text, source: 'clipboard' };
        }

        case 'activeInputCapture': {
            const text = await captureFromActiveInput(editor);
            if (!text) {
                vscode.window.showWarningMessage(
                    'Auto Time Logger: No text selected and clipboard is empty. Nothing to log.'
                );
                return undefined;
            }
            // Since we updated captureFromActiveInput to ensure we strictly use non-empty trimmed text,
            // we can check if the editor actually had a valid selection.
            const hasSelectionText = editor && !editor.selection.isEmpty && editor.document.getText(editor.selection).trim().length > 0;
            const source: LogSource = hasSelectionText ? 'activeInputCapture' : 'clipboard';

            return { text, source };
        }

        case 'manual':
        default: {
            const text = await vscode.window.showInputBox({
                title: 'Auto Time Logger – Capture AI Prompt',
                prompt: 'Paste or type the AI prompt / task description:',
                placeHolder: 'e.g. Implement a login page with email and Google OAuth',
                ignoreFocusOut: true,
            });
            if (!text) {
                return undefined;
            }
            return { text, source: 'manual' };
        }
    }
}

// ─── Command handler ─────────────────────────────────────────────────────────────────

/**
 * Handler for the "Auto Time Logger: Capture AI Prompt and Log" command.
 *
 * Captures an AI prompt (from clipboard, selection, or manual input depending on
 * `autoTimeLogger.promptCaptureMode`), then logs it alongside file context and a
 * Gemini-generated code summary — identical to Log Activity but without requiring
 * the user to type anything in clipboard/activeInputCapture modes.
 */
export async function captureAIPromptAndLog(context: vscode.ExtensionContext): Promise<void> {
    // 1. Read configured mode
    const mode: PromptCaptureMode =
        vscode.workspace
            .getConfiguration('autoTimeLogger')
            .get<PromptCaptureMode>('promptCaptureMode') ?? 'clipboard';

    const editor = vscode.window.activeTextEditor;
    const timestamp = getISTTimestamp();
    const dateStr = timestamp.slice(0, 10);

    // 2. Resolve log file path
    const logFilePath = resolveLogFilePath(dateStr);
    if (!logFilePath) {
        vscode.window.showErrorMessage(
            'Auto Time Logger: No workspace folder is open. Please open a folder first.'
        );
        return;
    }

    // 3. Resolve the AI prompt
    const resolved = await resolvePrompt(mode, editor);
    if (!resolved) {
        return; // user cancelled or nothing available — messages already shown
    }
    const { text: aiPrompt, source } = resolved;

    // 4. Duplicate detection — same prompt within 2 minutes
    if (isDuplicateEntry(logFilePath, aiPrompt)) {
        vscode.window.showInformationMessage(
            'Auto Time Logger: Duplicate prompt detected within 2 minutes — skipped.'
        );
        return;
    }

    // 5. Gather code context
    let file = '';
    let method = '';
    let codeSnippet = '';

    if (editor) {
        file = editor.document.uri.fsPath;
        method = inferMethodName(editor.document, editor.selection.active);
        codeSnippet = getCodeSnippet(editor);
    }

    const codeContextSnippetHash = hashSnippet(codeSnippet);

    // 6. Get API key
    const apiKey = await getOrPromptApiKey(context);
    if (!apiKey) {
        vscode.window.showErrorMessage(
            'Auto Time Logger: Gemini API key is required to log activities.'
        );
        return;
    }

    // 7. Generate AI summary
    // [USER REMINDER]: AI summary is disabled in this mode.
    // We intentionally skip summarizing the code context during 'Capture AI Prompt' 
    // because the prompt itself is usually sufficient context.
    let summary = '(AI summary unavailable)';
    /* 
    try {
        summary = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Auto Time Logger: Generating AI summary…',
                cancellable: false,
            },
            () => summarizeCode(apiKey, codeSnippet, aiPrompt)
        );
    } catch {
        // summarizeCode is resilient — fall through with default
    }
    */

    // 8. Build and persist entry
    const entry: LogEntry = {
        timestamp,
        description: aiPrompt,   // backward-compat alias
        aiPrompt,
        file,
        method,
        codeContextSnippetHash,
        summary,
        source,
    };

    try {
        appendLogEntry(logFilePath, entry);
    } catch (err) {
        vscode.window.showErrorMessage(
            `Auto Time Logger: Failed to write log entry. ${err}`
        );
        return;
    }

    const modeLabel: Record<LogSource, string> = {
        manual: 'Manual',
        clipboard: 'Clipboard',
        activeInputCapture: 'Selection',
    };

    vscode.window.showInformationMessage(
        `✅ AI prompt logged [${modeLabel[source]}] at ${new Date(timestamp).toLocaleTimeString()}`
    );
}
