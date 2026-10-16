"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

const VIEW_WIDTH = 480
const OUTPUT_WIDTH = 1600

type Props = {
  file: File
  aspect?: number
  onCancel: () => void
  onCrop: (file: File) => void
}

// Drag to position, slide to zoom; exports the visible frame as a new image file.
export function ImageCropper({ file, aspect = 16 / 9, onCancel, onCrop }: Props) {
  const viewHeight = Math.round(VIEW_WIDTH / aspect)
  const [src, setSrc] = useState("")
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Scale at zoom 1 fully covers the frame.
  const base = natural.width ? Math.max(VIEW_WIDTH / natural.width, viewHeight / natural.height) : 1
  const scale = base * zoom
  const shownWidth = natural.width * scale
  const shownHeight = natural.height * scale

  function clamp(x: number, y: number, w = shownWidth, h = shownHeight) {
    const maxX = Math.max(0, (w - VIEW_WIDTH) / 2)
    const maxY = Math.max(0, (h - viewHeight) / 2)
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
  }

  function changeZoom(next: number) {
    setZoom(next)
    setOffset((current) => clamp(current.x, current.y, natural.width * base * next, natural.height * base * next))
  }

  function crop() {
    const image = imageRef.current
    if (!image || !natural.width) return
    const sourceWidth = VIEW_WIDTH / scale
    const sourceHeight = viewHeight / scale
    const sourceX = natural.width / 2 - offset.x / scale - sourceWidth / 2
    const sourceY = natural.height / 2 - offset.y / scale - sourceHeight / 2
    const canvas = document.createElement("canvas")
    canvas.width = Math.min(OUTPUT_WIDTH, Math.round(sourceWidth))
    canvas.height = Math.round(canvas.width / aspect)
    canvas.getContext("2d")?.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
    const type = file.type === "image/png" ? "image/png" : "image/jpeg"
    canvas.toBlob((blob) => {
      if (!blob) return
      const extension = type === "image/png" ? "png" : "jpg"
      onCrop(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-cropped.${extension}`, { type }))
    }, type, 0.92)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop image" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="grid w-full max-w-lg gap-4 rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div>
          <h2 className="text-base font-semibold">Crop image</h2>
          <p className="text-sm text-muted-foreground">Drag to reposition and use the slider to zoom.</p>
        </div>
        <div
          className="relative mx-auto w-full max-w-full cursor-grab touch-none overflow-hidden rounded-lg bg-black active:cursor-grabbing"
          style={{ aspectRatio: String(aspect), containerType: "inline-size" }}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y } }}
          onPointerMove={(event) => {
            if (!drag.current) return
            const ratio = VIEW_WIDTH / event.currentTarget.clientWidth
            setOffset(clamp(drag.current.ox + (event.clientX - drag.current.x) * ratio, drag.current.oy + (event.clientY - drag.current.y) * ratio))
          }}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imageRef}
              src={src}
              alt="Crop preview"
              draggable={false}
              onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{ width: shownWidth ? `${shownWidth * 100 / VIEW_WIDTH}cqw` : undefined, height: shownHeight ? `${shownHeight * 100 / VIEW_WIDTH}cqw` : undefined, transform: `translate(calc(-50% + ${offset.x * 100 / VIEW_WIDTH}cqw), calc(-50% + ${offset.y * 100 / VIEW_WIDTH}cqw))` }}
            />
          ) : null}
        </div>
        <label className="grid gap-1 text-sm">
          Zoom
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={crop} disabled={!natural.width}>Use cropped image</Button>
        </div>
      </div>
    </div>
  )
}
