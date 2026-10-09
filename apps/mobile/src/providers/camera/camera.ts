import { AppError, Result } from '../../core/status';

declare const require: (name: string) => unknown;

type PickerModule = {
  requestCameraPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  launchCameraAsync: (o: { mediaTypes: string[]; quality: number; exif: boolean }) => Promise<{
    canceled: boolean; assets?: { uri: string }[] | null;
  }>;
};
type ManipulatorModule = typeof import('expo-image-manipulator');

// Loaded defensively: before the native rebuild these modules do not exist, and the app must not crash.
let picker: PickerModule | null = null;
try { picker = require('expo-image-picker') as PickerModule; } catch { picker = null; }
let manipulator: ManipulatorModule | null = null;
try { manipulator = require('expo-image-manipulator') as ManipulatorModule; } catch { manipulator = null; }

const fail = (code: AppError['code'], message: string): Result<never> => ({ ok: false, error: { code, message } });
const NEEDS_REBUILD = 'The camera is not available in this build yet. Rebuild the app to enable it.';

/** Opens the phone's own camera app. Returns a local image URI. */
export async function captureAssetImage(): Promise<Result<{ uri: string }>> {
  if (!picker) return fail('UNSUPPORTED_DEVICE', NEEDS_REBUILD);
  try {
    const perm = await picker.requestCameraPermissionsAsync();
    if (!perm.granted)
      return fail('UNAUTHORIZED', perm.canAskAgain
        ? 'Camera permission was denied.'
        : 'Camera permission is blocked. Enable it in Android Settings, Apps, Permissions.');
    const res = await picker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, exif: false });
    const uri = res.assets?.[0]?.uri;
    if (res.canceled || !uri) return fail('USER_REJECTED', 'Capture cancelled.');
    return { ok: true, value: { uri } };
  } catch {
    return fail('UNKNOWN', 'The camera could not be opened.');
  }
}

/** Shrinks the photo (about 900px wide JPEG) so it stays small enough to store. */
export async function prepareImage(uri: string): Promise<Result<{ uri: string; base64: string }>> {
  if (!manipulator) return fail('UNSUPPORTED_DEVICE', NEEDS_REBUILD);
  try {
    const ctx = manipulator.ImageManipulator.manipulate(uri);
    ctx.resize({ width: 900 });
    const rendered = await ctx.renderAsync();
    const out = await rendered.saveAsync({ format: manipulator.SaveFormat.JPEG, compress: 0.6, base64: true });
    if (!out.base64) return fail('UNKNOWN', 'The photo could not be processed.');
    return { ok: true, value: { uri: out.uri, base64: out.base64 } };
  } catch {
    return fail('UNKNOWN', 'The photo could not be processed.');
  }
}