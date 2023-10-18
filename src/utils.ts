import type { ParserOptions } from '@babel/parser'
import { parse } from '@babel/parser'

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
