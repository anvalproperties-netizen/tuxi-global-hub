import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, PermissionStatus } from '@capacitor/camera';

export interface PhotoCaptureResult {
  success: boolean;
  dataUrl?: string;
  format?: string;
  sizeBytes?: number;
  mimeType?: string;
  error?: string;
  source: 'native_camera' | 'web_file_input' | 'mock_test';
}

export interface ImageValidationResult {
  valid: boolean;
  sizeBytes: number;
  mimeType: string;
  error?: string;
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Validates base64 data URLs for file size, MIME format, and payload structure.
 * Prevents unauthorized uploads, script injections, or corrupted files.
 */
export function validateImagePayload(dataUrl: string, maxSizeBytes = MAX_IMAGE_SIZE_BYTES): ImageValidationResult {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { valid: false, sizeBytes: 0, mimeType: '', error: 'INVALID_PAYLOAD: Image data URL is missing or empty' };
  }

  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!match) {
    return { valid: false, sizeBytes: 0, mimeType: '', error: 'INVALID_FORMAT: Expected valid base64 data URL' };
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { 
      valid: false, 
      sizeBytes: 0, 
      mimeType, 
      error: `UNSUPPORTED_MIME_TYPE: '${mimeType}' is not allowed. Supported types: ${ALLOWED_MIME_TYPES.join(', ')}` 
    };
  }

  // Calculate approximate byte size from base64 string
  const padding = (base64Data.match(/=*$/) || [''])[0].length;
  const sizeBytes = Math.floor((base64Data.length * 3) / 4) - padding;

  if (sizeBytes > maxSizeBytes) {
    return { 
      valid: false, 
      sizeBytes, 
      mimeType, 
      error: `FILE_TOO_LARGE: Image size (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds ${(maxSizeBytes / (1024 * 1024)).toFixed(0)} MB limit` 
    };
  }

  return { valid: true, sizeBytes, mimeType };
}

/**
 * Checks device camera permission status without triggering an intrusive prompt.
 */
export async function checkCameraPermissions(): Promise<'granted' | 'denied' | 'prompt'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status: PermissionStatus = await Camera.checkPermissions();
      if (status.camera === 'granted') return 'granted';
      if (status.camera === 'denied') return 'denied';
      return 'prompt';
    } catch (err) {
      console.warn('[Camera] Failed to check native permissions:', err);
      return 'prompt';
    }
  }

  // Web environment check via Permissions API
  if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
    try {
      const perm = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return perm.state;
    } catch {
      return 'prompt';
    }
  }

  return 'prompt';
}

/**
 * Requests camera permission from the operating system when the user initiates capture.
 */
export async function requestCameraPermissions(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Camera.requestPermissions({ permissions: ['camera'] });
      return status.camera === 'granted';
    } catch (err) {
      console.warn('[Camera] Native permission request rejected:', err);
      return false;
    }
  }

  // In web browsers, permissions are prompted implicitly on getUserMedia or file input
  return true;
}

/**
 * Captures a photograph for Driver Proof-of-Delivery or Merchant Document Verification.
 * Automatically delegates to native Capacitor Camera when on Android/iOS,
 * or provides HTML5 file/camera input in browsers.
 */
export async function capturePhoto(options?: {
  quality?: number;
  source?: 'camera' | 'photos';
  allowEditing?: boolean;
}): Promise<PhotoCaptureResult> {
  const quality = options?.quality ?? 85;

  // 1. Native Capacitor Camera Path (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      const permGranted = await requestCameraPermissions();
      if (!permGranted) {
        return {
          success: false,
          error: 'PERMISSION_DENIED: Camera access was denied by the user in system settings.',
          source: 'native_camera'
        };
      }

      const photo = await Camera.getPhoto({
        quality,
        allowEditing: options?.allowEditing ?? false,
        resultType: CameraResultType.DataUrl,
        source: options?.source === 'photos' ? CameraSource.Photos : CameraSource.Camera
      });

      if (!photo.dataUrl) {
        return {
          success: false,
          error: 'CAPTURE_FAILED: Device did not return valid photo data.',
          source: 'native_camera'
        };
      }

      const validation = validateImagePayload(photo.dataUrl);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          source: 'native_camera'
        };
      }

      return {
        success: true,
        dataUrl: photo.dataUrl,
        format: photo.format,
        sizeBytes: validation.sizeBytes,
        mimeType: validation.mimeType,
        source: 'native_camera'
      };
    } catch (err: any) {
      if (err.message && err.message.toLowerCase().includes('cancelled')) {
        return {
          success: false,
          error: 'USER_CANCELLED: Capture was cancelled by the user.',
          source: 'native_camera'
        };
      }
      return {
        success: false,
        error: `NATIVE_CAMERA_ERROR: ${err.message || 'Unknown camera failure'}`,
        source: 'native_camera'
      };
    }
  }

  // 2. Web Browser Fallback Path
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({
        success: false,
        error: 'ENVIRONMENT_ERROR: Document object not available.',
        source: 'web_file_input'
      });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    if (options?.source !== 'photos') {
      input.setAttribute('capture', 'environment'); // Prefer back camera for POD / document capture
    }

    input.onchange = (event: any) => {
      const file: File = event.target?.files?.[0];
      if (!file) {
        resolve({
          success: false,
          error: 'USER_CANCELLED: No image was selected.',
          source: 'web_file_input'
        });
        return;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        resolve({
          success: false,
          error: `FILE_TOO_LARGE: Selected file (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 10 MB limit.`,
          source: 'web_file_input'
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const validation = validateImagePayload(dataUrl);
        if (!validation.valid) {
          resolve({
            success: false,
            error: validation.error,
            source: 'web_file_input'
          });
          return;
        }

        resolve({
          success: true,
          dataUrl,
          format: file.type.split('/')[1] || 'jpeg',
          sizeBytes: file.size,
          mimeType: file.type,
          source: 'web_file_input'
        });
      };

      reader.onerror = () => {
        resolve({
          success: false,
          error: 'FILE_READ_ERROR: Failed to read selected photo file.',
          source: 'web_file_input'
        });
      };

      reader.readAsDataURL(file);
    };

    input.click();
  });
}
