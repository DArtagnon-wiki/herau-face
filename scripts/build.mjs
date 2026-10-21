// Builds each prototype into one self-contained page.
//   dist/index.html, dist/artifact.html          Mud to Clay
//   dist/circuits.html, dist/circuits-artifact.html   Circuits, the new direction
//   dist/dsp.html, dist/dsp-artifact.html             DSP, offense and defense apart
// Each .html is a complete page to open locally or host anywhere; each
// -artifact.html is the same page without the document skeleton, for
// publishing as a Claude artifact.

import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'

const PAGES = [
  { entry: 'src/main.ts', title: 'Mud to Clay', page: 'index.html', artifact: 'artifact.html' },
  { entry: 'src/circuits/main.ts', title: 'Alchemical Circuits', page: 'circuits.html', artifact: 'circuits-artifact.html' },
  { entry: 'src/dsp/main.ts', title: 'DSP', page: 'dsp.html', artifact: 'dsp-artifact.html' },
]

await mkdir('dist', { recursive: true })
for (const p of PAGES) {
  const result = await build({
    entryPoints: [p.entry],
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
  const head = `<title>${p.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">
<style>${css}</style>`
  const body = `<div id="app"></div>
<script>${js}</script>`
  await writeFile(
    `dist/${p.page}`,
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
  await writeFile(`dist/${p.artifact}`, `${head}\n${body}\n`)
  console.log(`Built dist/${p.page} and dist/${p.artifact} (${Math.round((js.length + css.length) / 1024)} KB of script and style)`)
}
