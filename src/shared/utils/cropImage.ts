import type { Area } from 'react-easy-crop'

export function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// `area` is already in the source image's natural pixel coordinates (react-easy-crop's
// croppedAreaPixels), so no displayed-vs-natural scale conversion is needed here.
export function drawCroppedCanvas(img: HTMLImageElement, area: Area, outW: number, outH: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width  = outW
  canvas.height = outH
  canvas.getContext('2d')!.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, outW, outH,
  )
  return canvas
}
