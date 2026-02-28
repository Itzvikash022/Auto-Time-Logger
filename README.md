# Auto Time Logger ⏱️

A VS Code extension designed to seamlessly log your development tasks and auto-generate daily timesheets, powered entirely by **Google Gemini AI**.

Whether you write code manually or use AI coding agents (like Copilot or Cursor), this extension captures your work, associates it with the active file and function, fetches an AI-generated code summary, and builds an intelligent, categorized timesheet at the end of the day.

---

## 🔥 Features

- **Dual Logging Modes**: Support for both traditional manual task entry and one-click AI prompt capture.
- **Smart Code Context**: Automatically detects the file you are editing and heuristically infers the enclosing function or method name.
- **Gemini-Powered Summaries**: Sends a snippet of your active editor (up to 2,000 characters) to Gemini to generate a brief, natural-language explanation of what your code actually does.
- **Automated Timesheet Generation**: At the end of the day, Gemini analyzes your raw logs, merges repeated tasks (e.g. going back and forth on a bug), groups them into categories, and calculates sub-hour timeblocks.
- **Duplicate Protection**: Accidentally logged the exact same AI prompt twice in a row? The extension ignores duplicate clipboard entries within a 2-minute window.
- **Secure Key Storage**: Your Google Gemini API key is never saved in plaintext files or workspace settings. It uses VS Code's native `SecretStorage` (which hooks into macOS Keychain, Windows Credential Manager, etc.).

---

## 🛠 Commands

| Command | Description |
|---|---|
| `Auto Time Logger: Log Activity` | The classic manual flow. Prompts you with an input box to describe your task. Captures time, file, method, and Gemini code summary. |
| `Auto Time Logger: Capture AI Prompt and Log` | The AI Agent flow. Skips the input box. Reads your clipboard (or highlighted text) assuming it's the prompt you just sent to your AI assistant. Logs it automatically. |
| `Auto Time Logger: Generate Timesheet` | Reads today's `.logs.json` file, asks Gemini to group and categorize the entries, and saves a beautiful `.timesheet.json`. |
| `Auto Time Logger: Set Gemini API Key` | Prompts you to enter your Gemini API key (starts with `AIza...`) and saves it securely to OS storage. |

---

## ⚙️ Configuration Settings

Configure these in your VS Code settings (`Ctrl+,` → search `taskLogger` or `autoTimeLogger`):

| Setting | Default | Description |
|---|---|---|
| `taskLogger.logsPath` | `.project-logs/` | Relative folder path (from workspace root) where the JSON files are saved. Created automatically if missing. |
| `autoTimeLogger.promptCaptureMode` | `clipboard` | Controls how the *Capture AI Prompt* command sources its text. <br><br>`clipboard`: Uses last copied text silently.<br>`activeInputCapture`: Uses selected text in the editor, falling back to clipboard.<br>`manual`: Shows the manual text input box instead. |

---

## 📁 Data Schema

Files are saved daily by default in `.project-logs/YYYY-MM-DD.logs.json`. 

### The Log File (`YYYY-MM-DD.logs.json`)
```json
[
  {
    "timestamp": "2026-02-28T16:30:00.000Z",
    "description": "Fixing database connection string",
    "aiPrompt": "Fixing database connection string",
    "file": "d:\\MyProject\\src\\db\\connect.ts",
    "method": "initDB",
    "codeContextSnippetHash": "a1b2c3d4e5f6...",
    "summary": "This function initializes the PostgreSQL connection pool using environment variables.",
    "source": "clipboard"
  }
]
```

### The Timesheet File (`YYYY-MM-DD.timesheet.json`)
```json
{
  "date": "2026-02-28",
  "tasks": [
    {
      "category": "Database Architecture",
      "entries": [
        { "task": "Configure connection pool", "start": "09:00", "end": "09:45" },
        { "task": "Add connection retry logic", "start": "09:45", "end": "10:15" }
      ]
    },
    {
      "category": "Code Review",
      "entries": [
        { "task": "Review PR #42", "start": "10:30", "end": "11:00" }
      ]
    }
  ]
}
```

---

## ⚡ Quick Start / Setup

1. **Get an API Key**: Obtain a free key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. **Install / Launch**: Open this folder in VS Code and press `F5` to open the Extension Development Host.
3. **Set Key**: In that host window, run `Auto Time Logger: Set Gemini API Key` and paste your key.
4. **Log Work**: Open any code file, copy a prompt or type a description, and run one of the Log commands.
5. **Get Timesheet**: At the end of the day, run `Auto Time Logger: Generate Timesheet`.

*(For a simpler, step-by-step user guide, see the `HOW_TO_USE.md` file).*

---

## 📦 Packaging & Installation (For Others)

You can package this extension into a single `.vsix` file to share with others. They can install it in their own VS Code without needing the source code.

### 1. Package the Extension
Run these commands in your project folder (using `.cmd` avoids PowerShell execution policy errors):

```powershell
# Install the VS Code Extension Manager globally
npm.cmd install -g @vscode/vsce

# Bundle the extension (this automatically runs tsc)
npx.cmd vsce package
```
This generates a file like `auto-time-logger-0.1.0.vsix`.

### 2. Install the Extension

Send the `.vsix` file to anyone. They can install it two ways:

**Method A: Visual Interface (GUI)**
1. Open VS Code.
2. Go to the **Extensions** view (`Ctrl+Shift+X`).
3. Click the `...` (Views and More Actions) menu in the top right.
4. Select **Install from VSIX...**
5. Locate and select the `auto-time-logger-0.1.0.vsix` file.

**Method B: Command Line (CLI)**
```powershell
code --install-extension auto-time-logger-0.1.0.vsix
```

---

## 🔧 Development

Requirements: Node.js (v18+)

```powershell
# Install dependencies
npm.cmd install

# Compile TypeScript
npm.cmd run compile
```

Press **F5** in VS Code to test live changes in the Extension Development Host.

---

## License

MIT
