import { createRange, createSelect, getLineText, getPosition, jumpToLine, message, nextTick, updateText } from '@vscode-use/utils'
import { Position } from 'vscode'
import { parse } from '@vue/compiler-sfc'
import { useJSONParse } from 'lazy-js-utils'

const regexData = /data\s*\(\s*\)\s*{\s*return\s*{([\s\S]*?)\s*}\s*}/
const dataNamesReg = /(\w+)\s*:\s*(?![^{}]*})/g
const regexMethods = /methods\s*:\s*{([\s\S]*?)}/
const methodsNamesReg = /(\w+)\s*\([^)]*\)\s*\{/g
const regexComputed = /computed\s*:\s*{([\s\S]*?)}/
const regexWatch = /watch\s*:\s*{([\s\S]*?)}/
const setupVariableNameReg = /(?:const|let|var)\s+(\w+)\s*=/g
const setupFuncNameReg = /function\s+(\w+)/g
const notFunctionPrefix = ['.trim', '.number', '.sync']
export async function createInVue(activeText: string, title: string, prefixName: string) {
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

  if (errors.length)
    return

  let insertText = ''
  let msg = ''
  let jumpLine: [number, number]
  let insertPos: Position
  let endLine = 0

  const createVue2Methods = () => {
    const { content, loc } = script!

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
    const emptyLen = match[1].split('\n')[1]?.match(/^\s*/)?.[0].length || 6
    const temp = ' '.repeat(emptyLen)
    insertText = `\n${temp}${title}(){\n  ${temp}\n${temp}},`
    insertPos = new Position(line, column)
    jumpLine = [line + 3, emptyLen + 2]
    msg = `已在methods中添加: ${title} 方法`
    return true
  }

  const createVue3Methods = () => {
    const fnMatch = title.match(/\(([^\)]*)\)/)
    if (fnMatch) {
      let i = 0
      insertText = `const ${title.replace(fnMatch[0], '')} = (${fnMatch[1].replace(/'[^']*'/g, () => {
        return `p${i++}`
      })}) => {\n  \n}`
    }
    else {
      insertText = `const ${title} = () => {\n  \n}`
    }
    jumpLine = [endLine + 1, insertText.length - 2]
  }

  if (prefixName[0] === '@') {
    // 直接创建methods
    if (script) {
      createVue2Methods()
    }
    else if (scriptSetup) {
      endLine = scriptSetup.loc.end.line
      createVue3Methods()
      msg = `已添加function：${title} `
      insertPos = new Position(endLine - 1, 0)
    }
    mount()
    return
  }

  let options = scriptSetup
    ? ['ref', 'computed', 'function', 'reactive']
    : ['data', 'methods', 'computed', 'watch']

  let isExistTitle = false
  let propInObj = ''
  if (scriptSetup && title.includes('.')) {
    endLine = scriptSetup.loc.end.line
    const _title = title.split('.')
    title = _title[0]
    propInObj = _title.slice(1)[0]
    for (const matcher of scriptSetup.content.matchAll(setupVariableNameReg)) {
      const name = matcher[1]
      if (name === title) {
        isExistTitle = true
        break
      }
    }
    if (isExistTitle) {
      const match = scriptSetup.content.match(`(?:const|let|var)\\s+${title}\\s*=\\s*(?:ref|reactive)\\([\\s\\n]*{([\\s\\S]*?)}[\\s\\n]*\\)`)
      if (match) {
        const obj = useJSONParse(`{${match[1]}}`)
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

          const emptyLen = match[1].split('\n')[1]?.match(/^\s*/)?.[0].length || 2
          const index = match.index! + match[0].indexOf(match[1] || '{}')
          const offset = scriptSetup.loc.start.offset + index
          const { line, column } = getPosition(offset)
          const temp = ' '.repeat(emptyLen)
          insertText = `\n${temp}${propInObj}: ${_v},${match[1] ? '' : '\n'}`
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
    }
    else {
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

      insertText = `const ${title} = ref({\n  ${_title.slice(1)[0]}: ${_v}\n})`
      jumpLine = [endLine + 1, `  ${_title.slice(1)[0]}: ${_v}`.length - 1]
      msg = propInObj
        ? `已添加ref：${title}.${propInObj}`
        : `已添加ref：${title}`
      insertPos = new Position(endLine - 1, 0)
      mount()
    }
    return
  }

  if (prefixName.startsWith('v-model') || notFunctionPrefix.some(n => prefixName.includes(n)))
    options = options.filter(item => !['function', 'methods'].includes(item))

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
    if (/['"\s\-\[\]]/.test(_title)) {
      message.error('变量名不符合规范：不能包含空格、中括号、引号等特殊字符')
      return
    }
  }
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

        if (title.includes('.')) {
          const _title = title.split('.')
          title = _title[0]
          propInObj = _title.slice(1)[0]
        }
        else {
          for (const matcher of match[1].matchAll(dataNamesReg)) {
            const name = matcher[1]
            if (name === title) {
              message.error(`data中该变量名[${title}]已存在`)
              return
            }
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
        let hasObj = false
        if (propInObj) {
          for (const matcher of match[1].matchAll(dataNamesReg)) {
            const name = matcher[1]
            if (name === title) {
              hasObj = true
              break
            }
          }
        }
        if (hasObj) {
          const objMatch = match[1].match(`${title}:\\s*{([^}]*)}`)
          if (objMatch) {
            // 目前只考虑了一层obj.xx，todos: obj.x1.x2.x3....
            const obj = useJSONParse(`{${objMatch[1]}}`)
            if (obj[propInObj] !== undefined) {
              message.error(`data中该变量名[${title}.${propInObj}]已存在`)
              return
            }
            const emptyLen = objMatch[1].split('\n')[1]?.match(/^\s*/)?.[0].length || 6
            const index = objMatch.index! + objMatch[0].indexOf(objMatch[1])
            const offset = loc.start.offset + content.indexOf(match[1]) + index
            const { line, column } = getPosition(offset)
            const temp = ' '.repeat(emptyLen)
            insertText = `\n${temp}${propInObj}: ${_v},`
            insertPos = new Position(line, column)
            jumpLine = [line + 2, emptyLen + title.length + 3]
            msg = `已在data中添加: ${title} 属性`
          }
          else {
            message.error(`${title} 在data中定义的数据类型有误`)
            return
          }
        }
        else {
          const offset = loc.start.offset + content.indexOf(match[1])
          const { line, column } = getPosition(offset)
          const emptyLen = match[1].split('\n')[1]?.match(/^\s*/)?.[0].length || 6
          const temp = ' '.repeat(emptyLen)
          insertText = `\n${temp}${title}: ${_v},`
          insertPos = new Position(line, column)
          jumpLine = [line + 2, emptyLen + title.length + 3]
          msg = `已在data中添加: ${title} 属性`
        }

        break
      }
      case 'methods': {
        if (!createVue2Methods())
          return
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
        const emptyLen = match[1].split('\n')[1]?.match(/^\s*/)?.[0].length || 6
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
        const emptyLen = match[1].split('\n')[1]?.match(/^\s*/)?.[0].length || 6
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
    endLine = scriptSetup.loc.end.line

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
        createVue3Methods()
        break
      }
      case 'computed': {
        insertText = `const ${title} = computed(() => {\n  \n})`
        jumpLine = [endLine + 1, insertText.length - 2]
        break
      }
    }
    msg = propInObj
      ? `已添加${v}：${title}.${propInObj}`
      : `已添加${v}：${title}`
    insertPos = new Position(endLine - 1, 0)
  }
  else {
    return
  }
  mount()

  function mount() {
    updateEmptySetup && updateEmptySetup()
    nextTick(() => {
      updateText((edit) => {
        edit.insert(insertPos, insertText + ((!isExistTitle && scriptSetup) ? (getLineText(insertPos.line) ? '\n' : '') : ''))
      })
      nextTick(() => {
        message.info(msg)
        jumpToLine(jumpLine)
      })
    })
  }
}
