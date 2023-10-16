import { getActiveText, getActiveTextEditorLanguageId, getSelection, message, registerCommand } from '@vscode-use/utils'
import type { ExtensionContext } from 'vscode'
import { isContainCn } from 'lazy-js-utils'
import { createInVue } from './vue'

export function activate(context: ExtensionContext) {
  // todos: 重构提取公共逻辑
  context.subscriptions.push(registerCommand('fast-create-variable.select', async () => {
    try {
      const { selectedTextArray, lineText, character } = getSelection()!
      if (!lineText)
        return
      let title = selectedTextArray[0].replace(/['"\s]/g, '')
      let prefixName = ''
      if (!title) {
        let temp = ''
        let pre = character - 1
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
        while (pre > 0 && (lineText[pre] !== '"' || lineText[pre - 1] !== '='))
          pre--

        pre--
        if (lineText[pre] === '=') {
          pre--
          while (pre > 0 && !(/[\s'"><\/]/.test(lineText[pre]))) {
            prefixName = `${lineText[pre]}${prefixName}`
            pre--
          }
        }
      }

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
        // todos: create variable in jsx
        // case 'javascript':
        // case 'javascriptreact':
        // case 'typescriptreact':
        //   createInJsx(activeText, title, prefixName)
        //   break;
      }
    }
    catch (error) {
      console.error(error)
    }
  }))
}

export function deactivate() {

}
