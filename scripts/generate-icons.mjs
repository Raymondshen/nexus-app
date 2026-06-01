// Run: node scripts/generate-icons.mjs
// Requires: npm install --save-dev @napi-rs/canvas

import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 7×7 pixel grid for the N (1 = filled)
const N_GRID = [
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
]

// 5×3 pixel sword (blade up, crossguard middle)
const SWORD_GRID = [
  [0, 1, 0],
  [0, 1, 0],
  [1, 1, 1],
  [0, 1, 0],
  [0, 1, 0],
]

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#0a0612'
  ctx.fillRect(0, 0, size, size)

  // N: occupy ~60% of icon width, centered, shifted slightly up
  const nCols = N_GRID[0].length
  const nRows = N_GRID.length
  const cellN = Math.floor((size * 0.60) / nCols)
  const nW = cellN * nCols
  const nH = cellN * nRows
  const nX = Math.floor((size - nW) / 2)
  const nY = Math.floor((size - nH) / 2) - Math.floor(size * 0.04)

  ctx.fillStyle = '#bf5fff'
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      if (N_GRID[r][c]) {
        ctx.fillRect(nX + c * cellN, nY + r * cellN, cellN - 1, cellN - 1)
      }
    }
  }

  // Sword: bottom-right quadrant, ~11% of size per cell
  const cellS = Math.max(4, Math.floor(size * 0.055))
  const swordW = cellS * SWORD_GRID[0].length
  const swordH = cellS * SWORD_GRID.length
  const sX = size - swordW - Math.floor(size * 0.07)
  const sY = size - swordH - Math.floor(size * 0.07)

  ctx.fillStyle = '#ffd700'
  for (let r = 0; r < SWORD_GRID.length; r++) {
    for (let c = 0; c < SWORD_GRID[r].length; c++) {
      if (SWORD_GRID[r][c]) {
        ctx.fillRect(sX + c * cellS, sY + r * cellS, cellS - 1, cellS - 1)
      }
    }
  }

  return canvas.toBuffer('image/png')
}

const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192))
console.log('✓ icon-192.png written')

writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512))
console.log('✓ icon-512.png written')

console.log('Done — public/icons/ ready.')
