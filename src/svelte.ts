import { Position, window } from 'vscode'
import { createSelect, getLineText, getPosition, jumpToLine, message, nextTick, updateText } from '@vscode-use/utils'
import { useJSONParse } from 'lazy-js-utils'

const setupVariableNameReg = /(?:const|let|var)\s+(\w+)\s*=/g

/* eslint-disable */
export async function createInSvelte(activeText: string, title: string, prefixName: string) {
  // todo
  const url = window.activeTextEditor?.document.uri.fsPath
  const { parse } = require('svelte/compiler')
  try {
    const { instance } = parse(activeText, { filename: url });
    const script = activeText.slice(instance.content.start, instance.end)

    let insertText = ''
    let msg = ''
    let jumpLine: [number, number]
    let insertPos: Position
    let endLine = getPosition(instance.end).line
    let isExistTitle = false
    let propInObj
    if (title.includes('.')) {
      const _title = title.split('.')
      title = _title[0]
      propInObj = _title.slice(1)[0]
      for (const matcher of script.matchAll(setupVariableNameReg)) {
        const name = matcher[1]
        if (name === title) {
          isExistTitle = true
          break
        }
      }

      if (isExistTitle) {
        const match = script.match(`(const|let|var)\\s+${title}\\s*=\\s*[\\s\\n]*{([\\s\\S]*?)}[\\s\\n]*`)
        if (match) {
          const obj = useJSONParse(`{${match[2]}}`)
          if (obj[propInObj] !== undefined) {
            message.error(`该变量名[${title}.${propInObj}]已存在`)
            return
          }
          else {
            // 补充属性
            const _v = await createSelect([
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
            if (!_v)
              return

            const emptyLen = match[2].split('\n')[2]?.match(/^\s*/)?.[0].length || 2
            const index = match.index! + match[0].indexOf(match[2] || '{}')
            const offset = instance.content.start + index
            const { line, column } = getPosition(offset)
            const temp = ' '.repeat(emptyLen)
            insertText = `\n${temp}  ${propInObj}: ${_v},${match[2] ? '' : '\n  '}`
            insertPos = new Position(line, column)
            jumpLine = [line + 2, emptyLen + `${propInObj}: ${_v}`.length - 1]
            msg = `已添加ref：${title}.${propInObj}`
            mount()
          }
        }
        else {
          message.error(`${title} 在data中定义的数据类型有误`)
          return
        }
      } else {
        const _v = await createSelect([
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
        if (!_v)
          return

        insertText = `  const ${title} = {\n    ${_title.slice(1)[0]}: ${_v}\n  }`
        jumpLine = [endLine + 1, `  ${_title.slice(1)[0]}: ${_v}`.length - 1]
        msg = propInObj
          ? `已添加变量：const ${title}.${propInObj}`
          : `已添加变量：const ${title}`
        insertPos = new Position(endLine - 1, 0)
        mount()
      }
      return
    }

    for (const matcher of script.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)) {
      const name = matcher[1]
      if (name === title) {
        message.error(`该变量名[${title}]已存在`)
        return
      }
    }
    for (const matcher of script.matchAll(/function\s+(\w+)/g)) {
      const name = matcher[1]
      if (name === title) {
        message.error(`该变量名[${title}]已存在`)
        return
      }
    }
    const options = prefixName.startsWith('on:')
      ? ['function', 'arrowFunction']
      : ['let', 'const', 'var', 'function', 'arrowFunction']
    const v = await createSelect(options, {
      placeHolder: '选择快速创建的变量类型',
      title: '快速创建变量',
    })
    if (!v)
      return
    title = title.replace(/=/, '')
    if (v !== 'function' && v !== 'methods') {
      title = title.replace(/\([^\)]*\)/, '')
      title = title.split(' ')[0]
      if (/['"\s\-\[\]]/.test(title)) {
        message.error('变量名不符合规范：不能包含空格、中括号、引号等特殊字符')
        return
      }
    }
    else {
      const _title = title.replace(/\([^\)]*\)/, '')
      if (/['"\s\-\+\[\]]/.test(_title)) {
        message.error('变量名不符合规范：不能包含空格、中括号、引号等特殊字符')
        return
      }
    }

    switch (v) {
      case 'const':
      case 'var':
      case 'let': {
        const _v = await createSelect([
          '[]',
          '{}',
          '\'\'',
          'null',
          'undefined',
          '0',
          'false',
          'true',
        ], {
          placeHolder: '选择数据类型',
        })
        if (!_v)
          return
        const offset = instance.content.end
        const { line, column } = getPosition(offset)
        const emptyLen = 2
        const temp = ' '.repeat(emptyLen)
        insertText = `\n${temp}${v} ${title} = ${_v}`
        insertPos = new Position(line, column - 1)
        jumpLine = [line + 2, insertText.length - 2]
        msg = `已添加变量: ${v} ${title} = ${_v}`
      }
      case 'function': {
        const fnMatch = title.match(/\(([^\)]*)\)/)
        if (fnMatch) {
          let i = 0
          insertText = `  function ${title.replace(fnMatch[0], '')}(${fnMatch[1].replace(/'[^']*'/g, () => `p${i++}`)}) {\n    \n  }`
        }
        else {
          insertText = `  function ${title}() {\n    \n  }`
        }
        jumpLine = [endLine + 2, insertText.length - 2]
        insertPos = new Position(endLine, 0)

      }
      case 'arrowFunction': {
        const fnMatch = title.match(/\(([^\)]*)\)/)

        if (fnMatch) {
          let i = 0
          insertText = `  const ${title.replace(fnMatch[0], '')} = (${fnMatch[1].replace(/'[^']*'/g, () => `p${i++}`)}) => {\n    \n  }`
        }
        else {
          insertText = `  const ${title} = () => {\n    \n  }`
        }
        jumpLine = [endLine + 2, insertText.length - 2]
        insertPos = new Position(endLine, 0)
      }
        mount()
    }
    function mount() {
      nextTick(() => {
        updateText((edit) => {
          edit.insert(insertPos, insertText + (!isExistTitle ? (getLineText(insertPos.line) ? '\n' : '') : ''))
        })
        nextTick(() => {
          message.info(msg)
          jumpToLine(jumpLine)
        })
      })
    }

  } catch (err) {
    throw err
  }


}
