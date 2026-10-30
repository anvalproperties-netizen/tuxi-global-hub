import { 
  AllowedVehicleClass, 
  RequiredVehicleClass, 
  OrderPayloadLineSnapshot 
} from '../../types/index.js';

export interface RawProductAttributes {
  weight_grams?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  is_bulk?: boolean | number;
  is_wholesale?: boolean | number;
}

export interface RawVariantAttributes {
  weight_grams?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  is_bulk?: boolean | number | null;
  is_wholesale?: boolean | number | null;
}

export interface ResolvedPhysicalAttributes {
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  isBulk: boolean;
  isWholesale: boolean;
  isFullySpecified: boolean;
}

/**
 * Server-authoritative resolution of physical attributes from product and variant.
 * Implements strict three-state override logic for is_bulk and is_wholesale,
 * where null in variant means inherit from product, but explicit boolean false is preserved.
 */
export function resolvePhysicalAttributes(
  product: RawProductAttributes,
  variant?: RawVariantAttributes | null
): ResolvedPhysicalAttributes {
  // 1. Resolve Weight
  const weightGrams = (variant?.weight_grams !== undefined && variant?.weight_grams !== null)
    ? variant.weight_grams
    : (product.weight_grams ?? null);

  // 2. Resolve Dimensions (triplet must be complete on variant to override)
  const hasVariantTriplet = variant?.length_cm != null && variant?.width_cm != null && variant?.height_cm != null;
  const hasProductTriplet = product.length_cm != null && product.width_cm != null && product.height_cm != null;

  let lengthCm: number | null = null;
  let widthCm: number | null = null;
  let heightCm: number | null = null;

  if (hasVariantTriplet) {
    lengthCm = Number(variant!.length_cm);
    widthCm = Number(variant!.width_cm);
    heightCm = Number(variant!.height_cm);
  } else if (hasProductTriplet) {
    lengthCm = Number(product.length_cm);
    widthCm = Number(product.width_cm);
    heightCm = Number(product.height_cm);
  }

  // 3. Resolve 3-State Flags (distinguish explicit false from undefined/null inherit)
  const isBulk = (variant?.is_bulk !== undefined && variant?.is_bulk !== null)
    ? Boolean(variant.is_bulk)
    : Boolean(product.is_bulk);

  const isWholesale = (variant?.is_wholesale !== undefined && variant?.is_wholesale !== null)
    ? Boolean(variant.is_wholesale)
    : Boolean(product.is_wholesale);

  const isFullySpecified = weightGrams !== null && lengthCm !== null && widthCm !== null && heightCm !== null;

  return {
    weightGrams,
    lengthCm,
    widthCm,
    heightCm,
    isBulk,
    isWholesale,
    isFullySpecified
  };
}

export interface OrderItemInput {
  itemId: string;
  variantId?: string | null;
  sku: string;
  name: string;
  quantity: number;
  product: RawProductAttributes;
  variant?: RawVariantAttributes | null;
}

export interface CalculatedPayloadResult {
  assessmentStatus: 'VERIFIED_COMPLETE' | 'UNASSESSED_MISSING_ATTRIBUTES';
  knownWeightGrams: number;
  unknownItemCount: number;
  totalActualWeightGrams: number | null;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  totalVolumeCm3: number | null;
  parcelCount: number;
  hasBulkItem: boolean;
  hasWholesaleItem: boolean;
  hasUnspecifiedAttributes: boolean;
  eligibleVehicleClasses: AllowedVehicleClass[];
  requiredVehicleClass: RequiredVehicleClass;
  lineSnapshots: OrderPayloadLineSnapshot[];
}

/**
 * Calculates authoritative order payload assessment across all line items.
 * Upholds:
 * 1. Truth in incomplete data: totalActualWeightGrams is strictly NULL if any item is unknown.
 * 2. Inclusive 15kg threshold: items or total >= 15kg require BAKKIE.
 * 3. Inclusive 40kg threshold: total >= 40kg requires BAKKIE_VERIFIED_HEAVY.
 * 4. Bicycles and e-bikes strictly prohibited.
 * 5. Wholesale decoupled from bulk.
 * 6. Unknown physical attributes block automatic vehicle assignment.
 */
export function calculateOrderPayloadAssessment(items: OrderItemInput[]): CalculatedPayloadResult {
  let knownWeightGrams = 0;
  let unknownItemCount = 0;
  let hasBulkItem = false;
  let hasWholesaleItem = false;
  let hasUnspecifiedAttributes = false;

  let maxLengthCm: number | null = null;
  let maxWidthCm: number | null = null;
  let maxHeightCm: number | null = null;
  let totalVolumeCm3: number | null = null;

  const lineSnapshots: OrderPayloadLineSnapshot[] = [];
  let parcelCount = 0;

  for (const item of items) {
    const qty = Math.max(1, item.quantity || 1);
    const resolved = resolvePhysicalAttributes(item.product, item.variant);

    if (resolved.isBulk) hasBulkItem = true;
    if (resolved.isWholesale) hasWholesaleItem = true;

    if (!resolved.isFullySpecified) {
      hasUnspecifiedAttributes = true;
      unknownItemCount += qty;
    }

    let lineTotalWeight: number | null = null;
    if (resolved.weightGrams !== null) {
      const lineGrams = resolved.weightGrams * qty;
      knownWeightGrams += lineGrams;
      lineTotalWeight = lineGrams;

      // Standalone parcel count: heavy items (>=15kg) or oversized (>60cm) form separate parcels
      if (resolved.weightGrams >= 15000 || (resolved.lengthCm && resolved.lengthCm > 60)) {
        parcelCount += qty;
      } else {
        parcelCount += Math.ceil(qty / 3); // standard small consolidation
      }
    } else {
      parcelCount += qty;
    }

    if (resolved.lengthCm !== null && resolved.widthCm !== null && resolved.heightCm !== null) {
      maxLengthCm = maxLengthCm === null ? resolved.lengthCm : Math.max(maxLengthCm, resolved.lengthCm);
      maxWidthCm = maxWidthCm === null ? resolved.widthCm : Math.max(maxWidthCm, resolved.widthCm);
      maxHeightCm = maxHeightCm === null ? resolved.heightCm : Math.max(maxHeightCm, resolved.heightCm);

      const itemVol = resolved.lengthCm * resolved.widthCm * resolved.heightCm * qty;
      totalVolumeCm3 = (totalVolumeCm3 || 0) + itemVol;
    }

    lineSnapshots.push({
      itemId: item.itemId,
      variantId: item.variantId || null,
      sku: item.sku,
      name: item.name,
      quantity: qty,
      unitWeightGrams: resolved.weightGrams,
      unitLengthCm: resolved.lengthCm,
      unitWidthCm: resolved.widthCm,
      unitHeightCm: resolved.heightCm,
      isBulk: resolved.isBulk,
      isWholesale: resolved.isWholesale,
      lineTotalWeightGrams: lineTotalWeight,
      hasUnspecifiedAttributes: !resolved.isFullySpecified
    });
  }

  // Ensure parcelCount is at least 1
  parcelCount = Math.max(1, parcelCount);

  // If ANY item has unknown attributes, total weight MUST be null
  const totalActualWeightGrams = unknownItemCount === 0 ? knownWeightGrams : null;

  // Determine Transport Class Eligibility
  let requiredVehicleClass: RequiredVehicleClass;
  let eligibleVehicleClasses: AllowedVehicleClass[] = [];

  if (unknownItemCount > 0 || totalActualWeightGrams === null) {
    // Rule: Unknown physical attributes prohibit automatic assignment to every vehicle category
    requiredVehicleClass = 'MANUAL_ASSESSMENT';
    eligibleVehicleClasses = [];
  } else if (totalActualWeightGrams >= 40000) {
    // Inclusive 40kg boundary: requires verified vehicle capacity
    requiredVehicleClass = 'BAKKIE_VERIFIED_HEAVY';
    eligibleVehicleClasses = ['BAKKIE'];
  } else if (
    totalActualWeightGrams >= 15000 || 
    hasBulkItem || 
    items.some(i => {
      const res = resolvePhysicalAttributes(i.product, i.variant);
      return res.weightGrams !== null && res.weightGrams >= 15000;
    })
  ) {
    // Inclusive 15kg boundary OR bulk: requires commercial bakkie/light truck
    requiredVehicleClass = 'BAKKIE';
    eligibleVehicleClasses = ['BAKKIE'];
  } else {
    // Payload is < 15,000 g and not bulk
    const isSmallParcel = 
      totalActualWeightGrams <= 5000 &&
      (maxLengthCm === null || maxLengthCm <= 40.0) &&
      (maxWidthCm === null || maxWidthCm <= 40.0) &&
      (maxHeightCm === null || maxHeightCm <= 40.0) &&
      (totalVolumeCm3 === null || totalVolumeCm3 <= 25000) &&
      parcelCount <= 2;

    if (isSmallParcel) {
      // Eligible for Motorcycle, Car, or Bakkie
      requiredVehicleClass = 'MOTORCYCLE';
      eligibleVehicleClasses = ['MOTORCYCLE', 'CAR', 'BAKKIE'];
    } else {
      // Exceeds motorcycle capacity (mass > 5kg or dims > 40cm or parcels > 2)
      // Motorcycle strictly prohibited; eligible for Car or Bakkie
      requiredVehicleClass = 'CAR';
      eligibleVehicleClasses = ['CAR', 'BAKKIE'];
    }
  }

  return {
    assessmentStatus: unknownItemCount === 0 ? 'VERIFIED_COMPLETE' : 'UNASSESSED_MISSING_ATTRIBUTES',
    knownWeightGrams,
    unknownItemCount,
    totalActualWeightGrams,
    maxLengthCm,
    maxWidthCm,
    maxHeightCm,
    totalVolumeCm3,
    parcelCount,
    hasBulkItem,
    hasWholesaleItem,
    hasUnspecifiedAttributes,
    eligibleVehicleClasses,
    requiredVehicleClass,
    lineSnapshots
  };
}
