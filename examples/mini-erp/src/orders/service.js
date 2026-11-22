import { scoped } from '../lib/store.js';
import { requireFeature } from '../lib/acl.js';
import { FieldError, NotFoundError } from '../lib/errors.js';

export const STATUSES = ['draft', 'confirmed', 'shipped', 'delivered', 'cancelled'];
export const TRANSITIONS = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function listOrders(ctx, filter = {}) {
  requireFeature(ctx, 'orders.view');
  return scoped('orders', ctx.organizationId).list((o) => !filter.status || o.status === filter.status);
}

export function createOrder(ctx, input) {
  requireFeature(ctx, 'orders.manage');
  if (!input.companyId) throw new FieldError('companyId', 'required', 'Company is required');
  if (!scoped('companies', ctx.organizationId).get(input.companyId)) throw new FieldError('companyId', 'unknown', 'Unknown company');
  return scoped('orders', ctx.organizationId).insert({ companyId: input.companyId, total: Number(input.total) || 0, status: 'draft' });
}

export function changeOrderStatus(ctx, id, status) {
  requireFeature(ctx, 'orders.manage');
  const orders = scoped('orders', ctx.organizationId);
  const order = orders.get(id);
  if (!order) throw new NotFoundError();
  if (!TRANSITIONS[order.status].includes(status)) throw new FieldError('status', 'transition', `Cannot change ${order.status} to ${status}`);
  return orders.update(id, { status });
}
