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

  return lan === 'typescriptreact'
}

export function isAddType(str: string): boolean | string {
  if (str === 'true' || str === 'false')
    return 'boolean'

  if (str === '0')
    return 'number'

  return 'any'
}
