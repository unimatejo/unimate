import { requireOptionalNativeModule } from 'expo';

type Lifted = { uri: string; width: number; height: number };
const Native = requireOptionalNativeModule<{ isAvailable(): boolean; lift(uri: string): Promise<Lifted> }>('SubjectLift');

/** Can this phone cut the subject out of a photo? (iPhone on iOS 17+) */
export const canLift = (): boolean => { try { return !!Native?.isAvailable(); } catch { return false; } };
/** Cut the person or object out of the photo: a transparent PNG trimmed to the subject. */
export const liftSubject = (uri: string): Promise<Lifted> => (Native ? Native.lift(uri) : Promise.reject(new Error('unavailable')));
