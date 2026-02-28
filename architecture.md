# Overview

This VS Code extension provides a **task-logging** system driven entirely by command palette commands. The user can invoke a **"Log Activity"** command, enter a task description, and the extension automatically captures metadata: the current timestamp, active file path, and (optionally) the current method or code context. It then calls the Google Gemini AI API to generate a short natural-language summary of the relevant code snippet or recent changes. Each log entry (description, time, file, method, summary) is stored in a date-based JSON file (by default under .project-logs/). A separate command **"Generate Time Sheet"** reads that day's log file, sends it to Gemini with a structured prompt, and receives back categorized task blocks with sub-hour time ranges (merging repeated tasks like A→B→A). The result is saved as a new JSON timesheet file (e.g. 2026-02-28.timesheet.json). All configuration (Gemini API key, log folder path) is externalized: the key is kept in VS Code's secure SecretStorage[\[1\]](https://code.visualstudio.com/api/advanced-topics/remote-extensions#:~:text=If%20your%20extension%20needs%20to,retrieve%20the%20same%20secret%20values) and the folder path is user-configurable via package.json settings. There is **no custom UI**; all interaction is via commands and prompts (using window.showInputBox[\[2\]](https://code.visualstudio.com/api/references/vscode-api#:~:text=showInputBox%28options%3F%3A%20InputBoxOptions%2C%20token%3F%3A%20CancellationToken%29%3A%20Thenable,undefined), etc.).

# Folder and File Structure

The extension follows the standard VS Code TypeScript layout. For example:  

my-task-logger/  
├── package.json # Extension manifest with commands & configuration  
├── tsconfig.json # TypeScript config  
└── src/  
├── extension.ts # Activation logic (register commands)  
├── commands/  
│ ├── logActivity.ts # Command handler for logging tasks  
│ └── generateTimesheet.ts # Command handler for timesheet generation  
├── utils/  
│ ├── fsHelper.ts # Helpers for file read/write (using Node fs or workspace.fs)  
│ └── geminiHelper.ts # Wrapper for calling Gemini API  
└── types/  
├── logEntry.ts # Type definition for a log record  
└── timesheet.ts # Type definition for a timesheet entry

\- **package.json** defines the commands (e.g. "extension.logActivity", "extension.generateTimesheet" under "contributes.commands") and configuration properties (geminiApiKey, logsFolder). The commands are bound to the command palette as per VS Code API guidelines[\[3\]](https://code.visualstudio.com/api/references/vscode-api#:~:text=Commands%20can%20be%20added%20to,Those%20are).  
\- **extension.ts** is the entry point: it calls vscode.commands.registerCommand to bind each command ID to its handler function[\[3\]](https://code.visualstudio.com/api/references/vscode-api#:~:text=Commands%20can%20be%20added%20to,Those%20are).  
\- Command modules implement the workflows described below. Utility modules handle file I/O and API calls (e.g. using Node's fs module[\[4\]](https://stackoverflow.com/questions/38782181/read-and-write-file-using-vs-code-extension#:~:text=Since%20the%20extension%20runs%20in,npm%20in%20the%20usual%20way) or vscode.workspace.fs[\[5\]](https://stackoverflow.com/questions/53073926/how-do-i-create-a-file-for-a-visual-studio-code-extension#:~:text=You%20can%20achieve%20the%20same,workspace.fs.writeFile%5D%2C%20with%20much%20lesser%20code) for storage, and the @google/generative-ai SDK for Gemini). Type definitions ensure that JSON read/write uses a clear schema.

# Extension Commands and Workflows

- **Log Activity Command** (extension.logActivity): When invoked (via the Command Palette), it first prompts the user for a task description using window.showInputBox[\[2\]](https://code.visualstudio.com/api/references/vscode-api#:~:text=showInputBox%28options%3F%3A%20InputBoxOptions%2C%20token%3F%3A%20CancellationToken%29%3A%20Thenable,undefined). It automatically records the current timestamp (new Date().toISOString()), and captures the active file URI via vscode.window.activeTextEditor.document.uri and (optionally) the current function/method name (for example by analyzing the AST or scanning for nearest function signature). It then retrieves the current code snippet or diff: e.g. by calling vscode.workspace.openTextDocument on the active editor and getting its text[\[6\]](https://stackoverflow.com/questions/38782181/read-and-write-file-using-vs-code-extension#:~:text=If%20you%20want%20to%20read,the%20following%20API%20workspace%20function), possibly limited to the method or recent edits. Next, the extension calls Gemini (via a helper module) with a prompt like _"Summarize the following code changes:"_ along with the snippet. The Gemini response text is taken as the **AI-generated summary**. Finally, the extension writes a log entry JSON object (with fields timestamp, description, file, method, summary) to the day's log file under the logs folder. If the file (e.g. 2026-02-28.logs.json) doesn't exist, it is created; if it exists, the new entry is appended. File writes can use Node's fs.appendFileSync or workspace.fs (read+concat+write)[\[7\]](https://github.com/microsoft/vscode/issues/107360#:~:text=Currently%20,the%20file%20instead%20of%20overwrite)[\[4\]](https://stackoverflow.com/questions/38782181/read-and-write-file-using-vs-code-extension#:~:text=Since%20the%20extension%20runs%20in,npm%20in%20the%20usual%20way).
- **Generate Time Sheet Command** (extension.generateTimesheet): When run, this command locates today's log JSON (e.g. by date). It reads the structured log entries into memory (using fs.readFileSync or workspace.fs.readFile)[\[4\]](https://stackoverflow.com/questions/38782181/read-and-write-file-using-vs-code-extension#:~:text=Since%20the%20extension%20runs%20in,npm%20in%20the%20usual%20way), then builds a prompt: "Given the following log entries, group them into continuous task blocks with time durations under 1 hour. Merge repeated tasks (e.g. Task A ➔ Task B ➔ Task A) and categorize each block." This list of logs is sent to Gemini via the SDK. The Gemini response (expected as JSON or structured text) should contain task categories, start/end times or durations for each block. The extension parses this response and writes it to a new JSON file (e.g. 2026-02-28.timesheet.json) under the logs folder, using a clean schema (see below). On success, it notifies the user (e.g. with window.showInformationMessage). Both commands handle errors gracefully (checking for missing log files, catching API failures, etc.).

# Data Schema

**Daily Log File (.project-logs/2026-02-28.logs.json):** The file is a JSON array or object with an array of entries. Each entry might look like:  

{  
"timestamp": "2026-02-28T15:42:10.123Z",  
"description": "Fixed login bug in UserService",  
"file": "src/services/userService.ts",  
"method": "authenticateUser",  
"summary": "Refactored authenticateUser to handle null token and added logging."  
}

All entries for the day are stored in a readable array. If needed, the JSON file can also include a top-level date field or header comment, but a clean array is simplest. New entries are appended (e.g. using fs.appendFileSync or reading-and-writing[\[7\]](https://github.com/microsoft/vscode/issues/107360#:~:text=Currently%20,the%20file%20instead%20of%20overwrite)) so that the file remains valid JSON.

**Time Sheet File (2026-02-28.timesheet.json):** This contains the AI-generated task breakdown. For example:  

{  
"date": "2026-02-28",  
"tasks": \[  
{  
"category": "Coding: Login Feature",  
"entries": \[  
{"task": "Fix login bug", "start": "09:00", "end": "09:30"},  
{"task": "Implement password reset", "start": "09:30", "end": "10:15"}  
\]  
},  
{  
"category": "Code Review",  
"entries": \[  
{"task": "Review PR #42", "start": "10:15", "end": "10:45"}  
\]  
}  
\]  
}

Each **category** is a group of related tasks. Each entry has a brief task name and a start/end or duration (Gemini is instructed to keep blocks <1 hr). The structure is easily JSON-stringified.

# Gemini Integration

The extension uses the Google Gemini API for two purposes: summarizing code and generating timesheets. We recommend using Google's official Node SDK (@google/generative-ai) on the backend (Node.js) for convenience[\[8\]](https://github.com/mohitejaikumar/generative-ai-js#:~:text=2). For example:  

import { GoogleGenerativeAI } from "@google/generative-ai";  
const genAI = new GoogleGenerativeAI(apiKey);  
const model = genAI.getGenerativeModel({model: "gemini-1.5-turbo"});  
const response = await model.generateText({  
prompt: "Summarize the following code change: ...",  
temperature: 0.2  
});  
const summary = response.text;

The **Gemini API key** is retrieved securely (see Configuration below). (Note: do **not** hard-code the API key in client-side code, as this can expose it[\[9\]](https://github.com/mohitejaikumar/generative-ai-js#:~:text=,fetch%20it%20remotely%20at%20runtime).) For the timesheet command, the extension constructs a single prompt that includes all log entries for the day, with instructions to group and time them. It then parses Gemini's response (which might return JSON if prompted correctly) and saves it. The code should handle rate limits and errors (retry logic or user feedback).

# Configuration and Environment

- **Gemini API Key:** The user's API key is _not_ stored in plaintext. On first use, the extension can prompt the user to enter their API key (via showInputBox) and then store it using VS Code's SecretStorage API[\[1\]](https://code.visualstudio.com/api/advanced-topics/remote-extensions#:~:text=If%20your%20extension%20needs%20to,retrieve%20the%20same%20secret%20values). This ensures it's encrypted by the OS (Keychain, Credential Manager, etc.). The key is retrieved at runtime with context.secrets.get('geminiApiKey'). (As noted in the docs, using secure storage is recommended over workspace/globalState[\[10\]](https://code.visualstudio.com/api/advanced-topics/remote-extensions#:~:text=,APIs%20store%20data%20in%20plaintext).)
- **Logs Folder Path:** The default folder for logs is .project-logs/ in the workspace root. This path is configurable: add a configuration setting (e.g. taskLogger.logsPath) in package.json under contributes.configuration, with default value .project-logs/. At runtime use workspace.getConfiguration('taskLogger').get('logsPath') to allow the user to override it. The extension should create the folder if it doesn't exist (using fs.mkdirSync or workspace.fs.createDirectory).
- **Environment:** The extension uses Node.js APIs (which are available in VS Code extensions). For filesystem, one can use either the built-in fs module[\[4\]](https://stackoverflow.com/questions/38782181/read-and-write-file-using-vs-code-extension#:~:text=Since%20the%20extension%20runs%20in,npm%20in%20the%20usual%20way) or vscode.workspace.fs with a URI[\[5\]](https://stackoverflow.com/questions/53073926/how-do-i-create-a-file-for-a-visual-studio-code-extension#:~:text=You%20can%20achieve%20the%20same,workspace.fs.writeFile%5D%2C%20with%20much%20lesser%20code). The latter requires careful read+concat for appends[\[7\]](https://github.com/microsoft/vscode/issues/107360#:~:text=Currently%20,the%20file%20instead%20of%20overwrite). The code should check for an open workspace (vscode.workspace.workspaceFolders) and handle the case of no workspace open.

# Future Enhancements

Possible improvements include **automatic logging** on certain events. For example, the extension could listen to workspace.onDidSaveTextDocument and automatically log a task when a file is saved. Or it could detect window.onDidChangeActiveTextEditor to note when the user switches tasks (prompting to resume). These features require careful design to avoid unwanted logs and should respect user privacy (no heavy background processing). Other enhancements might include tagging entries (e.g. with project or context tags) or a richer timesheet format (PDF export, etc.), but these go beyond the core command-line workflow.

[\[1\]](https://code.visualstudio.com/api/advanced-topics/remote-extensions#:~:text=If%20your%20extension%20needs%20to,retrieve%20the%20same%20secret%20values) [\[10\]](https://code.visualstudio.com/api/advanced-topics/remote-extensions#:~:text=,APIs%20store%20data%20in%20plaintext) [\[11\]](https://code.visualstudio.com/api/advanced-topics/remote-extensions#:~:text=import%20,vscode) Supporting Remote Development and GitHub Codespaces | Visual Studio Code Extension API

<https://code.visualstudio.com/api/advanced-topics/remote-extensions>

[\[2\]](https://code.visualstudio.com/api/references/vscode-api#:~:text=showInputBox%28options%3F%3A%20InputBoxOptions%2C%20token%3F%3A%20CancellationToken%29%3A%20Thenable,undefined) [\[3\]](https://code.visualstudio.com/api/references/vscode-api#:~:text=Commands%20can%20be%20added%20to,Those%20are) VS Code API | Visual Studio Code Extension API

<https://code.visualstudio.com/api/references/vscode-api>

[\[4\]](https://stackoverflow.com/questions/38782181/read-and-write-file-using-vs-code-extension#:~:text=Since%20the%20extension%20runs%20in,npm%20in%20the%20usual%20way) [\[6\]](https://stackoverflow.com/questions/38782181/read-and-write-file-using-vs-code-extension#:~:text=If%20you%20want%20to%20read,the%20following%20API%20workspace%20function) json - Read and Write file using vs code extension - Stack Overflow

<https://stackoverflow.com/questions/38782181/read-and-write-file-using-vs-code-extension>

[\[5\]](https://stackoverflow.com/questions/53073926/how-do-i-create-a-file-for-a-visual-studio-code-extension#:~:text=You%20can%20achieve%20the%20same,workspace.fs.writeFile%5D%2C%20with%20much%20lesser%20code) How do I create a file for a Visual Studio Code Extension? - Stack Overflow

<https://stackoverflow.com/questions/53073926/how-do-i-create-a-file-for-a-visual-studio-code-extension>

[\[7\]](https://github.com/microsoft/vscode/issues/107360#:~:text=Currently%20,the%20file%20instead%20of%20overwrite) append option for vscode.workspace.fs.writeFile · Issue #107360 · microsoft/vscode · GitHub

<https://github.com/microsoft/vscode/issues/107360>

[\[8\]](https://github.com/mohitejaikumar/generative-ai-js#:~:text=2) [\[9\]](https://github.com/mohitejaikumar/generative-ai-js#:~:text=,fetch%20it%20remotely%20at%20runtime) GitHub - mohitejaikumar/generative-ai-js: The official Node.js / Typescript library for the Google Gemini API

<https://github.com/mohitejaikumar/generative-ai-js>