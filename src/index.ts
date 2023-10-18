import { getActiveText, getActiveTextEditorLanguageId, getSelection, message, registerCommand } from '@vscode-use/utils'
import type { ExtensionContext } from 'vscode'
import { isContainCn } from 'lazy-js-utils'
import { createInVue } from './vue'
import { createInJsx } from './jsx'
import { createInSvelte } from './svelte'

export function activate(context: ExtensionContext) {
  // todos: 重构提取公共逻辑
  context.subscriptions.push(registerCommand('fast-create-variable.select', async () => {
    try {
      const { selectedTextArray, lineText, character } = getSelection()!
      if (!lineText)
        return
      let title = selectedTextArray[0].replace(/['"\s]/g, '')
      let prefixName = ''
      let pre
      let preStart
      if (!title) {
        let temp = ''
        pre = character - 1
        while (pre >= 0 && !/['"\s\n{}]/.test(lineText[pre])) {
          temp = `${lineText[pre]}${temp}`
          pre--
        }
        let suffix = character
        while (suffix < lineText.length && !/["\n{}]/.test(lineText[suffix])) {
          temp = `${temp}${lineText[suffix]}`
          suffix++
        }
        title = temp.trim()
        preStart = pre
      }
      else {
        pre = character - title.length
        preStart = pre
      }
      while (pre > 0 && (lineText[pre] !== '"' || lineText[pre - 1] !== '=') && (lineText[pre] !== '{' || lineText[pre - 1] !== '='))
        pre--

      if (lineText[--pre] === '=') {
        pre--
        while (pre > 0 && !(/[\s'"><\/]/.test(lineText[pre]))) {
          prefixName = `${lineText[pre]}${prefixName}`
          pre--
        }
      }
      const _temp = lineText.slice(pre, preStart)
      if (/="[^"]*"/.test(_temp))
        prefixName = ''

      if (isContainCn(title)) {
        message.error('不能使用中文作为变量名')
        return
      }
      const activeText = getActiveText()!
      const lan = getActiveTextEditorLanguageId()!
      switch (lan) {
        case 'vue':
          createInVue(activeText, title, prefixName)
          break
        case 'javascript':
        case 'javascriptreact':
        case 'typescriptreact':
          createInJsx(activeText, title, prefixName)
          break
        case 'svelte':
          // todo: svelte
          createInSvelte(activeText, title, prefixName)
          break
      }
    }
    catch (error) {
      console.error(error)
    }
  }))
}

export function deactivate() {

}
