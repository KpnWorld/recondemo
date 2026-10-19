import { db } from "./db";
import type { Tx } from "./db";

/**
 * Typed application settings stored in the Setting table. Defaults deliberately
 * leave business details and fees EMPTY: they must be entered by an administrator
 * rather than invented.
 */
export type Settings = {
  business: {
    legalName: string;
    address: string;
    supportPhone: string;
    supportEmail: string;
    supportHours: string;
    serviceAreaSummary: string;
  };
  legal: {
    privacyPolicy: string;
    terms: string;
    cancellationPolicy: string;
    refundPolicy: string;
    providerRequirements: string;
    paymentDisclosures: string;
  };
  dispatch: {
    autoDispatch: boolean;
    offerBatchSize: number;
    offerTimeoutSeconds: number;
    maxRounds: number;
    maxRadiusMiles: number;
    useReliability: boolean;
  };
  cancellation: {
    /** Fee charged when a customer cancels after a provider was assigned. null = not configured. */
    feeAfterAssignmentCents: number | null;
    freeCancellationMinutes: number;
  };
  payments: {
    platformFeeBps: number | null;
    requireAuthorizationBeforeDispatch: boolean;
    currency: string;
  };
  pricing: { revisionApprovalThresholdCents: number };
  retention: { locationDataDays: number };
  referral: { enabled: boolean; rewardDescription: string };
};

export const DEFAULT_SETTINGS: Settings = {
  business: {
    legalName: "",
    address: "",
    supportPhone: "",
    supportEmail: "",
    supportHours: "",
    serviceAreaSummary: "",
  },
  legal: {
    privacyPolicy: "",
    terms: "",
    cancellationPolicy: "",
    refundPolicy: "",
    providerRequirements: "",
    paymentDisclosures: "",
  },
  dispatch: {
    autoDispatch: true,
    offerBatchSize: 3,
    offerTimeoutSeconds: 120,
    maxRounds: 3,
    maxRadiusMiles: 40,
    useReliability: true,
  },
  cancellation: { feeAfterAssignmentCents: null, freeCancellationMinutes: 0 },
  payments: {
    platformFeeBps: null,
    requireAuthorizationBeforeDispatch: true,
    currency: "usd",
  },
  pricing: { revisionApprovalThresholdCents: 0 },
  retention: { locationDataDays: 90 },
  referral: { enabled: false, rewardDescription: "" },
};

export type SettingsSection = keyof Settings;

export async function getSettings(tx: Tx = db): Promise<Settings> {
  const rows = await tx.setting.findMany();
  const out = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
  for (const row of rows) {
    if (!(row.key in out)) continue;
    try {
      out[row.key] = { ...(out[row.key] as object), ...JSON.parse(row.value) };
    } catch {
      /* keep default */
    }
  }
  return out as Settings;
}

export async function saveSettingsSection<K extends SettingsSection>(key: K, value: Settings[K], updatedById: string, tx: Tx = db) {
  await tx.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value), updatedById },
    update: { value: JSON.stringify(value), updatedById },
  });
}
