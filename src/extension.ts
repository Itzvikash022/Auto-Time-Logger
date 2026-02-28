import * as vscode from 'vscode';
import { logActivity } from './commands/logActivity';
import { generateTimesheet } from './commands/generateTimesheet';
import { captureAIPromptAndLog } from './commands/captureAIPrompt';

const SECRET_KEY = 'geminiApiKey';

/**
 * Extension activation entry point.
 * Registers all commands contributed by Auto Time Logger.
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('[AutoTimeLogger] Extension activated.');

    // Command: Log Activity (original manual flow — unchanged)
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.logActivity', () =>
            logActivity(context)
        )
    );

    // Command: Generate Timesheet (unchanged)
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.generateTimesheet', () =>
            generateTimesheet(context)
        )
    );

    // Command: Set / Update Gemini API Key
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.setGeminiApiKey', async () => {
            const newKey = await vscode.window.showInputBox({
                title: 'Auto Time Logger – Set Gemini API Key',
                prompt: 'Enter (or replace) your Google Gemini API key:',
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'AIza...',
            });
            if (newKey) {
                await context.secrets.store(SECRET_KEY, newKey);
                vscode.window.showInformationMessage('Gemini API key updated successfully.');
            }
        })
    );

    // Command: Capture AI Prompt and Log (new in v0.2)
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.captureAIPromptAndLog', () =>
            captureAIPromptAndLog(context)
        )
    );
}

/**
 * Extension deactivation hook (no-op).
 */
export function deactivate(): void {
    // Nothing to clean up.
}
