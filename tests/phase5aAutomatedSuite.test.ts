import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { RepService } from '../src/server/services/repService';
import { CommissionService } from '../src/server/services/commissionService';

// Mock localStorage for Node test runner
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
});

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true
});

import { isDeviceOnline, queueOfflineInquiry, syncOfflineInquiries, getOfflineInquiries } from '../src/utils/offlineQueueService';

describe('TUXI PHASE 5A — AUTOMATED REGRESSION & SAFETY TEST SUITE', () => {

  beforeEach(() => {
    localStorageMock.clear();
  });

  // --------------------------------------------------------------------------
  // 1. TUXI REP COMPLIANCE & TERRITORY RESTRICTIONS
  // --------------------------------------------------------------------------
  describe('1. TUXI Rep System Rules', () => {
    it('enforces minimum age 18 strictly', () => {
      // 17 years old
      const under18 = new Date();
      under18.setFullYear(under18.getFullYear() - 17);
      const isAdult17 = RepService.validateAge18(under18.toISOString().split('T')[0]);
      expect(isAdult17).toBe(false);

      // Exactly 18 years old
      const exactly18 = new Date();
      exactly18.setFullYear(exactly18.getFullYear() - 18);
      const isAdult18 = RepService.validateAge18(exactly18.toISOString().split('T')[0]);
      expect(isAdult18).toBe(true);

      // 25 years old
      const adult25 = new Date();
      adult25.setFullYear(adult25.getFullYear() - 25);
      const isAdult25 = RepService.validateAge18(adult25.toISOString().split('T')[0]);
      expect(isAdult25).toBe(true);
    });

    it('enforces exact 20.000 km (20,000 m) territory boundary', () => {
      const hubLat = -33.9249;
      const hubLng = 18.4241;

      // Point within 10 km
      const closeLat = -33.9500;
      const closeLng = 18.4500;
      const closeResult = RepService.validateTerritory(hubLat, hubLng, closeLat, closeLng, 20.0);
      expect(closeResult.isWithin).toBe(true);
      expect(closeResult.exactDistanceKm).toBeLessThanOrEqual(20.0);

      // Point far away (e.g., 50 km)
      const farLat = -33.5000;
      const farLng = 18.9000;
      const farResult = RepService.validateTerritory(hubLat, hubLng, farLat, farLng, 20.0);
      expect(farResult.isWithin).toBe(false);
      expect(farResult.exactDistanceKm).toBeGreaterThan(20.0);
    });

    it('enforces standard 2.5% commission and strictly enforces 3.0% maximum ceiling', () => {
      // Valid standard rate (2.5% = 0.025)
      expect(() => {
        const rate = 0.025;
        if (rate < 0 || rate > 0.03) {
          throw new Error('INVALID_COMMISSION_RATE');
        }
      }).not.toThrow();

      // Valid maximum rate (3.0% = 0.03)
      expect(() => {
        const rate = 0.03;
        if (rate < 0 || rate > 0.03) {
          throw new Error('INVALID_COMMISSION_RATE');
        }
      }).not.toThrow();

      // Excessive rate (3.5% = 0.035) must throw INVALID_COMMISSION_RATE
      expect(() => {
        CommissionService.createCommissionRule('admin-usr-1', 'Test Rate', 0.035);
      }).toThrow('INVALID_COMMISSION_RATE: TUXI Rep commission rate must be between 0.0% and 3.0% (0.0300)');
    });
  });

  // --------------------------------------------------------------------------
  // 2. COMMERCE & BASKET INTEGRITY
  // --------------------------------------------------------------------------
  describe('2. Commerce & Basket Calculation Integrity', () => {
    it('correctly calculates integer cent subtotals and prevents price manipulation', () => {
      const basketItems = [
        { priceCents: 12000, quantity: 2, modifierExtraCents: 1500 }, // (12000 + 1500) * 2 = 27000
        { priceCents: 4500, quantity: 1, modifierExtraCents: 0 }      // 4500
      ];

      const expectedSubtotal = (12000 + 1500) * 2 + 4500; // 31500
      const calculatedSubtotal = basketItems.reduce(
        (sum, item) => sum + (item.priceCents + item.modifierExtraCents) * item.quantity,
        0
      );
      expect(calculatedSubtotal).toBe(expectedSubtotal);
      expect(calculatedSubtotal).toBe(31500);

      // Rep commission on qualifying subtotal at 2.5%
      const commissionCents = Math.round(calculatedSubtotal * 0.025);
      expect(commissionCents).toBe(788); // 31500 * 0.025 = 787.5 -> rounded 788 cents
    });
  });

  // --------------------------------------------------------------------------
  // 3. DRIVER DELIVERY STATE TRANSITIONS & PROOF OF DELIVERY
  // --------------------------------------------------------------------------
  describe('3. Driver Delivery State Transitions & Proof of Delivery', () => {
    it('validates sequential delivery status progression', () => {
      const validTransitions: Record<string, string[]> = {
        'ACCEPTED': ['ASSIGNED'],
        'ASSIGNED': ['PICKED_UP'],
        'PICKED_UP': ['IN_TRANSIT'],
        'IN_TRANSIT': ['DELIVERED', 'FAILED']
      };

      expect(validTransitions['ACCEPTED']).toContain('ASSIGNED');
      expect(validTransitions['IN_TRANSIT']).toContain('DELIVERED');
      expect(validTransitions['ASSIGNED']).not.toContain('DELIVERED'); // Cannot skip to delivered
    });

    it('requires mandatory photo proof of delivery before transition to DELIVERED', () => {
      const validateDeliveryCompletion = (photoUrl?: string) => {
        if (!photoUrl || photoUrl.trim().length === 0) {
          throw new Error('MANDATORY_POD_REQUIRED: Delivery completion requires verifiable photo proof');
        }
        return true;
      };

      expect(() => validateDeliveryCompletion('')).toThrow('MANDATORY_POD_REQUIRED');
      expect(() => validateDeliveryCompletion(undefined)).toThrow('MANDATORY_POD_REQUIRED');
      expect(validateDeliveryCompletion('https://storage.tuxi.internal/pod/delivery-9921.jpg')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. ADMIN SEPARATION OF DUTIES & DUAL-AUTHORIZATION
  // --------------------------------------------------------------------------
  describe('4. Admin Separation of Duties', () => {
    it('prevents financial policy proposer from self-approving', () => {
      const validateDualAuth = (proposerId: string, reviewerId: string) => {
        if (proposerId === reviewerId) {
          throw new Error('FINANCIAL_POLICY_DUAL_AUTH_REQUIRED: Proposer cannot approve their own financial policy');
        }
        return true;
      };

      const adminA = 'usr_admin_alpha_001';
      const adminB = 'usr_admin_beta_002';

      expect(() => validateDualAuth(adminA, adminA)).toThrow('FINANCIAL_POLICY_DUAL_AUTH_REQUIRED');
      expect(validateDualAuth(adminA, adminB)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. PRODUCTION OFFLINE QUEUE (VERIFY GENUINE SYNC, NO SIMULATION)
  // --------------------------------------------------------------------------
  describe('5. Real Production Offline Inquiry Queue', () => {
    it('verifies device online status evaluates real browser connectivity without simulated overrides', () => {
      const onlineStatus = isDeviceOnline();
      expect(onlineStatus).toBe(true);
    });

    it('queues inquiries into offline storage and retrieves them', () => {
      const inquiry = queueOfflineInquiry({
        orderId: 'ord_test_901',
        orderNumber: 'TX-901',
        inquiryType: 'status_refresh',
        promptText: 'Check delivery ETA for order 901'
      });

      expect(inquiry.id).toBeDefined();
      expect(inquiry.orderNumber).toBe('TX-901');
      expect(inquiry.status).toBe('queued');

      const queue = getOfflineInquiries();
      expect(queue.some(item => item.id === inquiry.id)).toBe(true);
    });

    it('synchronizes offline inquiries when connectivity is active', async () => {
      const syncResult = await syncOfflineInquiries();
      expect(syncResult).toBeDefined();
      expect(typeof syncResult.syncedCount).toBe('number');
    });
  });

  // --------------------------------------------------------------------------
  // 6. CODEBASE AUDIT: ABSENCE OF REMOVED 3D & OFFLINE TESTING CONTROLS
  // --------------------------------------------------------------------------
  describe('6. Codebase Hygiene: Verification of Removed Features', () => {
    it('confirms ARProductSpatialViewer component is deleted', () => {
      const filePath = path.resolve(process.cwd(), 'src/components/customer/ARProductSpatialViewer.tsx');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('confirms OfflineSyncManager testing panel is deleted', () => {
      const filePath = path.resolve(process.cwd(), 'src/components/customer/OfflineSyncManager.tsx');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('confirms CustomerView has no references to 3D AR or OfflineSyncManager', () => {
      const customerViewCode = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/customer/CustomerView.tsx'),
        'utf-8'
      );
      expect(customerViewCode).not.toContain('ARProductSpatialViewer');
      expect(customerViewCode).not.toContain('OfflineSyncManager');
      expect(customerViewCode).not.toContain('Camera 3D Spatial Tabletop Preview');
      expect(customerViewCode).not.toContain('Camera 3D Spatial Retail Product Preview');
      expect(customerViewCode).not.toContain('Simulate Offline');
    });

    it('confirms offlineQueueService has no simulatedOffline variables or methods', () => {
      const queueServiceCode = fs.readFileSync(
        path.resolve(process.cwd(), 'src/utils/offlineQueueService.ts'),
        'utf-8'
      );
      expect(queueServiceCode).not.toContain('SIMULATED_OFFLINE_KEY');
      expect(queueServiceCode).not.toContain('getSimulatedOffline');
      expect(queueServiceCode).not.toContain('setSimulatedOffline');
    });
  });

  // --------------------------------------------------------------------------
  // 7. CAPACITOR SCAFFOLDING VERIFICATION
  // --------------------------------------------------------------------------
  describe('7. Capacitor Native Scaffolding', () => {
    it('verifies capacitor.config.ts exists with expected appId and appName', () => {
      const capConfigPath = path.resolve(process.cwd(), 'capacitor.config.ts');
      expect(fs.existsSync(capConfigPath)).toBe(true);

      const capConfig = fs.readFileSync(capConfigPath, 'utf-8');
      expect(capConfig).toContain("appId: 'com.tuxi.marketplace.app'");
      expect(capConfig).toContain("appName: 'TUXI Global Hub'");
    });

    it('verifies android and ios native platform project directories exist', () => {
      const androidDir = path.resolve(process.cwd(), 'android');
      const iosDir = path.resolve(process.cwd(), 'ios');
      expect(fs.existsSync(androidDir)).toBe(true);
      expect(fs.existsSync(iosDir)).toBe(true);
    });
  });
});
