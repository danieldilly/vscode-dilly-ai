// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios, { AxiosResponse } from 'axios';
import * as glob from 'glob';
import * as path from 'path';
import * as fs from 'fs';

interface CommentInfo {
  lineComment?: string;
  blockCommentStart?: string;
  blockCommentEnd?: string;
}

 function getCommentInfo(languageId: string): CommentInfo {
  const extension = vscode.extensions.all.find((ext) =>
    ext.packageJSON.contributes && ext.packageJSON.contributes.languages && ext.packageJSON.contributes.languages.some((lang: any) => lang.id === languageId)
  );

  if (!extension) {
    return {};
  }

  const languageConfigurationGlob = new glob.GlobSync('**/language-configuration.json', { cwd: extension.extensionPath });
  const languageConfigurationFiles = languageConfigurationGlob.found;

  for (const languageConfigurationFile of languageConfigurationFiles) {
    const fullPath = path.join(extension.extensionPath, languageConfigurationFile);
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const languageConfiguration = JSON.parse(fileContent);

    if (languageConfiguration.comments) {
      return languageConfiguration.comments;
    }
  }

  return {};
}

function wrapInComment(text: string, commentInfo: CommentInfo): string {
  if (commentInfo.blockCommentStart && commentInfo.blockCommentEnd) {
    return `${commentInfo.blockCommentStart}\n${text}\n${commentInfo.blockCommentEnd}\n`;
  } else if (commentInfo.lineComment) {
    const lines = text.split('\n');
    const commentedLines = lines.map(line => `${commentInfo.lineComment} ${line}`);
    return commentedLines.join('\n') + '\n';
  } else {
    return `\n${text}\n`;
  }
}


async function askDilly() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText) {
    vscode.window.showErrorMessage('No text selected');
    return;
  }

  const prompt = await vscode.window.showInputBox({
    prompt: 'Enter a text prompt for the API',
    placeHolder: 'Type your prompt here',
  });

  if (!prompt) {
    vscode.window.showErrorMessage('No prompt provided');
    return;
  }

  const config = vscode.workspace.getConfiguration('dilly-ai');
  const apiKey = config.get<string>('apiKey');

  if (!apiKey) {
    vscode.window.showErrorMessage('No API key found in settings');
    return;
  }

  try {
    const response = await callApi(prompt, selectedText, apiKey);
    editor.edit((editBuilder) => {
      const responseText = response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content;
      console.log('Extracted Response Text:', responseText);
      if (responseText) {
        // Old code to replace the text
        // editBuilder.replace(selection, responseText.trim());
        console.log('activeTextEditor is ')
        console.log(vscode.window.activeTextEditor)
        if (vscode.window.activeTextEditor) {
          console.log('activeTextEditor.document.languageId is ')
          console.log(vscode.window.activeTextEditor.document.languageId)
          const commentInfo = getCommentInfo(vscode.window.activeTextEditor.document.languageId);
          console.log('commentInfo is ')
          console.log(commentInfo)
          const commentedResponse = wrapInComment(responseText.trim(), commentInfo);
          console.log('commentedResponse is ')
          console.log(commentedResponse)
          editBuilder.insert(selection.start, commentedResponse);
        } else {
          vscode.window.showErrorMessage('No active editor found');
          editBuilder.insert(selection.start, responseText.trim());
        }
        
      } else {
        vscode.window.showErrorMessage('No response received from the API');
      }
    });
  } catch (error: unknown) {
    let message
    if (error instanceof Error) { message = 'An error occurred while calling the API: ' + error.message }
    else { message = 'An error occurred while calling the API: Unknown error' }

    vscode.window.showErrorMessage(message);
  }
}

async function callApi(prompt: string, selectedText: string, apiKey: string): Promise<AxiosResponse> {
  const apiEndpoint = 'https://api.openai.com/v1/chat/completions';

  const headers = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'Authorization': `Bearer ${apiKey}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'Content-Type': 'application/json'
  };

  // combine prompt and selected text with a newline in between
  const promptWithText = `${prompt}

${selectedText}`;
  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: promptWithText }],
    temperature: 0.7
  };

  try {
    const response = await axios.post(apiEndpoint, requestBody, { headers });
    console.log('API Response:', response.data);
    return response;
  } catch (error: unknown) {
    let message
    if (error instanceof Error) { message = 'Error calling API: ' + error.message }
    else { message = 'Error calling API: Unknown error' }
    throw new Error(message);
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "dilly-ai" is now active!');

  let disposable = vscode.commands.registerCommand('dilly-ai.askDilly', async () => {
    // The code you place here will be executed every time your command is executed
    await askDilly();
  });

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
