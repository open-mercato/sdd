import test from 'node:test'; import assert from 'node:assert/strict';
import { createCompany, listCompanies, updateCompany } from '../src/companies/service.js';
import { ctxFor, reset } from './helpers.js';

test('companies are scoped to their organization', () => {
  reset();
  createCompany(ctxFor('org1'), { name: 'Acme', taxId: 'PL1234567890' });
  assert.equal(listCompanies(ctxFor('org2')).length, 0);
  assert.equal(listCompanies(ctxFor('org1')).length, 1);
});
test('name is required', () => {
  reset();
  assert.throws(() => createCompany(ctxFor('org1'), { name: ' ' }), { field: 'name' });
});
test('viewer cannot create', () => {
  reset();
  assert.throws(() => createCompany(ctxFor('org1', 'viewer'), { name: 'X' }), { status: 403 });
});
test('update keeps organization and id', () => {
  reset();
  const c = createCompany(ctxFor('org1'), { name: 'Acme' });
  const u = updateCompany(ctxFor('org1'), c.id, { name: 'Acme 2', organizationId: 'org2' });
  assert.equal(u.organizationId, 'org1');
  assert.throws(() => updateCompany(ctxFor('org2'), c.id, { name: 'x' }), { status: 404 });
});
