'use client'

// Whole word animates from blurred/transparent to sharp via a CSS keyframe
// defined in globals.css (.text-effect-blur-in).
export function BlurInText({ text }: { text: string }) {
  return <span className="text-effect-blur-in">{text}</span>
}
