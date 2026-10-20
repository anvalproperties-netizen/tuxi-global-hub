// TUXI Offline Queue & Service Worker Synchronization Service

export interface OfflineOrderInquiry {
  id: string;
  orderId: string;
  orderNumber: string;
  inquiryType: 'status_refresh' | 'eta_check' | 'courier_location' | 'ai_chat_inquiry';
  promptText?: string;
  timestamp: string;
  status: 'queued' | 'syncing' | 'synced';
  syncedAt?: string;
  reconciledStatus?: string;
  reconciledEta?: string;
}

const STORAGE_KEY = 'tuxi_offline_order_inquiries';

// Event listeners
type QueueListener = (queue: OfflineOrderInquiry[]) => void;
type ConnectivityListener = (isOnline: boolean) => void;

const queueListeners = new Set<QueueListener>();
const connectivityListeners = new Set<ConnectivityListener>();

export function isDeviceOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function getOfflineInquiries(): OfflineOrderInquiry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[OfflineQueue] Could not read queue from localStorage', e);
    return [];
  }
}

function saveOfflineInquiries(queue: OfflineOrderInquiry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    notifyQueueListeners(queue);
  } catch (e) {
    console.warn('[OfflineQueue] Could not save queue to localStorage', e);
  }
}

function notifyQueueListeners(queue: OfflineOrderInquiry[]) {
  queueListeners.forEach(listener => listener(queue));
}

function notifyConnectivityListeners() {
  const online = isDeviceOnline();
  connectivityListeners.forEach(listener => listener(online));
}

export function onQueueUpdate(listener: QueueListener): () => void {
  queueListeners.add(listener);
  listener(getOfflineInquiries());
  return () => {
    queueListeners.delete(listener);
  };
}

export function onConnectivityChange(listener: ConnectivityListener): () => void {
  connectivityListeners.add(listener);
  listener(isDeviceOnline());
  return () => {
    connectivityListeners.delete(listener);
  };
}

/**
 * Queue a new inquiry while offline
 */
export function queueOfflineInquiry(
  inquiryData: Omit<OfflineOrderInquiry, 'id' | 'timestamp' | 'status'>
): OfflineOrderInquiry {
  const newInquiry: OfflineOrderInquiry = {
    ...inquiryData,
    id: `inq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    status: 'queued'
  };

  const currentQueue = getOfflineInquiries();
  const updatedQueue = [newInquiry, ...currentQueue];
  saveOfflineInquiries(updatedQueue);

  // Notify Service Worker if active
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'QUEUE_ORDER_INQUIRY',
      inquiry: newInquiry
    });
  }

  return newInquiry;
}

/**
 * Synchronize all pending queued inquiries once connectivity is restored
 */
export async function syncOfflineInquiries(
  onItemSynced?: (item: OfflineOrderInquiry) => void
): Promise<{ syncedCount: number; syncedItems: OfflineOrderInquiry[] }> {
  const queue = getOfflineInquiries();
  const pending = queue.filter(item => item.status === 'queued' || item.status === 'syncing');

  if (pending.length === 0) {
    return { syncedCount: 0, syncedItems: [] };
  }

  // Mark pending as syncing
  const markedSyncing = queue.map(item => 
    item.status === 'queued' ? { ...item, status: 'syncing' as const } : item
  );
  saveOfflineInquiries(markedSyncing);

  // Simulate network synchronization roundtrip
  await new Promise(resolve => setTimeout(resolve, 800));

  const syncedItems: OfflineOrderInquiry[] = [];
  const updatedQueue = queue.map(item => {
    if (item.status === 'queued' || item.status === 'syncing') {
      const synced: OfflineOrderInquiry = {
        ...item,
        status: 'synced',
        syncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reconciledStatus: 'in_transit',
        reconciledEta: '6-8 mins'
      };
      syncedItems.push(synced);
      if (onItemSynced) {
        onItemSynced(synced);
      }
      return synced;
    }
    return item;
  });

  saveOfflineInquiries(updatedQueue);

  // Dispatch custom event for UI banners and toasts
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tuxi-offline-sync-completed', {
        detail: {
          syncedCount: syncedItems.length,
          syncedItems
        }
      })
    );
  }

  return { syncedCount: syncedItems.length, syncedItems };
}

export function clearSyncedInquiries() {
  const queue = getOfflineInquiries();
  const remaining = queue.filter(item => item.status !== 'synced');
  saveOfflineInquiries(remaining);
}

/**
 * Register Service Worker at root scope
 */
export async function registerTuxiServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers not supported by this browser/runtime');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });

    console.log('[SW] TUXI Service Worker registered successfully at scope:', registration.scope);

    // Listen for background sync messages from SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'BACKGROUND_SYNC_TRIGGERED') {
        console.log('[SW] Background sync triggered by Service Worker');
        syncOfflineInquiries();
      }
    });

    return registration;
  } catch (error) {
    console.warn('[SW] Service worker registration failed:', error);
    return null;
  }
}

// Window global network event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyConnectivityListeners();
    console.log('[Network] Browser came back online. Auto-synchronizing offline inquiries...');
    syncOfflineInquiries();
  });

  window.addEventListener('offline', () => {
    notifyConnectivityListeners();
    console.log('[Network] Browser went offline. Inquiries will queue locally.');
  });
}
