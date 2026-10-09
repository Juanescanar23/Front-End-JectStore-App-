import { TenantPlan } from "@/types/cod";

const COD_ENABLED_PLANS = new Set(["emprendedor", "mipyme"]);

export function normalizePlanName(value?: string | null): TenantPlan {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "basic";
  return normalized;
}

export function isCodFeatureEnabledForPlan(value?: string | null): boolean {
  return COD_ENABLED_PLANS.has(normalizePlanName(value));
}

export function resolvePlanFromPayload(
  payload: unknown,
  fallbackPlan: TenantPlan,
): TenantPlan {
  if (!payload || typeof payload !== "object") {
    return normalizePlanName(fallbackPlan);
  }

  const unsafe = payload as Record<string, unknown>;
  const candidates = [
    unsafe.plan_name,
    unsafe.plan,
    unsafe.tenant_plan,
    unsafe.subscription_plan,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return normalizePlanName(candidate);
    }
  }

  return normalizePlanName(fallbackPlan);
}

export function resolveAllowedByPlan(
  payload: unknown,
  fallbackPlan: TenantPlan,
): { plan: TenantPlan; allowed: boolean } {
  const plan = resolvePlanFromPayload(payload, fallbackPlan);

  if (payload && typeof payload === "object") {
    const unsafe = payload as Record<string, unknown>;
    if (typeof unsafe.allowed_by_plan === "boolean") {
      return { plan, allowed: unsafe.allowed_by_plan };
    }
  }

  return {
    plan,
    allowed: isCodFeatureEnabledForPlan(plan),
  };
}
