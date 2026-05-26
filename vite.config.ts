import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron'

  return {
    plugins: [
      react(),
      ...(isElectron
        ? [
            electron([
              {
                entry: 'electron/main.ts',
                vite: {
                  build: {
                    lib: {
                      entry: 'electron/main.ts',
                      formats: ['cjs'],
                      fileName: () => 'main.cjs',
                    },
                    rollupOptions: {
                      output: {
                        format: 'cjs',
                        entryFileNames: 'main.cjs',
                      },
                    },
                  },
                },
              },
              {
                entry: 'electron/preload.ts',
                vite: {
                  build: {
                    lib: {
                      entry: 'electron/preload.ts',
                      formats: ['cjs'],
                      fileName: () => 'preload.cjs',
                    },
                    rollupOptions: {
                      output: {
                        format: 'cjs',
                        entryFileNames: 'preload.cjs',
                      },
                    },
                  },
                },
                onstart(args) {
                  args.reload()
                },
              },
            ]),
            renderer(),
          ]
        : []),
    ],
    base: './',
  }
})
