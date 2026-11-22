import { reset } from '../src/lib/store.js';
export const ctxFor = (organizationId, role = 'admin') => ({ organizationId, user: { id: `u_${organizationId}_${role}`, role } });
export { reset };
