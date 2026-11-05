import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
export const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
export const NOW = 1800000000;
export function loader(mocks = {}) {
  const cache = new Map();
  function load(relative, sourceOverride) {
    const target = resolve(root, relative);
    const file = [target, target + '.ts', target + '.tsx'].find(existsSync);
    if (!file) throw Error('Missing local source ' + relative);
    if (cache.has(file) && sourceOverride === undefined) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = sourceOverride ?? readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', output)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name] && typeof mocks[name] === 'object' && Object.hasOwn(mocks[name], 'default') ? { __esModule: true, ...mocks[name] } : mocks[name];
      if (name === 'server-only' || name.endsWith('.css')) return {};
      if (name.startsWith('.')) return load(resolve(dirname(file), name));
      for (const [prefix, replacement] of [['@/', 'src/'], ['@components/', 'src/components/'], ['@utils/', 'src/utils/']]) if (name.startsWith(prefix)) return load(replacement + name.slice(prefix.length));
      return require(name);
    }, module, module.exports);
    return module.exports;
  }
  return load;
}
export function snapshot(kind = 'published_next', now = NOW) {
  return {
    schema_version: 1, context: { tenant: 'synthetic-tenant', host: 'own.example.test', actor: 7, product: 12, channel: 'default', locale: 'es', preview_session: '11111111-1111-4111-8111-111111111111', nonce: 'a'.repeat(64) }, expires_at: now + 300,
    source: kind === 'legacy_next' ? { kind, revision_id: null, version: 0, public_projection_sha256: 'f'.repeat(64), fingerprint: 'c'.repeat(64) } : { kind, revision_id: 9, version: 2, checksum: 'f'.repeat(64), fingerprint: 'c'.repeat(64) },
    product_fingerprint: 'b'.repeat(64), purchase_disabled: true, currency: 'COP', selection_differs: false,
    product: { id: 12, type: 'simple', name: 'Producto sintético', short_description: 'Texto de prueba', description_html: '<p>Descripción <strong>local</strong>.</p>', price: { amount: '10000.0000', currency: 'COP' }, availability: { state: 'unknown', label: 'Disponibilidad por confirmar' }, media: [{ id: 1, src: '/storage/synthetic/product.png', alt: 'Foto sintética' }] },
    shell: { branding: { name: 'Tienda sintética', logo: null }, header: { items: [{ label: 'Todo' }], search_label: 'Buscar productos...', menu_source: kind === 'legacy_next' ? 'categories' : 'editorial' }, footer: { columns: [{ title: null, items: [{ label: 'Información' }] }], services: [], newsletter: { title: 'Boletín', text: 'Texto publicado de prueba', button_label: 'Suscribirme' }, copyright_text: 'Texto público de prueba' } },
  };
}
export function query(value = snapshot()) {
  const c = value.context;
  const parameters = { tenant: c.tenant, host: c.host, actor: c.actor, product: c.product, channel: c.channel, locale: c.locale, preview_session: c.preview_session, nonce: c.nonce, session: 'd'.repeat(64), product_fingerprint: value.product_fingerprint, source_kind: value.source.kind, source_fingerprint: value.source.fingerprint, expires: value.expires_at, signature: 'e'.repeat(64) };
  return Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + '=' + encodeURIComponent(value)).join('&');
}
export const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
