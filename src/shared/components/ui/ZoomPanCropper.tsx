'use client'

import { useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'

interface ZoomPanCropperProps {
  image:    string
  aspect:   number
  cropShape?: 'round' | 'rect'
  height?:  number
  onCropAreaChange: (area: Area) => void
}

// Fixed-frame pan/zoom cropper — the frame stays put at `aspect`; the user drags the
// photo to reposition it and uses the slider to zoom in/out to fit the frame.
export function ZoomPanCropper({ image, aspect, cropShape = 'rect', height = 300, onCropAreaChange }: ZoomPanCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  return (
    <div className="flex flex-col flex-shrink-0 w-full" style={{ gap: 12 }}>
      <div style={{ position: 'relative', width: '100%', height, background: 'black', overflow: 'hidden' }}>
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          cropShape={cropShape}
          showGrid={false}
          restrictPosition
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, areaPixels) => onCropAreaChange(areaPixels)}
        />
      </div>
      <input
        type="range"
        min={1}
        max={3}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        aria-label="Zoom"
        className="w-full flex-shrink-0"
        style={{ accentColor: 'var(--color-purple)' }}
      />
    </div>
  )
}
