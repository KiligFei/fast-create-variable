/* eslint-disable */
import { parse } from '@typescript-eslint/typescript-estree'

const exclude = ['ImportDeclaration', 'VariableDeclaration']
export function createInJsx(activeText: string, title: string, prefixName: string) {
  const ast = parse(activeText, { jsx: true, loc: true })
  traverse(ast.body)
}

function traverse(children: any[]) {
  for (const child of children) {
    if (exclude.some(child.type))
      continue
  }
}
