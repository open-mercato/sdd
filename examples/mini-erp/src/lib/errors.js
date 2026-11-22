export class FieldError extends Error {
  constructor(field, code, message) { super(message); this.name = 'FieldError'; this.field = field; this.code = code; this.status = 422; }
}
export class NotFoundError extends Error {
  constructor(message = 'Not found') { super(message); this.name = 'NotFoundError'; this.status = 404; }
}
export class ForbiddenError extends Error {
  constructor(feature) { super('Forbidden'); this.name = 'ForbiddenError'; this.feature = feature; this.status = 403; }
}
