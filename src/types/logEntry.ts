/**
 * How the log entry was captured.
 * - manual: user typed the description via the Log Activity command
 * - clipboard: prompt was read from the OS clipboard
 * - activeInputCapture: prompt was read from the current editor selection
 */
export type LogSource = 'manual' | 'clipboard' | 'activeInputCapture';

/**
 * Represents a single activity log entry.
 * All fields from v0.1 are preserved.  New fields added in v0.2 are marked [v0.2].
 */
export interface LogEntry {
    /** ISO 8601 timestamp when the activity was logged. */
    timestamp: string;

    /** [v0.1] User-provided description of the task (kept for backward compat). */
    description: string;

    /**
     * [v0.2] The AI prompt or task description that triggered this log.
     * For manual entries this equals `description`.
     * For clipboard/activeInputCapture entries this is the captured prompt text.
     */
    aiPrompt: string;

    /** Absolute path of the active file at the time of logging. */
    file: string;

    /** Inferred function/method name from the cursor position. Empty if not detected. */
    method: string;

    /**
     * [v0.2] SHA-256 hex hash of the raw code snippet used for Gemini summarization.
     * Useful for deduplication and audit; the snippet itself is NOT stored.
     */
    codeContextSnippetHash: string;

    /** AI-generated natural-language summary of the code context. */
    summary: string;

    /**
     * [v0.2] How this entry was captured.
     * Defaults to 'manual' for entries created by the original Log Activity command.
     */
    source: LogSource;
}
