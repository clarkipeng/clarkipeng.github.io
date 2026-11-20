/** The site's router, as the desk uses it: push an address (with history state), and read the current state. */
export type DeskRouter = { push: (path: string, state?: object) => void; state: () => { fromMain?: boolean } | null };
/** Runs the desk inside root (which holds desk.html's markup); returns the teardown. */
export function mountDesk(root: HTMLElement, router: DeskRouter): () => void;
