import * as vscode from 'vscode';
import * as path from 'path';
import { readLogFile, writeTimesheetFile, fileExists, getISTTimestamp } from '../utils/fsHelper';
import { generateTimesheetFromLogs } from '../utils/geminiHelper';

const SECRET_KEY = 'geminiApiKey';

/**
 * Retrieves the stored Gemini API key, prompting the user if it is missing.
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
 * Resolves the absolute path for a daily log or timesheet file.
 */
function resolveDayFilePath(dateStr: string, suffix: 'logs' | 'timesheet'): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }
    const root = workspaceFolders[0].uri.fsPath;
    const logsPath: string =
        vscode.workspace.getConfiguration('taskLogger').get('logsPath') ?? '.project-logs/';
    return path.join(root, logsPath, `${dateStr}.${suffix}.json`);
}

/**
 * Handler for the "Auto Time Logger: Generate Timesheet" command.
 */
export async function generateTimesheet(context: vscode.ExtensionContext): Promise<void> {
    // 1. Resolve today's log file
    const dateStr = getISTTimestamp().slice(0, 10); // YYYY-MM-DD
    const logFilePath = resolveDayFilePath(dateStr, 'logs');

    if (!logFilePath) {
        vscode.window.showErrorMessage(
            'Auto Time Logger: No workspace folder is open. Please open a folder first.'
        );
        return;
    }

    if (!fileExists(logFilePath)) {
        vscode.window.showErrorMessage(
            `Auto Time Logger: No log file found for today (${dateStr}). ` +
            'Use "Log Activity" to record some tasks first.'
        );
        return;
    }

    // 2. Read log entries
    let entries;
    try {
        entries = readLogFile(logFilePath);
    } catch (err) {
        vscode.window.showErrorMessage(`Auto Time Logger: Could not read log file. ${err}`);
        return;
    }

    if (entries.length === 0) {
        vscode.window.showWarningMessage(
            `Auto Time Logger: The log file for ${dateStr} is empty. Nothing to generate.`
        );
        return;
    }

    // 3. Get API key
    const apiKey = await getOrPromptApiKey(context);
    if (!apiKey) {
        vscode.window.showErrorMessage('Auto Time Logger: Gemini API key is required to generate a timesheet.');
        return;
    }

    // 4. Call Gemini to produce the timesheet
    let timesheet;
    try {
        timesheet = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Auto Time Logger: Generating timesheet for ${dateStr}…`,
                cancellable: false,
            },
            () => generateTimesheetFromLogs(apiKey, entries, dateStr)
        );
    } catch (err) {
        vscode.window.showErrorMessage(
            `Auto Time Logger: Timesheet generation failed. ${err}`
        );
        return;
    }

    // 5. Save the timesheet
    const timesheetPath = resolveDayFilePath(dateStr, 'timesheet');
    if (!timesheetPath) {
        vscode.window.showErrorMessage('Auto Time Logger: Unable to resolve timesheet output path.');
        return;
    }

    try {
        writeTimesheetFile(timesheetPath, timesheet);
    } catch (err) {
        vscode.window.showErrorMessage(`Auto Time Logger: Failed to save timesheet. ${err}`);
        return;
    }

    const action = await vscode.window.showInformationMessage(
        `✅ Timesheet saved: ${path.basename(timesheetPath)}`,
        'Open File'
    );

    if (action === 'Open File') {
        const doc = await vscode.workspace.openTextDocument(timesheetPath);
        vscode.window.showTextDocument(doc);
    }
}
