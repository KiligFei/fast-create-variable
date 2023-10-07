import { createSelect, getActiveText, getSelection, message, registerCommand, updateText } from '@vscode-use/utils'
import { parse } from '@vue/compiler-sfc'
import { type ExtensionContext, Position } from 'vscode'

export function activate(context: ExtensionContext) {
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

      createSelect(['ref', 'computed', 'function', 'computed', 'reactive']).then((v) => {
        if (v) {
          const {
            descriptor: { script, scriptSetup },
            errors,
          } = parse(getActiveText()!)
          if (errors.length)
            return
          if (script) {
            // vue2
          }
          else if (scriptSetup) {
            // vue3
            const endLine = scriptSetup.loc.end.line
            let insertText: any = ''
            switch (v) {
              case 'ref':
                insertText = `const ${title} = ref('')`
                break
              case 'reactive':
                insertText = `const ${title} = reactive()`
                break
              case 'function':
                insertText = `const ${title} = () => {}`
                break
              case 'computed':
                insertText = `const ${title} = computed(() => {})`
                break
            }
            updateText((edit) => {
              edit.insert(new Position(endLine - 1, 0), `${insertText}\n`)
            })
          }
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
