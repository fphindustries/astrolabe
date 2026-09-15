import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StubProvider } from '../ai/stub.js';

import { buildApp } from './app.js';

/** D-154: the built client from the same address as the API. No database needed. */
describe('serving the web client (10.5, D-154)', () => {
  let root: string;
  const app = () =>
    buildApp({
      sql: {} as Sql,
      ai: new StubProvider(),
      checker: new StubProvider(),
      webRoot: root,
    });

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'astrolabe-web-'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><div id="root"></div>');
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets', 'index-abc123.js'), 'console.log(1);');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('serves index.html at the root and for client routes', async () => {
    const server = app();
    for (const url of ['/', '/campaigns/0190', '/campaigns/new']) {
      const response = await server.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<div id="root">');
    }
    await server.close();
  });

  it('serves fingerprinted assets with a long cache', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('immutable');
    await server.close();
  });

  it('keeps an unknown API path a 404, not the app', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: '/api/nothing-here' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ statusCode: 404 });
    await server.close();
  });

  it('serves nothing but the API without a web root', async () => {
    const server = buildApp({
      sql: {} as Sql,
      ai: new StubProvider(),
      checker: new StubProvider(),
    });
    const response = await server.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(404);
    await server.close();
  });
});
