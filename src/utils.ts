import type { ParserOptions } from '@babel/parser';
import { parse } from '@babel/parser';
import * as vscode from 'vscode';

export function babelParse(code: string) {
  const finalOptions: ParserOptions = {
    sourceType: 'module',
    plugins: ['jsx'],
    errorRecovery: true,
  }
  try {
    return parse(code, finalOptions)
  }
  catch (err) {
    return parse('', finalOptions)
  }
}

export function isTypescript(): boolean {
  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor) {
    const languageId = activeTextEditor.document.languageId;
    return languageId === 'typescript' || languageId === 'typescriptreact';
  }
  return false;
}

export function logType(str: string) {
  const trimmedStr = str.trim();
  if (trimmedStr === 'true' || trimmedStr === 'false') {
    return 'boolean';
  }
  if (!isNaN(Number(trimmedStr))) {
    return 'number';
  }
  return typeof trimmedStr;
}
