import { scoped } from '../lib/store.js';
import { requireFeature } from '../lib/acl.js';
import { FieldError, NotFoundError } from '../lib/errors.js';

function validate(input) {
  if (!input.name || !String(input.name).trim()) throw new FieldError('name', 'required', 'Name is required');
  if (input.taxId != null && typeof input.taxId !== 'string') throw new FieldError('taxId', 'invalid', 'Tax ID must be text');
}

export function listCompanies(ctx) {
  requireFeature(ctx, 'companies.view');
  return scoped('companies', ctx.organizationId).list();
}

export function createCompany(ctx, input) {
  requireFeature(ctx, 'companies.manage');
  validate(input);
  return scoped('companies', ctx.organizationId).insert({ name: input.name.trim(), taxId: input.taxId ?? null });
}

export function updateCompany(ctx, id, patch) {
  requireFeature(ctx, 'companies.manage');
  const companies = scoped('companies', ctx.organizationId);
  const current = companies.get(id);
  if (!current) throw new NotFoundError();
  const next = { ...current, ...patch };
  validate(next);
  return companies.update(id, { name: next.name.trim(), taxId: next.taxId ?? null });
}
