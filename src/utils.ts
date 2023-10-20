import type { ParserOptions } from '@babel/parser'
import { parse } from '@babel/parser'
import { getActiveTextEditorLanguageId } from '@vscode-use/utils'

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

export function isTypescriptreact(): boolean {
  const lan = getActiveTextEditorLanguageId()
  if (lan === 'typescriptreact')
    return true
  return false
}

export function isAddType(str: string): boolean | string {
  if (isTypescriptreact()) {
    if (str === 'true' || str === 'false') {
      return 'boolean';
    }
    else if (str === '0') {
      return 'number';
    } else {
      return false
    }
  } else {
    return false
  }
}
