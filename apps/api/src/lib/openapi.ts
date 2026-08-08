import { AppError } from './errors.js';

export type OpenApiDocument = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema> };
};

type Operation = { operationId?: string; summary?: string; description?: string; tags?: string[]; parameters?: Parameter[]; responses?: Record<string, unknown>; requestBody?: unknown };
type Parameter = { name: string; in: string; description?: string; required?: boolean; schema?: Schema };
type Schema = { type?: string; enum?: unknown[]; required?: string[]; properties?: Record<string, Schema> };
export type Change = { severity: 'BREAKING' | 'POTENTIALLY_BREAKING' | 'NON_BREAKING'; code: string; location: string; message: string };
export type ApiReferenceOperation = {
  method: string; path: string; operationId?: string; summary?: string; description?: string; tags: string[];
  parameters: Array<{ name: string; in: string; description?: string; required: boolean; schema?: Schema }>;
  hasRequestBody: boolean; responseCodes: string[];
};
export type GeneratedSmokeRequest = { name: string; method: 'GET'; path: string; expectedStatus: number };

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export function validateOpenApi(input: unknown): OpenApiDocument {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Specification must be a JSON object', 422, 'INVALID_OPENAPI');
  const document = input as Partial<OpenApiDocument>;
  if (!document.openapi?.startsWith('3.')) throw new AppError('Only OpenAPI 3.x specifications are supported', 422, 'INVALID_OPENAPI');
  if (!document.info?.title || !document.info.version) throw new AppError('Specification info.title and info.version are required', 422, 'INVALID_OPENAPI');
  if (!document.paths || typeof document.paths !== 'object') throw new AppError('Specification paths are required', 422, 'INVALID_OPENAPI');
  return document as OpenApiDocument;
}

function operations(document: OpenApiDocument) {
  return Object.entries(document.paths).flatMap(([path, item]) => Object.entries(item)
    .filter(([method]) => HTTP_METHODS.has(method.toLowerCase()))
    .map(([method, operation]) => ({ key: `${method.toUpperCase()} ${path}`, path, method, operation })));
}

function schemas(document: OpenApiDocument) { return document.components?.schemas ?? {}; }

export function buildApiReference(document: OpenApiDocument) {
  const reference = operations(document).map(({ path, method, operation }) => ({
    method: method.toUpperCase(), path, operationId: operation.operationId, summary: operation.summary, description: operation.description,
    tags: operation.tags ?? [], hasRequestBody: Boolean(operation.requestBody), responseCodes: Object.keys(operation.responses ?? {}).sort(),
    parameters: (operation.parameters ?? []).map(({ name, in: location, description, required, schema }) => ({ name, in: location, description, required: Boolean(required), schema }))
  } satisfies ApiReferenceOperation));
  return { title: document.info.title, apiVersion: document.info.version, operationCount: reference.length, operations: reference };
}

export function buildSmokeRequests(document: OpenApiDocument): GeneratedSmokeRequest[] {
  return buildApiReference(document).operations
    .filter((operation) => operation.method === 'GET' && !operation.path.includes('{'))
    .map((operation) => ({
      name: operation.summary ?? `GET ${operation.path}`,
      method: 'GET' as const,
      path: operation.path,
      expectedStatus: Number(operation.responseCodes.find((code) => /^2\d\d$/.test(code)) ?? 200),
    }));
}

export function diffOpenApi(before: OpenApiDocument, after: OpenApiDocument): Change[] {
  const changes: Change[] = [];
  const previous = new Map(operations(before).map((entry) => [entry.key, entry]));
  const next = new Map(operations(after).map((entry) => [entry.key, entry]));
  for (const [key, operation] of previous) {
    const candidate = next.get(key);
    if (!candidate) { changes.push({ severity: 'BREAKING', code: 'OPERATION_REMOVED', location: key, message: `${key} was removed` }); continue; }
    const oldResponses = operation.operation.responses ?? {};
    const newResponses = candidate.operation.responses ?? {};
    for (const status of Object.keys(oldResponses)) if (!(status in newResponses)) changes.push({ severity: 'BREAKING', code: 'RESPONSE_REMOVED', location: `${key} response ${status}`, message: `Response ${status} was removed from ${key}` });
    const oldParameters = operation.operation.parameters ?? [];
    const newParameters = candidate.operation.parameters ?? [];
    for (const parameter of oldParameters) {
      const changed = newParameters.find((nextParameter) => nextParameter.name === parameter.name && nextParameter.in === parameter.in);
      if (!changed) changes.push({ severity: 'BREAKING', code: 'PARAMETER_REMOVED', location: `${key} parameter ${parameter.in}.${parameter.name}`, message: `Parameter ${parameter.name} was removed` });
      else if (!parameter.required && changed.required) changes.push({ severity: 'BREAKING', code: 'PARAMETER_NOW_REQUIRED', location: `${key} parameter ${parameter.in}.${parameter.name}`, message: `Parameter ${parameter.name} is now required` });
    }
  }
  for (const key of next.keys()) if (!previous.has(key)) changes.push({ severity: 'NON_BREAKING', code: 'OPERATION_ADDED', location: key, message: `${key} was added` });
  const oldSchemas = schemas(before); const newSchemas = schemas(after);
  for (const [name, schema] of Object.entries(oldSchemas)) {
    const candidate = newSchemas[name];
    if (!candidate) { changes.push({ severity: 'BREAKING', code: 'SCHEMA_REMOVED', location: `schema ${name}`, message: `Schema ${name} was removed` }); continue; }
    for (const property of schema.required ?? []) if (!(candidate.required ?? []).includes(property)) continue;
    for (const property of candidate.required ?? []) if (!(schema.required ?? []).includes(property)) changes.push({ severity: 'BREAKING', code: 'PROPERTY_NOW_REQUIRED', location: `schema ${name}.${property}`, message: `Property ${property} is now required` });
  }
  return changes;
}
