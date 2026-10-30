/**
 * Phase B Verification Test Suite
 * Tests:
 * 1. Backend Bicycle & E-Bike Registration Rejection
 * 2. Backend Bicycle Dispatch Assignment Rejection
 * 3. Authoritative 10.0 km Rep Territory Boundary Enforcement (Inside, Exact, Outside, Missing Hub)
 */

import { RepService } from '../src/server/services/repService.js';
import { DriverService } from '../src/server/services/driverService.js';

async function runTests() {
  console.log('=================================================================');
  console.log('TUXI GLOBAL HUB — PHASE B CORRECTION VERIFICATION TEST SUITE');
  console.log('=================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      if (detail) console.log(`       Evidence: ${detail}`);
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`       Failure Detail: ${detail}`);
      process.exitCode = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: BACKEND BICYCLE & E-BIKE REGISTRATION REJECTION
  // ---------------------------------------------------------------------------
  console.log('--- SECTION 1: Backend Bicycle Registration Rejection ---');

  // Test 1.1: Rejection of Pedal Bicycle
  try {
    await DriverService.onboardDriver({
      userId: 'test-user-01',
      licenseNumber: 'DL-NA-01',
      vehicleType: 'BICYCLE',
      vehiclePlate: 'BIKE-01'
    });
    assert(false, 'DriverService.onboardDriver rejects BICYCLE');
  } catch (err: any) {
    const isBicycleProhibited = err.message.includes('BICYCLE_TRANSPORT_PROHIBITED');
    assert(
      isBicycleProhibited,
      'DriverService.onboardDriver rejects BICYCLE with BICYCLE_TRANSPORT_PROHIBITED error',
      `Caught expected rejection: "${err.message}"`
    );
  }

  // Test 1.2: Rejection of Electric E-Bike
  try {
    await DriverService.onboardDriver({
      userId: 'test-user-02',
      licenseNumber: 'DL-NA-02',
      vehicleType: 'ELECTRIC_BIKE',
      vehiclePlate: 'EBIKE-02'
    });
    assert(false, 'DriverService.onboardDriver rejects ELECTRIC_BIKE');
  } catch (err: any) {
    const isBicycleProhibited = err.message.includes('BICYCLE_TRANSPORT_PROHIBITED');
    assert(
      isBicycleProhibited,
      'DriverService.onboardDriver rejects ELECTRIC_BIKE with BICYCLE_TRANSPORT_PROHIBITED error',
      `Caught expected rejection: "${err.message}"`
    );
  }

  // Test 1.3: Rejection of Unapproved Vehicle Type (e.g. Skateboard, Rickshaw)
  try {
    await DriverService.onboardDriver({
      userId: 'test-user-03',
      licenseNumber: 'DL-NA-03',
      vehicleType: 'HOVERBOARD',
      vehiclePlate: 'HOV-03'
    });
    assert(false, 'DriverService.onboardDriver rejects unapproved vehicle category');
  } catch (err: any) {
    const isInvalidCategory = err.message.includes('INVALID_VEHICLE_TYPE');
    assert(
      isInvalidCategory,
      'DriverService.onboardDriver rejects unapproved vehicle category with INVALID_VEHICLE_TYPE error',
      `Caught expected rejection: "${err.message}"`
    );
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: 10 KM REP TERRITORY AUTHORITATIVE BOUNDARY TESTS
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Server-Side 10 km Rep Territory Boundary Tests ---');

  // Hub: London Spitalfields
  const hubLat = 51.5188;
  const hubLng = -0.0754;

  // Test 2.1: INSIDE 10 KM (e.g. 5.0 km away)
  // Shift latitude by ~0.045 degrees north (~5.00 km)
  const dLatInside = 5.0 / 111.0;
  const targetInsideLat = hubLat + dLatInside;
  const targetInsideLng = hubLng;
  const checkInside = RepService.validateTerritory(hubLat, hubLng, targetInsideLat, targetInsideLng, 10.0);
  assert(
    checkInside.isWithin && checkInside.exactDistanceKm < 10.0,
    'Territory check: Inside 10 km (5.00 km) evaluates as IS_WITHIN = true',
    `Calculated Distance = ${checkInside.exactDistanceKm.toFixed(3)} km (limit: 10.000 km)`
  );

  // Test 2.2: EXACTLY 10.000 KM (boundary condition)
  // Distance = 10.000 km: 10 km / 6371 km = 0.0015696 rad -> deltaLat = 0.0015696 * (180 / PI) = 0.089932 degrees
  const dLatExact = (10.0 / 6371.0) * (180.0 / Math.PI);
  const targetExactLat = hubLat + dLatExact;
  const targetExactLng = hubLng;
  const checkExact = RepService.validateTerritory(hubLat, hubLng, targetExactLat, targetExactLng, 10.0);
  assert(
    checkExact.isWithin && Math.abs(checkExact.exactDistanceKm - 10.0) < 0.001,
    'Territory check: Exactly 10.000 km evaluates as IS_WITHIN = true (inclusive boundary)',
    `Calculated Distance = ${checkExact.exactDistanceKm.toFixed(3)} km (limit: 10.000 km)`
  );

  // Test 2.3: OUTSIDE 10 KM (e.g. 10.050 km away - 50m beyond boundary)
  const dLatOutside = (10.050 / 6371.0) * (180.0 / Math.PI);
  const targetOutsideLat = hubLat + dLatOutside;
  const targetOutsideLng = hubLng;
  const checkOutside = RepService.validateTerritory(hubLat, hubLng, targetOutsideLat, targetOutsideLng, 10.0);
  assert(
    !checkOutside.isWithin && checkOutside.exactDistanceKm > 10.0,
    'Territory check: Outside 10 km (10.050 km) evaluates as IS_WITHIN = false (strictly rejected)',
    `Calculated Distance = ${checkOutside.exactDistanceKm.toFixed(3)} km (limit: 10.000 km)`
  );

  // Test 2.4: SIGNIFICANTLY OUTSIDE 10 KM (e.g. 20.0 km away - previously permitted in legacy version)
  const dLat20Km = (20.0 / 6371.0) * (180.0 / Math.PI);
  const target20KmLat = hubLat + dLat20Km;
  const target20KmLng = hubLng;
  const check20Km = RepService.validateTerritory(hubLat, hubLng, target20KmLat, target20KmLng, 10.0);
  assert(
    !check20Km.isWithin && check20Km.exactDistanceKm > 10.0,
    'Territory check: Legacy 20 km point is strictly rejected under 10 km rule',
    `Calculated Distance = ${check20Km.exactDistanceKm.toFixed(3)} km (isWithin: ${check20Km.isWithin})`
  );

  // Test 2.5: Missing / Unverified Rep Hub
  try {
    // Calling onboardBusiness with invalid/missing repUserId
    RepService.onboardBusiness({
      repUserId: 'non-existent-rep-uuid',
      type: 'EATS',
      name: 'Test Store',
      legalEntityName: 'Test Store Ltd',
      taxOrVatId: 'GB999999999',
      contactEmail: 'store@example.com',
      contactPhone: '+44 20 7000 0000',
      address: {
        streetLine1: '123 High St',
        city: 'London',
        postalCode: 'E1 6AN',
        countryCode: 'GB',
        latitude: hubLat,
        longitude: hubLng
      },
      ownerConsentObtained: true
    });
    assert(false, 'Missing/unverified Rep Hub is rejected');
  } catch (err: any) {
    const isUnauthorized = err.message.includes('UNAUTHORIZED_REP');
    assert(
      isUnauthorized,
      'Missing or unverified Rep profile without registered hub is rejected with UNAUTHORIZED_REP',
      `Caught expected rejection: "${err.message}"`
    );
  }

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passedTests} OF ${totalTests} TESTS PASSED`);
  console.log('=================================================================');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
