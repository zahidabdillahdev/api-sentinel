import { describe, expect, it } from 'vitest';
import { buildApiReference, buildSmokeRequests, diffOpenApi, validateOpenApi } from '../src/lib/openapi.js';

const baseline = {
  openapi: '3.0.3',
  info: { title: 'Pets', version: '1.0.0' },
  paths: {
    '/pets/{id}': {
      get: { parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'OK' }, '404': { description: 'Missing' } } }
    }
  },
  components: { schemas: { Pet: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } }
};

describe('OpenAPI validation', () => {
  it('rejects unsupported documents', () => {
    expect(() => validateOpenApi({ openapi: '2.0', info: {}, paths: {} })).toThrow('Only OpenAPI 3.x');
  });
});

describe('OpenAPI diff', () => {
  it('finds removed responses and newly required properties', () => {
    const next = structuredClone(baseline);
    delete next.paths['/pets/{id}'].get.responses['404'];
    next.components.schemas.Pet.required.push('name');
    const changes = diffOpenApi(validateOpenApi(baseline), validateOpenApi(next));
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RESPONSE_REMOVED', severity: 'BREAKING' }),
      expect.objectContaining({ code: 'PROPERTY_NOW_REQUIRED', severity: 'BREAKING' })
    ]));
  });

  it('does not mark a new operation as breaking', () => {
    const next = structuredClone(baseline);
    next.paths['/pets'] = { post: { responses: { '201': { description: 'Created' } } } };
    expect(diffOpenApi(validateOpenApi(baseline), validateOpenApi(next))).toContainEqual(expect.objectContaining({ code: 'OPERATION_ADDED', severity: 'NON_BREAKING' }));
  });
});

describe('API reference', () => {
  it('creates readable operation metadata from an OpenAPI document', () => {
    const reference = buildApiReference(validateOpenApi(baseline));
    expect(reference).toMatchObject({ title: 'Pets', apiVersion: '1.0.0', operationCount: 1 });
    expect(reference.operations[0]).toMatchObject({ method: 'GET', path: '/pets/{id}', responseCodes: ['200', '404'] });
    expect(reference.operations[0].parameters).toContainEqual(expect.objectContaining({ name: 'id', in: 'path', required: true }));
  });

  it('creates smoke requests only for GET paths without parameters', () => {
    const document = { ...baseline, paths: { '/health': { get: { summary: 'Health', responses: { '204': {} } } }, '/pets/{id}': baseline.paths['/pets/{id}'], '/pets': { post: { responses: { '201': {} } } } } };
    expect(buildSmokeRequests(validateOpenApi(document))).toEqual([{ name: 'Health', method: 'GET', path: '/health', expectedStatus: 204 }]);
  });
});
