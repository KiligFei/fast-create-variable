import { nextTick } from 'node:process'
import type { FunctionDeclaration } from '@babel/types'
import { isArrayPattern, isFunctionDeclaration, isJSXElement, isJSXFragment, isVariableDeclaration, traverse } from '@babel/types'
import { createSelect, getLineText, getSelection, isInPosition, jumpToLine, message, updateText } from '@vscode-use/utils'
import { Position } from 'vscode'
import { EXPECTED_ERROR } from './constants'
import { babelParse } from './utils'

export async function createInJsx(activeText: string, title: string, prefixName: string) {
  const ast = babelParse(activeText)
  const { line, character } = getSelection()!
  const pos = new Position(line, character)
  let targetFunction!: FunctionDeclaration
  try {
    traverse(ast, (node) => {
      if (isFunctionDeclaration(node)) {
        traverse(node, (childNode) => {
          if (isJSXElement(childNode) || isJSXFragment(childNode)) {
            if (isInPosition(childNode.loc!, pos)) {
              targetFunction = node
              throw new Error(EXPECTED_ERROR)
            }
          }
        })
      }
    })
  }
  catch (error: any) {
    if (error.message !== EXPECTED_ERROR)
      throw error
  }
  if (!targetFunction)
    return
  const body = targetFunction.body.body.findLast(item => isVariableDeclaration(item)) || targetFunction
  const emptyLen = body === targetFunction
    ? 2
    : (getLineText(body.loc!.start.line - 1).match(/^\s*/)?.[0].length || 2)
  const emptyStr = ' '.repeat(emptyLen)
  const loc = new Position(body === targetFunction
    ? body.loc!.start.line
    : body.loc!.end.line, 0)
  const options = prefixName.startsWith('on')
    ? ['function', 'arrowFunction']
    : [
        'useState',
        'useRef',
        'function',
        'arrowFunction',
      ]
  const isDuplicate = Array.from(targetFunction.body.body).some((item) => {
    if (isVariableDeclaration(item)) {
      const variable = (item as any).declarations[0].id
      return isArrayPattern(variable)
        ? variable.elements.some((v: any) => v.name === title)
        : variable.name === title
    }
    return false
  })
  if (isDuplicate) {
    message.error(`该变量名[${title}]已存在`)
    return
  }
  const v = await createSelect(options, {
    placeHolder: '选择快速创建的变量类型',
    title: '快速创建变量',
  })
  if (!v)
    return
  const msg = `已添加${v}：${title}`
  let insertText = ''
  let jumpLine: [number, number]
  if (v !== 'function' && v !== 'methods') {
    title = title.replace(/\([^\)]*\)/, '')
    title = title.split(' ')[0]
    if (/['"\s\-\[\]<>]/.test(title)) {
      message.error('变量名不符合规范：不能包含空格、中括号、引号等特殊字符')
      return
    }
  }
  else {
    const _title = title.replace(/\([^\)]*\)/, '')
    if (/['"\s\-\+\[\]<>]/.test(_title)) {
      message.error('变量名不符合规范：不能包含空格、中括号、引号等特殊字符')
      return
    }
  }
  switch (v) {
    case 'useState': {
      insertText = `const [${title}, set${title[0].toUpperCase() + title.slice(1)}] = useState('');`
      jumpLine = [loc.line + 1, insertText.length - 1]
      break
    }
    case 'useRef': {
      insertText = `const ${title} = useRef('');`
      jumpLine = [loc.line + 1, insertText.length - 1]
      break
    }
    case 'function': {
      const fnMatch = title.match(/\(([^\)]*)\)/)
      if (fnMatch) {
        let i = 0
        insertText = `function ${title.replace(fnMatch[0], '')}(${fnMatch[1].replace(/'[^']*'/g, () => `p${i++}`)}) {\n${emptyStr}${emptyStr}\n${emptyStr}}`
      }
      else {
        insertText = `function ${title}() {\n${emptyStr}${emptyStr}\n${emptyStr}}`
      }
      jumpLine = [loc.line + 2, insertText.length - 2]
      break
    }
    case 'arrowFunction': {
      const fnMatch = title.match(/\(([^\)]*)\)/)

      if (fnMatch) {
        let i = 0
        insertText = `const ${title.replace(fnMatch[0], '')} = (${fnMatch[1].replace(/'[^']*'/g, () => `p${i++}`)}) => {\n${emptyStr}${emptyStr}\n${emptyStr}}`
      }
      else {
        insertText = `const ${title} = () => {\n${emptyStr}${emptyStr}\n${emptyStr}}`
      }
      jumpLine = [loc.line + 2, insertText.length - 2]
      break
    }
  }
  updateText((edit) => {
    edit.insert(loc, `${emptyStr}${insertText}\n`)
  })
  nextTick(() => {
    message.info(msg)
    jumpToLine(jumpLine)
  })
}
