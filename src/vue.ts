import { createRange, createSelect, getConfiguration, getLineText, getPosition, jumpToLine, message, nextTick, updateText } from '@vscode-use/utils'
import { Position } from 'vscode'
import { parse } from '@vue/compiler-sfc'
import { useJSONParse } from 'lazy-js-utils'
import { isExportDefaultDeclaration, isReturnStatement } from '@babel/types'
import { babelParse, generateType } from './utils'

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

    updateTextWord = emptySetupMatch[0].replace(/\n*<\/script>/, '\n</script>')

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

  const { atTop } = getConfiguration('fast-create-variable')
  let insertText = ''
  let msg = ''
  let jumpLine: [number, number]
  let insertPos: Position
  let endLine = 0
  let isExistTitle = false

  const createVue2Methods = () => {
    const { content, loc } = script!
    const ast = babelParse(content)
    const methods = getVue2ObjectName(ast, 'methods')
    if (!methods) {
      message.error('需要事先定义好methods对象')
      return
    }
    if (methods.value.properties.some((prop: any) => prop.key.name === title)) {
      message.error(`methods中该方法名[${title}]已存在`)
      return
    }
    if (atTop) {
      const offset = loc.start.offset + methods.value.loc.start.index + 1
      const { line } = getPosition(offset)
      const emptyLen = 4
      const temp = ' '.repeat(emptyLen)
      insertText = `\n${temp}${title}(){\n  ${temp}\n${temp}}${methods.value.properties.length === 0 ? '\n  ' : ','}`
      const pix = getLineText(line).endsWith('}') ? (getLineText(line).length - 1) : getLineText(line).length
      insertPos = new Position(line, pix)
      jumpLine = [line + 3, emptyLen + 2]
    }
    else {
      const offset = loc.start.offset + methods.value.loc.end.index - 1
      const { line } = getPosition(offset)
      if (methods.value.properties.length === 0 && getLineText(line).endsWith('}')) {
        const lineText = getLineText(line)
        const emptyLen = 4
        const temp = ' '.repeat(emptyLen)
        insertText = `\n${temp}${title}(){\n  ${temp}\n${temp}}\n  `
        insertPos = new Position(line, lineText.length - 1)
        jumpLine = [line + 3, emptyLen + 2]
      }
      else {
        const lineText = getLineText(line - 1)
        const hasComma = lineText.trim().slice(-1) === ','
        const emptyLen = 4
        const temp = ' '.repeat(emptyLen)
        insertText = `${hasComma ? '' : ','}\n${temp}${title}(){\n  ${temp}\n${temp}}`
        insertPos = new Position(line - 1, lineText.length)
        jumpLine = [line + 2, emptyLen + 2]
      }
    }
    msg = `已在methods中添加: ${title} 方法`

    return true
  }

  const createVue3Methods = async (type: 'function' | 'arrowFunction') => {
    const match = scriptSetup!.content.match(`const\\s+${title}\\s*=`) || scriptSetup!.content.match(`function\\s+${title}`)
    if (match) {
      message.error(`function: ${title} 已存在`)
      return
    }
    if (!type)
      type = (await createSelect(['function', 'arrowFunction'])) as 'function' | 'arrowFunction'
    if (!type)
      return
    const fnMatch = title.match(/\(([^\)]*)\)/)

    if (fnMatch) {
      let i = 0
      insertText = type === 'arrowFunction'
        ? `const ${title.replace(fnMatch[0], '')} = (${fnMatch[1].replace(/'[^']*'/g, () => `p${i++}`)}) => {\n  \n}`
        : `function ${title.replace(fnMatch[0], '')}(${fnMatch[1].replace(/'[^']*'/g, () => `p${i++}`)}) {\n  \n}`
    }
    else {
      insertText = type === 'arrowFunction'
        ? `const ${title} = () => {\n  \n}`
        : `function ${title}() {\n  \n}`
    }
    jumpLine = [endLine + 1, insertText.length - 2]
    return true
  }

  let options = scriptSetup
    ? ['ref', 'computed', 'reactive', 'function', 'arrowFunction', 'shallowRef', 'shallowReactive', 'defineProps', 'defineEmits']
    : ['data', 'methods', 'computed', 'watch']
  if (prefixName[0] === '@') {
    options = scriptSetup
      ? ['function', 'arrowFunction', 'ref', 'computed', 'reactive', 'shallowRef', 'shallowReactive', 'defineProps', 'defineEmits']
      : ['methods', 'data', 'computed', 'watch']
  }
  else if (['class', ':class', 'id', ':id'].includes(prefixName)) {
    // 创建style
    options = scriptSetup
      ? ['scopedCss', 'function', 'arrowFunction', 'ref', 'computed', 'reactive', 'shallowRef', 'shallowReactive']
      : ['scopedCss', 'methods', 'data', 'computed', 'watch']
  }
  let propInObj = ''
  let isTypescript = false
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
        let obj: any = {}
        try {
          obj = useJSONParse(`{${match[1]}}`)
        }
        catch (e) {
          match[1].trim().replace(/\n+/g, '\n').split('\n').forEach((item) => {
            const [key, val] = item.split(':')
            obj[key.trim()] = val.trim()
          })
        }
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
  if (scriptSetup) {
    isTypescript = scriptSetup.lang === 'ts'
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
  }
  else {
    isTypescript = script?.lang === 'ts'
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
  if (v !== 'scopedCss') {
    if (!['function', 'methods'].includes(v)) {
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
  }

  if (script) {
    // vue2
    // todos: 若未能匹配到，创建methods、data、watch、computed
    const { content, loc } = script

    switch (v) {
      case 'data': {
        const ast = babelParse(content)
        const data = getVue2ObjectName(ast, 'data')
        if (!data) {
          message.error('需要事先定义好data函数')
          return
        }
        const returnData = data.body.body.find((item: any) => isReturnStatement(item))
        if (!returnData)
          return
        let target = null
        let hasObj = false

        if (title.includes('.')) {
          const _title = title.split('.')
          title = _title[0]
          propInObj = _title.slice(1)[0]
          if (returnData.argument.properties.some((child: any) => {
            if (child.key.name === title) {
              if (child.value?.properties) {
                target = child
                hasObj = true
                return child.value.properties.some((_child: any) => _child.key.name === propInObj)
              }
              else {
                throw new Error(`data中${title}的数据类型有误！`)
              }
            }
            return false
          })) {
            message.error(`data中该变量名[${title}.${propInObj}]已存在`)
            return
          }
        }
        else {
          if (returnData.argument.properties.some((child: any) => child.key.name === title)) {
            message.error(`data中该变量名[${title}.${propInObj}]已存在`)
            return
          }
          else {
            target = data
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

        if (hasObj) {
          if (atTop) {
            const _loc = target.value.properties[0].loc
            const emptyLen = getLineText(loc.start.line)?.match(/^\s*/)?.[0].length || 6
            const offset = loc.start.offset + _loc.start.index + 1
            const { line } = getPosition(offset)
            const temp = ' '.repeat(emptyLen)
            insertText = `\n${temp}  ${propInObj}: ${_v},`
            insertPos = new Position(line - 1, getLineText(line - 1).length)
            jumpLine = [line + 1, insertText.length - 3]
            msg = `已在data中添加: ${title} 属性`
          }
          else {
            const _loc = target.value.properties[0].loc
            const emptyLen = getLineText(loc.start.line)?.match(/^\s*/)?.[0].length || 6
            const offset = loc.start.offset + _loc.end.index - 1
            const { line } = getPosition(offset)
            const temp = ' '.repeat(emptyLen)
            insertText = `\n${temp}  ${propInObj}: ${_v},`
            insertPos = new Position(line - 1, getLineText(line - 1).length)
            jumpLine = [line + 1, insertText.length - 3]
            msg = `已在data中添加: ${title} 属性`
          }
        }
        else {
          const returnData = target.body.body.find((item: any) => isReturnStatement(item))!
          const _loc = returnData.loc
          const emptyLen = 6
          const temp = ' '.repeat(emptyLen)
          const offset = loc.start.offset + _loc.end.index - 1
          const { line } = getPosition(offset)
          if (returnData.argument.properties.length === 0) {
            const lineText = getLineText(line)
            const preLineText = getLineText(line - 1).trim()
            insertText = `${preLineText ? '\n' : ''}${temp}${title}: ${_v}${lineText.endsWith('}') ? '\n    ' : ''}`
            insertPos = new Position(line, lineText.endsWith('}') ? lineText.length - 1 : lineText.length)
            jumpLine = [line + 2, emptyLen + title.length + 3]
          }
          else {
            const lineText = getLineText(line - 1)
            const hasComma = lineText.endsWith(',')
            insertText = `${hasComma ? '' : ','}\n${temp}${title}: ${_v}`
            insertPos = new Position(line - 1, lineText.length)
            jumpLine = [line + 1, `${temp}${title}: ${_v}`.length - 1]
          }
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
        const ast = babelParse(content)
        const computed = getVue2ObjectName(ast, 'computed')
        if (!computed) {
          message.error('需要事先定义好computed对象')
          return
        }

        if (computed.value.properties.some((item: any) => item.key.value === title)) {
          message.error(`computed中该方法名[${title}]已存在`)
          return
        }

        const emptyLen = 4

        if (atTop) {
          if (computed.value.properties.length === 0) {
            const offset = loc.start.offset + computed.loc.start.index + 1
            const { line } = getPosition(offset)
            const lineText = getLineText(line)
            const temp = ' '.repeat(emptyLen)
            if (/},?$/.test(lineText)) {
              insertText = `${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},\n  `
              insertPos = new Position(line, getLineText(line).length - (lineText.endsWith(',') ? 2 : 1))
              jumpLine = [line + 3, emptyLen + 2]
            }
            else {
              insertText = `${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
              insertPos = new Position(line, lineText.length)
              jumpLine = [line + 3, emptyLen + 2]
            }
          }
          else {
            const offset = loc.start.offset + computed.loc.end.index - 1
            const { line } = getPosition(offset)
            const lineText = getLineText(line - 1)
            const hasComma = lineText.endsWith(',')
            const temp = ' '.repeat(emptyLen)
            insertText = `${hasComma ? '' : ','}${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
            insertPos = new Position(line - 1, lineText.length)
            jumpLine = [line + 2, emptyLen + 2]
          }
          msg = `已在computed中添加: ${title} 方法`
        }
        else {
          const offset = loc.start.offset + computed.loc.end.index - 1
          const { line } = getPosition(offset)
          const lineText = getLineText(line - 1)
          if (computed.value.properties.length === 0) {
            const temp = ' '.repeat(emptyLen)
            if (/},?$/.test(lineText)) {
              insertText = `${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},\n  `
              insertPos = new Position(line, getLineText(line).length - (lineText.endsWith(',') ? 2 : 1))
              jumpLine = [line + 3, emptyLen + 2]
            }
            else {
              insertText = `${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
              insertPos = new Position(line - 1, lineText.length)
              jumpLine = [line + 2, emptyLen + 2]
            }
          }
          else {
            const hasComma = lineText.endsWith(',')
            const temp = ' '.repeat(emptyLen)
            insertText = `${hasComma ? '' : ','}${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
            insertPos = new Position(line - 1, lineText.length)
            jumpLine = [line + 2, emptyLen + 2]
          }
          msg = `已在computed中添加: ${title} 方法`
        }
        break
      }
      case 'watch': {
        const ast = babelParse(content)
        const watch = getVue2ObjectName(ast, 'watch')
        if (!watch) {
          message.error('需要事先定义好watch对象')
          return
        }

        if (watch.value.properties.some((item: any) => item.key.value === title)) {
          message.error(`watch中该方法名[${title}]已存在`)
          return
        }

        const emptyLen = 4

        if (atTop) {
          if (watch.value.properties.length === 0) {
            const offset = loc.start.offset + watch.loc.start.index + 1
            const { line } = getPosition(offset)
            const lineText = getLineText(line)
            const temp = ' '.repeat(emptyLen)
            if (/},?$/.test(lineText)) {
              insertText = `${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},\n  `
              insertPos = new Position(line, getLineText(line).length - (lineText.endsWith(',') ? 2 : 1))
              jumpLine = [line + 3, emptyLen + 2]
            }
            else {
              insertText = `${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
              insertPos = new Position(line, lineText.length)
              jumpLine = [line + 3, emptyLen + 2]
            }
          }
          else {
            const offset = loc.start.offset + watch.loc.end.index - 1
            const { line } = getPosition(offset)
            const lineText = getLineText(line - 1)
            const hasComma = lineText.endsWith(',')
            const temp = ' '.repeat(emptyLen)
            insertText = `${hasComma ? '' : ','}${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
            insertPos = new Position(line - 1, lineText.length)
            jumpLine = [line + 2, emptyLen + 2]
          }
          msg = `已在watch中添加: ${title} 方法`
        }
        else {
          const offset = loc.start.offset + watch.loc.end.index - 1
          const { line } = getPosition(offset)
          const lineText = getLineText(line - 1)
          if (watch.value.properties.length === 0) {
            const temp = ' '.repeat(emptyLen)
            if (/},?$/.test(lineText)) {
              insertText = `${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},\n  `
              insertPos = new Position(line, getLineText(line).length - (lineText.endsWith(',') ? 2 : 1))
              jumpLine = [line + 3, emptyLen + 2]
            }
            else {
              insertText = `${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
              insertPos = new Position(line - 1, lineText.length)
              jumpLine = [line + 2, emptyLen + 2]
            }
          }
          else {
            const hasComma = lineText.endsWith(',')
            const temp = ' '.repeat(emptyLen)
            insertText = `${hasComma ? '' : ','}${lineText.trim() ? '\n' : ''}${temp}${title}(newV, oldV){\n  ${temp}\n${temp}},`
            insertPos = new Position(line - 1, lineText.length)
            jumpLine = [line + 2, emptyLen + 2]
          }
          msg = `已在watch中添加: ${title} 方法`
        }

        break
      }
      case 'scopedCss': {
        let hasScopedCss = true
        // 如果没有创建再最底部
        const index = activeText.indexOf('</style>')
        if (index < 0) {
          // 创建
          const { line } = getPosition(activeText.length)
          endLine = line + 2
          hasScopedCss = false
        }
        else {
          const { line } = getPosition(index)
          endLine = line + 1
        }

        const isDeep = await createSelect(['use deep scope', 'not deep scope'])
        if (!isDeep)
          return

        insertText = `${isDeep === 'use deep scope' ? '::v-deep ' : ''}${prefixName.includes('class') ? '.' : '#'}${title} {\n  \n}\n`
        if (!hasScopedCss) {
          insertText = `\n<style scoped>\n${insertText}</style>`
          jumpLine = [endLine + 3, insertText.length - 2]
        }
        else {
          jumpLine = [endLine + 1, insertText.length - 2]
        }
        insertPos = new Position(endLine - 1, 0)
      }
    }
  }
  else if (scriptSetup) {
    // vue3
    endLine = scriptSetup.loc.end.line
    const startOffset = scriptSetup.loc.start.offset + getLastImportOffset(scriptSetup.content)
    const start_position = getPosition(startOffset)
    const endOffset = getFirstFn(scriptSetup.content)

    const end_position = endOffset
      ? getPosition(endOffset + scriptSetup.loc.start.offset)
      : new Position(endLine, 0)

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
        if (isTypescript)
          insertText = `const ${title} = ref<${generateType(_v)}>(${_v})`
        else
          insertText = `const ${title} = ref(${_v})`

        insertPos = new Position(end_position.line, 0)
        jumpLine = [end_position.line + 1, insertText.length - 2]
        break
      }
      case 'shallowRef': {
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

        if (isTypescript)
          insertText = `const ${title} = shallowRef<${generateType(_v)}>(${_v})`
        else
          insertText = `const ${title} = shallowRef(${_v})`

        insertPos = new Position(end_position.line, 0)
        jumpLine = [end_position.line + 1, insertText.length - 2]

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

        if (isTypescript)
          insertText = `const ${title} = reactive<${generateType(_v)}>(${_v})`
        else
          insertText = `const ${title} = reactive(${_v})`

        insertPos = new Position(end_position.line, 0)
        jumpLine = [end_position.line + 1, insertText.length - 2]

        break
      }
      case 'shallowReactive': {
        const _v = await createSelect([
          '[]',
          '{}',
        ], {
          placeHolder: '选择数据类型',
        })

        if (!_v)
          return

        if (isTypescript)
          insertText = `const ${title} = shallowReactive<${generateType(_v)}>(${_v})`
        else
          insertText = `const ${title} = shallowReactive(${_v})`

        insertPos = new Position(end_position.line, 0)
        jumpLine = [end_position.line + 1, insertText.length - 2]

        break
      }
      case 'function': {
        if (!await createVue3Methods('function'))
          return
        insertPos = new Position(endLine - 1, 0)

        break
      }
      case 'arrowFunction': {
        if (!await createVue3Methods('arrowFunction'))
          return
        insertPos = new Position(end_position.line, 0)
        jumpLine = [end_position.line + 2, insertText.length - 2]

        break
      }
      case 'computed': {
        insertText = `const ${title} = computed(() => {\n  \n})`
        jumpLine = [endLine + 1, insertText.length - 2]
        insertPos = new Position(end_position.line, 0)
        jumpLine = [end_position.line + 2, insertText.length - 2]
        break
      }
      case 'scopedCss': {
        let hasScopedCss = true
        // 如果没有创建再最底部
        const index = activeText.indexOf('</style>')
        if (index < 0) {
          // 创建
          const { line } = getPosition(activeText.length)
          endLine = line + 1
          hasScopedCss = false
        }
        else {
          const { line } = getPosition(index)
          endLine = line + 1
        }

        const isDeep = await createSelect(['use deep scope', 'not deep scope'])
        if (!isDeep)
          return

        insertText = `${isDeep === 'use deep scope' ? '::v-deep ' : ''}${prefixName.includes('class') ? '.' : '#'}${title} {\n  \n}`
        if (!hasScopedCss) {
          insertText = `\n<style scoped>\n${insertText}\n</style>`
          jumpLine = [endLine + 3, insertText.length - 2]
        }
        else {
          jumpLine = [endLine + 1, insertText.length - 2]
        }
        insertPos = new Position(endLine - 1, 0)
        break
      }
      case 'defineProps': {
        const match = scriptSetup.content.match(/defineProps\(([^\)]*)\)/)
        if (match) {
          let obj: any = {}
          try {
            obj = useJSONParse(`{${match[1]}}`)
          }
          catch (e) {
            match[1].trim().replace(/\n+/g, '\n').split('\n').forEach((item) => {
              const [key, val] = item.split(':')
              obj[key.trim()] = val.trim()
            })
          }
          if (title in obj) {
            message.error(`defineProps中已定义了该属性: ${title}`)
            return
          }
          insertText = ` ${title}: '',`
          const offset = match.index! + match[0].indexOf(match[1]) + scriptSetup.loc.start.offset + 2
          const offsetPosition = getPosition(offset)
          isExistTitle = true
          const lineText = getLineText(offsetPosition.line)
          const startPix = lineText.indexOf(match[0])
          if (startPix < 0) {
            insertText = insertText.slice(1)
            insertText += '\n  '
          }
          jumpLine = [offsetPosition.line + 1, startPix + match[0].indexOf(match[1]) + insertText.length - 1]
          insertPos = new Position(offsetPosition.line, startPix < 0 ? 2 : startPix + match[0].indexOf(match[1]) + 1)
        }
        else {
          insertText = `const props = defineProps({\n  ${title}: '' \n})`
          insertPos = new Position(start_position.line + 1, 0)
          jumpLine = [start_position.line + 3, title.length + 5]
        }
        break
      }
      case 'defineEmits': {
        const match = scriptSetup.content.match(/defineEmits\(([^\)]*)\)/)
        if (match) {
          if (match[1] && match[1].replace(/[\[\]]/g, '').split(',').includes(title)) {
            message.error(`defineEmits中已定义了该属性: ${title}`)
            return
          }
          insertText = match[1] ? `'${title}', ` : `['${title}']`
          const offset = match.index! + match[0].indexOf(match[1]) + 2 + scriptSetup.loc.start.offset
          const offsetPosition = getPosition(offset)
          isExistTitle = true
          const lineText = getLineText(offsetPosition.line)
          const startPix = lineText.indexOf(match[0])
          jumpLine = [offsetPosition.line + 1, startPix + match[0].indexOf(match[1]) + insertText.length - 2]
          insertPos = new Position(offsetPosition.line, startPix + match[0].indexOf(match[1]) + 1)
        }
        else {
          insertText = `const emits = defineEmits(['${title}'])`
          insertPos = new Position(start_position.line + 1, 0)
          jumpLine = [start_position.line + 2, insertText.length - 3]
        }
        break
      }
    }
    msg = propInObj
      ? `已添加${v}：${title}.${propInObj}`
      : `已添加${v}：${title}`
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

const IMPORT_REG = /import .* from\s+['"][^'"]+/g

export function getLastImportOffset(code: string) {
  let last = null
  for (const match of code.matchAll(IMPORT_REG))
    last = match

  if (last) {
    const index = last.index!
    const offset = index + last[0].length
    return offset
  }
  return 0
}

const FUNCTION_REG = /function\s+.*\([^\)]*\)\s*{/

export function getLastFunctionOffset(code: string) {
  const first = code.match(FUNCTION_REG)

  if (first) {
    const index = first.index!
    const offset = index + first[0].length
    return offset
  }
  return 0
}

const ARROW_FUNCTION_REG = /(const|let|var)\s+.*=\s+\([^\)]*\)\s+=>/
const Life_REG = /(watch|watchEffect|onMounted|onBeforeMount|onBeforeUnmount|onUnmounted|onBeforeUpdate|onDeactivated)\(\(/

export function getFirstFn(code: string) {
  const life = code.match(Life_REG)
  const arrowFn = code.match(ARROW_FUNCTION_REG)
  if (life && arrowFn)
    return life.index! < arrowFn.index! ? life.index! + life[0].length : arrowFn.index! + arrowFn[0].length
  if (life)
    return life.index! + life[0].length
  if (arrowFn)
    return arrowFn.index! + arrowFn[0].length
  return getLastFunctionOffset(code)
}

export function getVue2ObjectName(ast: any, name: string) {
  for (const item of ast.program.body) {
    if (!isExportDefaultDeclaration(item))
      continue
    for (const child of (item.declaration as any).properties) {
      if (child.key.name === name)
        return child
    }
  }
}
