import test from 'node:test'; import assert from 'node:assert/strict';
import { createCompany } from '../src/companies/service.js';
import { createOrder, changeOrderStatus, listOrders } from '../src/orders/service.js';
import { handle } from '../src/routes.js';
import { ctxFor, reset } from './helpers.js';

test('status follows allowed transitions', () => {
  reset();
  const ctx = ctxFor('org1');
  const c = createCompany(ctx, { name: 'Acme' });
  const o = createOrder(ctx, { companyId: c.id, total: 10 });
  assert.equal(changeOrderStatus(ctx, o.id, 'confirmed').status, 'confirmed');
  assert.throws(() => changeOrderStatus(ctx, o.id, 'delivered'), { field: 'status' });
});
test('orders of another organization are not found', () => {
  reset();
  const c = createCompany(ctxFor('org1'), { name: 'Acme' });
  const o = createOrder(ctxFor('org1'), { companyId: c.id });
  assert.equal(handle('POST /orders/:id/status', ctxFor('org2'), { params: { id: o.id }, body: { status: 'confirmed' } }).status, 404);
  assert.equal(listOrders(ctxFor('org2')).length, 0);
});
