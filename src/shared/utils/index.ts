const URL_RE = /https?:\/\/[^\s<>"']+/

export function extractFirstUrl(text: string): string | undefined {
  return URL_RE.exec(text)?.[0]
}
