// Builds the prototype into one self-contained page.
//   dist/index.html     a complete page, to open locally or host anywhere
//   dist/artifact.html  the same page without the document skeleton, for publishing as a Claude artifact

import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outdir: 'dist/tmp',
  write: false,
  logLevel: 'warning',
})

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replaceAll('</script', '<\\/script')
const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text

const head = `<title>Mud to Clay</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">
<style>${css}</style>`
const body = `<div id="app"></div>
<script>${js}</script>`

await mkdir('dist', { recursive: true })
await writeFile(
  'dist/index.html',
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`,
)
await writeFile('dist/artifact.html', `${head}\n${body}\n`)
console.log(`Built dist/index.html and dist/artifact.html (${Math.round((js.length + css.length) / 1024)} KB of script and style)`)
