# Auto Time Logger: How to Use ⏱️

This extension helps you automatically log your development tasks and uses Google Gemini AI to analyze your code and generate a clean daily timesheet. 

## 1. One-Time Setup
1. Press `F5` in VS Code to run the Extension Development Host.
2. Inside that window, press **`Ctrl+Shift+P`** and run **`Auto Time Logger: Set Gemini API Key`**.
3. Paste your [Google Gemini API Key](https://aistudio.google.com/app/apikey) and hit Enter.

---

## 2. How to Log Tasks

You have two ways to log your work depending on how you write code:

### Method A: Traditional Work (Typing Code Yourself)
When you start a task or finish a bug fix:
1. Make sure the file you are working on is open.
2. Press **`Ctrl+Shift+P`** → **`Auto Time Logger: Log Activity`**.
3. Type a description (e.g. *"Fixing null token bug"*).
4. The extension grabs the time, saves your file/function name, asks Gemini to summarize the code you were looking at, and writes it to your daily `.logs.json` file.

### Method B: AI Agent Work (Copilot, Cursor, etc.)
When you ask an AI to write code for you, you can log that exact prompt instantly:
1. **Copy** the prompt you just sent to your AI (`Ctrl+C`).
2. Press **`Ctrl+Shift+P`** → **`Auto Time Logger: Capture AI Prompt and Log`**.
3. *That's it!* NO input box required. It reads your clipboard, records your code context, gets the Gemini summary, and saves the log.

> **Duplicate Protection:** If you accidentally run Method B twice within 2 minutes with the exact same copied prompt, the extension will ignore the second one!

---

## 3. Generate Your Timesheet

At the end of the day:
1. Press **`Ctrl+Shift+P`** → **`Auto Time Logger: Generate Timesheet`**.
2. Gemini will read all logs from today, merge repeated tasks (e.g., Task A → Task B → Task A), group them into logical sub-1-hour blocks, and calculate the start and end times.
3. A clean `.timesheet.json` file is generated and ready to view!

---

## ⚙️ Settings / Configuration

If you want to customize how the extension acts, go to VS Code Settings (`Ctrl+,`) and search for **`autoTimeLogger`**:
- **Logs Path**: Changes where the JSON files are saved (default is `.project-logs/`).
- **Prompt Capture Mode**: 
  - `clipboard` (Default): Pulls the AI prompt from whatever you `Ctrl+C`'d last.
  - `activeInputCapture`: Uses text you *highlighted* in the editor as the prompt.
---

## 📦 Installing & Sharing without Source Code

If you want to install this extension permanently (so you don't need to press `F5` every time), or if you want to send it to a friend, you can package it into a single file (`.vsix`).

### 1. Build the VSIX file
Open a terminal in the project folder and run:
```powershell
# Install the VS Code packaging tool
npm.cmd install -g @vscode/vsce

# Package it
npx.cmd vsce package
```
*You will now have a file named `auto-time-logger-0.1.0.vsix`.*

### 2. Install the VSIX file
You or your friends can install this file natively:

**Fastest Way (GUI):**
1. Open VS Code.
2. Open the **Extensions** panel (`Ctrl+Shift+X`).
3. Click the `...` menu in the top right of the panel.
4. Click **Install from VSIX...**
5. Select your `.vsix` file.

**Alternative Way (Terminal):**
```powershell
code --install-extension auto-time-logger-0.1.0.vsix
```
