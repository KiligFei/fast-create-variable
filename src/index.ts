import { createRange, createSelect, getActiveText, getLineText, getPosition, getSelection, jumpToLine, message, nextTick, registerCommand, updateText } from '@vscode-use/utils'
import { parse } from '@vue/compiler-sfc'
import type { ExtensionContext } from 'vscode'
import { Position } from 'vscode'

export function activate(context: ExtensionContext) {
  const regexData = /data\s*\(\s*\)\s*{\s*return\s*{([\s\S]*?)\s*}\s*}/
  const dataNamesReg = /(\w+)\s*:\s*(?![^{}]*})/g
  const regexMethods = /methods\s*:\s*{([\s\S]*?)}/
  const methodsNamesReg = /(\w+)\s*\([^)]*\)\s*\{/g
  const regexComputed = /computed\s*:\s*{([\s\S]*?)}/
  const regexWatch = /watch\s*:\s*{([\s\S]*?)}/
  const setupVariableNameReg = /(?:const|let|var)\s+(\w+)\s*=/g
  const setupFuncNameReg = /function\s+(\w+)/g
  context.subscriptions.push(registerCommand('fast-create-variable.select', () => {
    try {
      const { selectedTextArray, lineText, character } = getSelection()!
      let title = selectedTextArray[0].replace(/['"\s]/g, '')
      if (!title) {
        let temp = ''
        let pre = character - 1
        while (pre >= 0 && !/['"\s\n]/.test(lineText[pre])) {
          temp = `${lineText[pre]}${temp}`
          pre--
        }
        let suffix = character
        while (suffix < lineText.length && !/['"\s\n]/.test(lineText[suffix])) {
          temp = `${temp}${lineText[suffix]}`
          suffix++
        }
        title = temp
      }
      if (/['"\s]/.test(title)) {
        message.error('变量名不符合规范')
        return
      }
      let activeText = getActiveText()!
      const emptySetupMatch = activeText.match(/<script.*setup[^>]*>([\n\s]*)<\/script>/)
      let updateEmptySetup: () => void
      if (emptySetupMatch) {
        const v = emptySetupMatch[1]
        let updateTextWord = ''
        if (v)
          activeText = activeText.replace(v, '\n// hi')
        else
          activeText = activeText.replace('</script>', '\n// hi</script>')

        updateTextWord = emptySetupMatch[0].replace('</script>', '\n</script>')

        const { line, column } = getPosition(emptySetupMatch.index!)
        updateEmptySetup = () => updateText((edit) => {
          edit.replace(createRange([line, column - 1], getPosition(emptySetupMatch.index! + emptySetupMatch[0].length)), updateTextWord)
        })
      }
      const {
        descriptor: { script, scriptSetup },
        errors,
      } = parse(activeText)

      const options = scriptSetup
        ? ['ref', 'computed', 'function', 'computed', 'reactive']
        : ['data', 'methods', 'computed', 'watch']
      createSelect(options, {
        placeHolder: '选择快速创建的变量类型',
        title: '快速创建变量',
      }).then(async (v) => {
        if (v) {
          if (errors.length)
            return
          let insertText = ''
          let msg = ''
          let jumpLine: [number, number]
          let insertPos: Position

          if (script) {
            // vue2
            // todos: 若未能匹配到，创建methods、data、watch、computed
            const { content, loc } = script
            switch (v) {
              case 'data': {
                const match = content.match(regexData)
                if (!match) {
                  message.error('需要事先定义好data函数')
                  return
                }
                for (const matcher of match[1].matchAll(dataNamesReg)) {
                  const name = matcher[1]
                  if (name === title) {
                    message.error(`data中该变量名[${title}]已存在`)
                    return
                  }
                }
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
                const offset = loc.start.offset + content.indexOf(match[1])
                const { line, column } = getPosition(offset)
                const emptyLen = match[1].split('\n')[1].match(/^\s*/)?.[0].length || 6
                const temp = ' '.repeat(emptyLen)
                insertText = `\n${temp}${title}: ${_v},`
                insertPos = new Position(line, column)
                jumpLine = [line + 2, emptyLen + title.length + 3]
                msg = `已在data中添加: ${title} 属性`
                break
              }
              case 'methods': {
                const match = content.match(regexMethods)
                if (!match) {
                  message.error('需要事先定义好methods对象')
                  return
                }
                for (const matcher of match[1].matchAll(methodsNamesReg)) {
                  const name = matcher[1]
                  if (name === title) {
                    message.error(`methods中该方法名[${title}]已存在`)
                    return
                  }
                }
                const offset = loc.start.offset + content.indexOf(match[1])
                const { line, column } = getPosition(offset)
                const emptyLen = match[1].split('\n')[1].match(/^\s*/)?.[0].length || 6
                const temp = ' '.repeat(emptyLen)
                insertText = `\n${temp}${title}(){\n  ${temp}\n${temp}},`
                insertPos = new Position(line, column)
                jumpLine = [line + 3, emptyLen + 2]
                msg = `已在methods中添加: ${title} 方法`
                break
              }
              case 'computed': {
                const match = content.match(regexComputed)
                if (!match) {
                  message.error('需要事先定义好computed对象')
                  return
                }
                for (const matcher of match[1].matchAll(methodsNamesReg)) {
                  const name = matcher[1]
                  if (name === title) {
                    message.error(`computed中该方法名[${title}]已存在`)
                    return
                  }
                }
                const offset = loc.start.offset + content.indexOf(match[1])
                const { line, column } = getPosition(offset)
                const emptyLen = match[1].split('\n')[1].match(/^\s*/)?.[0].length || 6
                const temp = ' '.repeat(emptyLen)
                insertText = `\n${temp}${title}(){\n  ${temp}\n${temp}},`
                insertPos = new Position(line, column)
                jumpLine = [line + 3, emptyLen + 2]
                msg = `已在computed中添加: ${title} 方法`
                break
              }
              case 'watch': {
                const match = content.match(regexWatch)
                if (!match) {
                  message.error('需要事先定义好watch对象')
                  return
                }
                for (const matcher of match[1].matchAll(methodsNamesReg)) {
                  const name = matcher[1]
                  if (name === title) {
                    message.error(`watch中该方法名[${title}]已存在`)
                    return
                  }
                }
                const offset = loc.start.offset + content.indexOf(match[1])
                const { line, column } = getPosition(offset)
                const emptyLen = match[1].split('\n')[1].match(/^\s*/)?.[0].length || 6
                const temp = ' '.repeat(emptyLen)
                insertText = `\n${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
                insertPos = new Position(line, column)
                jumpLine = [line + 3, emptyLen + 2]
                msg = `已在watch中添加: ${title} 方法`
                break
              }
            }
          }
          else if (scriptSetup) {
            // vue3
            const endLine = scriptSetup.loc.end.line
            for (const matcher of scriptSetup.content.matchAll(setupVariableNameReg)) {
              const name = matcher[1]
              if (name === title) {
                message.error(`该变量名[${title}]已存在`)
                return
              }
            }
            for (const matcher of scriptSetup.content.matchAll(setupFuncNameReg)) {
              const name = matcher[1]
              if (name === title) {
                message.error(`该变量名[${title}]已存在`)
                return
              }
            }
            switch (v) {
              case 'ref': {
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
                insertText = `const ${title} = ref(${_v})`
                jumpLine = [endLine, insertText.length - 2]
                break
              }
              case 'reactive': {
                const _v = await createSelect([
                  '[]',
                  '{}',
                ], {
                  placeHolder: '选择数据类型',
                })
                if (!_v)
                  return
                insertText = `const ${title} = reactive(${_v})`
                jumpLine = [endLine, insertText.length - 2]
                break
              }
              case 'function': {
                insertText = `const ${title} = () => {\n  \n}`
                jumpLine = [endLine + 1, insertText.length - 2]
                break
              }
              case 'computed': {
                insertText = `const ${title} = computed(() => {\n  \n})`
                jumpLine = [endLine + 1, insertText.length - 2]
                break
              }
            }
            msg = `已添加${v}：${title} `
            insertPos = new Position(endLine - 1, 0)
          }
          else {
            return
          }
          updateEmptySetup && updateEmptySetup()
          nextTick(() => {
            updateText((edit) => {
              edit.insert(insertPos, insertText + (scriptSetup ? (getLineText(insertPos.line) ? '\n' : '') : ''))
            })
            nextTick(() => {
              message.info(msg)
              jumpToLine(jumpLine)
            })
          })
        }
      })
    }
    catch (error) {
      console.error(error)
    }
  }))
}

export function deactivate() {

}
