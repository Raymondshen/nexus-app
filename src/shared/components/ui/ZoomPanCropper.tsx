'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { Area, Point } from 'react-easy-crop'

// This is the only runtime import of react-easy-crop in the app (every other file
// imports its types only), so lazy-loading it here defers the library for all crop
// surfaces at once — the chunk is fetched the first time a cropper actually opens,
// not on every chat/home page load that merely *can* open one.
// Cast back to the original class-component type: react-easy-crop relies on
// defaultProps for most of its props, and dynamic()'s inferred type drops the
// LibraryManagedAttributes handling that makes those props optional in JSX.
const Cropper = dynamic(() => import('react-easy-crop'), {
  ssr: false,
}) as unknown as typeof import('react-easy-crop').default

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
