import type { Picked } from './upload';

/**
 * A photo or video picked for a story before the create screen opened (on the web the picker has to open
 * straight from the tap, like Instagram's "+"). The create screen takes it once.
 */
let draft: Picked | null = null;
export const setStoryDraft = (p: Picked | null) => { draft = p; };
export function takeStoryDraft() { const d = draft; draft = null; return d; }
