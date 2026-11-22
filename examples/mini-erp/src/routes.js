// HTTP surface. Each route maps to one service call; errors carry their own status.
import * as companies from './companies/service.js';
import * as orders from './orders/service.js';

export const routes = {
  'GET /companies': (ctx) => companies.listCompanies(ctx),
  'POST /companies': (ctx, req) => companies.createCompany(ctx, req.body),
  'PATCH /companies/:id': (ctx, req) => companies.updateCompany(ctx, req.params.id, req.body),
  'GET /orders': (ctx, req) => orders.listOrders(ctx, req.query),
  'POST /orders': (ctx, req) => orders.createOrder(ctx, req.body),
  'POST /orders/:id/status': (ctx, req) => orders.changeOrderStatus(ctx, req.params.id, req.body.status),
};

export function handle(route, ctx, req = {}) {
  const handler = routes[route];
  if (!handler) return { status: 404, body: { error: 'Not found' } };
  try {
    return { status: 200, body: handler(ctx, { body: {}, params: {}, query: {}, ...req }) };
  } catch (err) {
    const body = { error: err.message };
    if (err.field) { body.field = err.field; body.code = err.code; }
    return { status: err.status || 500, body };
  }
}
