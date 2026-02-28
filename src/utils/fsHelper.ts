import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LogEntry } from '../types/logEntry';
import { Timesheet } from '../types/timesheet';

/**
 * Ensures a directory exists, creating it (and any parent directories) if needed.
 */
export function ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Reads a log file and returns its entries as an array.
 * Returns an empty array if the file does not exist or is empty.
 */
export function readLogFile(filePath: string): LogEntry[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf-8').trim();
        if (!raw) {
            return [];
        }
        return JSON.parse(raw) as LogEntry[];
    } catch (err) {
        throw new Error(`Failed to parse log file "${filePath}": ${err}`);
    }
}

/**
 * Writes an array of log entries to a file as formatted JSON.
 */
export function writeLogFile(filePath: string, entries: LogEntry[]): void {
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Appends a single log entry to the daily log file.
 * Creates the file (and its parent directory) if it does not exist.
 */
export function appendLogEntry(filePath: string, entry: LogEntry): void {
    ensureDir(path.dirname(filePath));
    const entries = readLogFile(filePath);
    entries.push(entry);
    writeLogFile(filePath, entries);
}

/**
 * Writes a Timesheet object to a file as formatted JSON.
 * Creates the parent directory if needed.
 */
export function writeTimesheetFile(filePath: string, timesheet: Timesheet): void {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(timesheet, null, 2), 'utf-8');
}

/**
 * Returns true if the given file exists.
 */
export function fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
}

/**
 * Computes a SHA-256 hex hash of the given text.
 * Used to store a fingerprint of the code snippet without storing the snippet itself.
 */
export function hashSnippet(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

/**
 * Duplicate detection: returns true if the last log entry in the file has
 * the same aiPrompt AND was logged less than 2 minutes ago.
 *
 * This prevents accidental double-logs when a user triggers the command twice
 * quickly with the same clipboard content.
 */
export function isDuplicateEntry(filePath: string, aiPrompt: string): boolean {
    const entries = readLogFile(filePath);
    if (entries.length === 0) {
        return false;
    }

    const last = entries[entries.length - 1];
    const lastPrompt = last.aiPrompt ?? last.description ?? '';
    if (lastPrompt !== aiPrompt) {
        return false;
    }

    const lastTime = new Date(last.timestamp).getTime();
    const now = Date.now();
    const TWO_MINUTES_MS = 2 * 60 * 1000;
    return now - lastTime < TWO_MINUTES_MS;
}
