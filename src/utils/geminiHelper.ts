import { GoogleGenerativeAI } from '@google/generative-ai';
import { LogEntry } from '../types/logEntry';
import { Timesheet } from '../types/timesheet';
const FALLBACK_MODELS = [
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash'
];

/**
 * Initializes and returns a Gemini GenerativeModel instance for a specific model.
 */
function getModel(apiKey: string, modelName: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Attempts to generate content using a primary model, falling back to alternates on failure.
 */
async function generateContentWithFallback(apiKey: string, prompt: string, models: string[]): Promise<string> {
    let lastError: any;

    for (const modelName of models) {
        try {
            const model = getModel(apiKey, modelName);
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (err: any) {
            console.warn(`[AutoTimeLogger] Model ${modelName} failed: ${err.message || err}. Trying next fallback...`);
            lastError = err;
            // Only retry on typical network/demand failures (503s/500s/rate limits). 
            // If it's a hard auth failure (403), we could theoretically bail early, 
            // but trying the next model is safer for broad resilience.
        }
    }

    throw lastError || new Error('All fallback models failed.');
}

/**
 * Calls Gemini to produce a brief natural-language summary of the given code snippet.
 * Returns an empty string on failure rather than throwing, so log saves still succeed.
 */
export async function summarizeCode(apiKey: string, codeSnippet: string, taskDescription?: string): Promise<string> {
    if (!codeSnippet.trim()) {
        return '(no code context available)';
    }

    const contextInstruction = taskDescription
        ? `The user is currently executing the following task: "${taskDescription}". Summarize how this code snippet relates to or facilitates this task in 1-2 concise sentences. If the code seems unrelated to the task, just summarize what the code does.`
        : `Summarize the following code snippet in 1-2 concise sentences, focusing on what it does and any notable patterns.`;

    const prompt = `You are a developer assistant. ${contextInstruction} Do not include code in your reply.

\`\`\`
${codeSnippet}
\`\`\``;

    try {
        return await generateContentWithFallback(apiKey, prompt, FALLBACK_MODELS);
    } catch (err) {
        console.error('[AutoTimeLogger] summarizeCode error:', err);
        return '(AI summary unavailable)';
    }
}

/**
 * Calls Gemini to group today's log entries into a structured timesheet.
 * The response is expected as a JSON object matching the Timesheet schema.
 */
export async function generateTimesheetFromLogs(
    apiKey: string,
    entries: LogEntry[],
    dateStr: string
): Promise<Timesheet> {
    const logsText = JSON.stringify(entries, null, 2);

    const prompt = `You are a project manager assistant. Given the following development activity log entries for ${dateStr}, produce a structured daily timesheet in strict JSON format.

Rules:
1. Group entries into continuous task blocks. Each block should be under 1 hour.
2. Merge repeated tasks (e.g. Task A → Task B → Task A merges into a single Task A block).
3. Assign a descriptive category to each group (e.g. "Coding: Auth Feature", "Debugging", "Code Review").
4. Infer start/end times from the timestamps of the log entries.
5. Output ONLY valid JSON matching this exact schema — no markdown, no explanation:

{
  "date": "YYYY-MM-DD",
  "tasks": [
    {
      "category": "string",
      "entries": [
        { "task": "string", "start": "HH:MM", "end": "HH:MM" }
      ]
    }
  ]
}

Log entries:
${logsText}`;

    try {
        let text = await generateContentWithFallback(apiKey, prompt, FALLBACK_MODELS);

        // Strip potential markdown fences if Gemini wraps the JSON
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        const parsed = JSON.parse(text) as Timesheet;
        return parsed;
    } catch (err) {
        console.error('[AutoTimeLogger] generateTimesheetFromLogs error:', err);
        throw new Error(
            `Gemini failed to generate a valid timesheet. Details: ${err}`
        );
    }
}
