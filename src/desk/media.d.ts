/** The desk's media addresses, each carrying a hash of its file's content (built by the desk-media plugin in vite.config.ts). */
declare module 'virtual:desk-media' {
  /** public/desk-media/clips.json */
  export const clips: Record<string, { poster?: string; cover?: string; clips?: (string | { src: string; start?: number })[] }>;
  /** A public path such as /desk-media/suika-01.mp4, with its content hash; other paths pass through. */
  export function mediaUrl(path: string): string;
  /** Every desk-media and images src or href in the markup, with its content hash. */
  export function versionHtml(html: string): string;
}
