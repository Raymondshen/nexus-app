import type { SVGProps } from 'react'

export function DefinitionIcon({ style, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="11.3333" viewBox="0 0 12 11.3333" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={style} {...props}>
      <path d="M1.33333 11.3333H0V0H1.33333V11.3333ZM4 11.3333H2.66667V2.66667H4V11.3333ZM6.66667 11.3333H5.33333V1.33333H6.66667V11.3333ZM12 11.3333H10.6667V8H12V11.3333ZM10.6667 8H9.33333V4.66667H10.6667V8ZM9.33333 4.66667H8V1.33333H9.33333V4.66667Z" />
    </svg>
  )
}
