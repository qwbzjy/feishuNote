import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { createElement } from 'react'
import { buildSlashItems, filterSlashItems, type SlashItem } from './items'
import { SlashMenu, type SlashMenuHandle } from './SlashMenu'

export interface SlashCommandOptions {
  onPickImage: () => void
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { onPickImage: () => undefined }
  },

  addProseMirrorPlugins() {
    const items = buildSlashItems(this.options.onPickImage)

    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterSlashItems(items, query).slice(0, 40),
        command: ({ editor, range, props }) => {
          props.run({ editor, range, onPickImage: this.options.onPickImage })
        },
        render: () => {
          let component: ReactRenderer<SlashMenuHandle, any> | null = null
          let wrapper: HTMLDivElement | null = null

          const place = (): void => {
            if (!component?.element || !wrapper) return
            const element = component.element
            wrapper.innerHTML = ''
            wrapper.appendChild(element)
          }

          return {
            onStart: (props) => {
              wrapper = document.createElement('div')
              wrapper.style.position = 'fixed'
              wrapper.style.inset = '0'
              wrapper.style.zIndex = '110'
              wrapper.style.pointerEvents = 'none'
              wrapper.className = 'fn-slash-layer'
              document.body.appendChild(wrapper)
              component = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor
              })
              if (component.element) component.element.style.pointerEvents = 'auto'
              place()
            },
            onUpdate: (props) => {
              component?.updateProps(props)
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                props.event.preventDefault()
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              wrapper?.remove()
              component?.destroy()
              wrapper = null
              component = null
            }
          }
        }
      })
    ]
  }
})
