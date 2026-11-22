// Features are granted per role. Every service entry point checks its feature with requireFeature.
import { ForbiddenError } from './errors.js';

export const FEATURES = {
  'companies.view': ['admin', 'sales', 'viewer'],
  'companies.manage': ['admin', 'sales'],
  'orders.view': ['admin', 'sales', 'viewer'],
  'orders.manage': ['admin', 'sales'],
};

export function requireFeature(ctx, feature) {
  if (!ctx || !ctx.user) throw new ForbiddenError(feature);
  const roles = FEATURES[feature];
  if (!roles || !roles.includes(ctx.user.role)) throw new ForbiddenError(feature);
}
