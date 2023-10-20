import { nextTick } from 'node:process'
import type { ArrowFunctionExpression, ClassMethod, FunctionDeclaration, VariableDeclaration } from '@babel/types'
import { isArrayPattern, isArrowFunctionExpression, isClassMethod, isFunctionDeclaration, isJSXElement, isJSXFragment, isVariableDeclaration, traverse } from '@babel/types'
import { createSelect, getLineText, getSelection, isInPosition, jumpToLine, message, updateText } from '@vscode-use/utils'
import { Position } from 'vscode'
import { EXPECTED_ERROR } from './constants'
import { babelParse, isAddType, isTypescriptreact } from './utils'

export async function createInJsx(activeText: string, title: string, prefixName: string) {
  const ast = babelParse(activeText)
  const { line, character } = getSelection()!
  const pos = new Position(line, character)
  let targetFunction!: FunctionDeclaration | ArrowFunctionExpression | ClassMethod
  let targetElement: VariableDeclaration
  try {
    traverse(ast, (node) => {
      if (isFunctionDeclaration(node) || isArrowFunctionExpression(node) || isClassMethod(node)) {
        traverse(node, (childNode) => {
          if (isVariableDeclaration(childNode)) {
            const variableNode = childNode
            traverse(childNode, (jsxNode) => {
              if (isJSXElement(jsxNode) || isJSXFragment(jsxNode)) {
                if (isInPosition(jsxNode.loc!, pos)) {
                  targetFunction = node
                  targetElement = variableNode
                  throw new Error(EXPECTED_ERROR)
                }
              }
            })
          }
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
  const body = (targetFunction.body as any)?.body?.findLast((item: any) => isVariableDeclaration(item) && item !== targetElement) || targetFunction
  const emptyLen = body === targetFunction
    ? (getLineText(targetFunction.loc!.start.line - 1).match(/^\s*/)?.[0].length! + 2)
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
  const isDuplicate = Array.from((targetFunction.body as any).body).some((item: any) => {
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
  const isTypescript = isTypescriptreact()
  switch (v) {
    case 'useState': {
      const v = await createSelect([
        '[]',
        '{}',
        '\'\'',
        'null',
        'undefined',
        '0',
        'true',
        'false',
      ], {
        placeHolder: '选择数据类型',
      })
      if (!v)
        return
      
      if (isTypescript)
        insertText = `const [${title}, set${title[0].toUpperCase() + title.slice(1)}] = useState<${isAddType(v)}>(${v});`
      else
        insertText = `const [${title}, set${title[0].toUpperCase() + title.slice(1)}] = useState(${v});`

      jumpLine = [loc.line + 1, insertText.length - 1]
      break
    }
    case 'useRef': {
      const v = await createSelect([
        '[]',
        '{}',
        '\'\'',
        'null',
        'undefined',
        '0',
        'true',
        'false',
      ], {
        placeHolder: '选择数据类型',
      })
      if (!v)
        return

      if (isTypescript)
        insertText = `const ${title} = useRef<${isAddType(v)}>(${v});`
      else
        insertText = `const ${title} = useRef(${v});`

      jumpLine = [loc.line + 1, insertText.length - 1]
      break
    }
    case 'function': {
      const fnMatch = title.match(/\(([^\)]*)\)/)
      if (fnMatch) {
        let i = 0
        insertText = `function ${title.replace(fnMatch[0], '')}(${fnMatch[1].replace(/'[^']*'/g, () => `p${i++}`)}) {\n${emptyStr}  \n${emptyStr}}`
      }
      else {
        insertText = `function ${title}() {\n${emptyStr}  \n${emptyStr}}`
      }
      jumpLine = [loc.line + 2, insertText.length - 2]
      break
    }
    case 'arrowFunction': {
      const fnMatch = title.match(/\(([^\)]*)\)/)

      if (fnMatch) {
        let i = 0
        insertText = `const ${title.replace(fnMatch[0], '')} = (${fnMatch[1].replace(/'[^']*'/g, () => `p${i++}`)}) => {\n${emptyStr}  \n${emptyStr}}`
      }
      else {
        insertText = `const ${title} = () => {\n${emptyStr}  \n${emptyStr}}`
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
