#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import path from "node:path";

const DEFAULT_PROTOCOL = process.env.SMOKE_PROTOCOL || "https";
const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.SMOKE_TIMEOUT_MS || "15000",
  10,
);
const DEFAULT_CONFIG_FILE = process.env.SMOKE_TENANTS_FILE || "config/tenants.json";
const DEFAULT_STOREFRONT_KEY =
  process.env.SMOKE_STOREFRONT_KEY ||
  process.env.NEXT_PUBLIC_BAGISTO_STOREFRONT_KEY ||
  "default";

function printUsage() {
  console.log(`
Usage:
  npm run smoke:tenants -- --tenants cuki.jectstore.com,foo.jectstore.com
  npm run smoke:tenants -- --config config/tenants.json

Options:
  --tenants=<list>          Comma-separated tenant hosts.
  --tenant=<host>           Single tenant host (repeatable).
  --config=<file>           JSON config file path (default: config/tenants.json).
  --protocol=<https|http>   Request protocol (default: https).
  --storefront-key=<key>    GraphQL storefront key header value.
  --timeout-ms=<number>     Request timeout in milliseconds (default: 15000).
  --require-product         Fail if tenant has zero products.
  --help                    Show this help message.

Environment alternatives:
  SMOKE_TENANTS or TENANT_HOSTS
  SMOKE_TENANTS_FILE
  SMOKE_STOREFRONT_KEY
  SMOKE_PROTOCOL
  SMOKE_TIMEOUT_MS
`);
}

function parseArgs(argv) {
  const options = {
    tenants: [],
    configFile: DEFAULT_CONFIG_FILE,
    protocol: DEFAULT_PROTOCOL,
    storefrontKey: DEFAULT_STOREFRONT_KEY,
    timeoutMs: Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : 15000,
    requireProduct: false,
    help: false,
  };

  const positionalHosts = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--require-product") {
      options.requireProduct = true;
      continue;
    }

    if (arg.startsWith("--tenants=")) {
      options.tenants.push(...splitHosts(arg.slice("--tenants=".length)));
      continue;
    }

    if (arg.startsWith("--tenant=")) {
      options.tenants.push(...splitHosts(arg.slice("--tenant=".length)));
      continue;
    }

    if (arg.startsWith("--config=")) {
      options.configFile = arg.slice("--config=".length).trim() || DEFAULT_CONFIG_FILE;
      continue;
    }

    if (arg === "--config") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options.configFile = next.trim() || DEFAULT_CONFIG_FILE;
        i += 1;
      }
      continue;
    }

    if (arg.startsWith("--protocol=")) {
      options.protocol = arg.slice("--protocol=".length).trim() || DEFAULT_PROTOCOL;
      continue;
    }

    if (arg === "--protocol") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options.protocol = next.trim() || DEFAULT_PROTOCOL;
        i += 1;
      }
      continue;
    }

    if (arg.startsWith("--storefront-key=")) {
      options.storefrontKey =
        arg.slice("--storefront-key=".length).trim() || DEFAULT_STOREFRONT_KEY;
      continue;
    }

    if (arg === "--storefront-key") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options.storefrontKey = next.trim() || DEFAULT_STOREFRONT_KEY;
        i += 1;
      }
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      const parsed = Number.parseInt(arg.slice("--timeout-ms=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = parsed;
      }
      continue;
    }

    if (arg === "--timeout-ms") {
      const next = argv[i + 1];
      const parsed = Number.parseInt(next || "", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = parsed;
        i += 1;
      }
      continue;
    }

    if (!arg.startsWith("--")) {
      positionalHosts.push(arg);
    }
  }

  if (options.tenants.length === 0 && positionalHosts.length > 0) {
    options.tenants.push(...splitHosts(positionalHosts.join(",")));
  }

  if (options.tenants.length === 0) {
    const fromEnv = process.env.SMOKE_TENANTS || process.env.TENANT_HOSTS || "";
    options.tenants.push(...splitHosts(fromEnv));
  }

  options.tenants = [...new Set(options.tenants.map(normalizeHost).filter(Boolean))];

  return options;
}

async function readConfigFile(configFile) {
  if (!configFile) return null;

  const resolvedPath = path.resolve(process.cwd(), configFile);

  try {
    const content = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function applyConfigDefaults(options, config) {
  if (!config) return options;

  const next = { ...options };

  if (next.tenants.length === 0 && Array.isArray(config.tenants)) {
    next.tenants = [
      ...new Set(config.tenants.map((item) => normalizeHost(String(item))).filter(Boolean)),
    ];
  }

  const hasEnvProtocol = Boolean(process.env.SMOKE_PROTOCOL);
  const hasEnvStorefrontKey = Boolean(
    process.env.SMOKE_STOREFRONT_KEY || process.env.NEXT_PUBLIC_BAGISTO_STOREFRONT_KEY,
  );
  const hasEnvTimeout = Boolean(process.env.SMOKE_TIMEOUT_MS);

  if (
    !hasEnvProtocol &&
    next.protocol === DEFAULT_PROTOCOL &&
    typeof config.protocol === "string" &&
    config.protocol.trim()
  ) {
    next.protocol = config.protocol.trim();
  }

  if (
    !hasEnvStorefrontKey &&
    next.storefrontKey === DEFAULT_STOREFRONT_KEY &&
    typeof config.storefrontKey === "string" &&
    config.storefrontKey.trim()
  ) {
    next.storefrontKey = config.storefrontKey.trim();
  }

  if (!hasEnvTimeout && next.timeoutMs === DEFAULT_TIMEOUT_MS) {
    const parsedTimeout = Number.parseInt(String(config.timeoutMs || ""), 10);
    if (Number.isFinite(parsedTimeout) && parsedTimeout > 0) {
      next.timeoutMs = parsedTimeout;
    }
  }

  return next;
}

function splitHosts(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeHost(host) {
  return host
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function buildUrl(protocol, host, pathname) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${protocol}://${host}${normalizedPath}`;
}

function withTimeout(controller, timeoutMs) {
  return setTimeout(() => controller.abort(), timeoutMs);
}

async function fetchText(url, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = withTimeout(controller, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      ...options,
    });
    const body = await response.text();
    return { response, body, error: null };
  } catch (error) {
    return { response: null, body: "", error };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGraphql({ protocol, host, storefrontKey, timeoutMs, query, variables }) {
  const controller = new AbortController();
  const timer = withTimeout(controller, timeoutMs);
  const url = buildUrl(protocol, host, "/graphql");

  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-STOREFRONT-KEY": storefrontKey,
      },
      body: JSON.stringify({
        query,
        variables: variables || undefined,
      }),
    });

    const text = await response.text();
    let parsed = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    return { response, text, parsed, error: null };
  } catch (error) {
    return { response: null, text: "", parsed: null, error };
  } finally {
    clearTimeout(timer);
  }
}

function extractProductSlugs(html) {
  if (!html) return [];
  const regex = /href="\/product\/([^"?#]+)"/g;
  const slugs = [];
  let match = regex.exec(html);

  while (match) {
    const slug = decodeURIComponent(match[1] || "").trim();
    if (slug) slugs.push(slug);
    match = regex.exec(html);
  }

  return [...new Set(slugs)];
}

function isHealthyStatus(status) {
  return status >= 200 && status < 400;
}

async function runTenantSmoke({
  host,
  protocol,
  storefrontKey,
  timeoutMs,
  requireProduct,
}) {
  const checks = [];
  let hasFailure = false;

  const record = (status, label, detail) => {
    checks.push({ status, label, detail });
    if (status === "FAIL") hasFailure = true;
  };

  const homeUrl = buildUrl(protocol, host, "/");
  const searchUrl = buildUrl(protocol, host, "/search");

  const home = await fetchText(homeUrl, timeoutMs);
  if (home.error || !home.response || !isHealthyStatus(home.response.status)) {
    record(
      "FAIL",
      "GET /",
      home.error
        ? String(home.error)
        : `Unexpected status ${home.response?.status || "unknown"}`,
    );
    return { host, checks, hasFailure };
  }
  record("PASS", "GET /", `status ${home.response.status}`);

  const search = await fetchText(searchUrl, timeoutMs);
  if (search.error || !search.response || !isHealthyStatus(search.response.status)) {
    record(
      "FAIL",
      "GET /search",
      search.error
        ? String(search.error)
        : `Unexpected status ${search.response?.status || "unknown"}`,
    );
  } else {
    record("PASS", "GET /search", `status ${search.response.status}`);
  }

  const summaryQuery = `
    query SmokeProductsSummary {
      products: allProducts(input: [{ key: "page", value: "1" }, { key: "limit", value: "1" }]) {
        paginatorInfo {
          total
        }
        data {
          urlKey
        }
      }
    }
  `;

  const summary = await fetchGraphql({
    protocol,
    host,
    storefrontKey,
    timeoutMs,
    query: summaryQuery,
  });

  if (summary.error || !summary.response) {
    record("FAIL", "POST /graphql (summary)", String(summary.error));
    return { host, checks, hasFailure };
  }

  if (!isHealthyStatus(summary.response.status)) {
    record(
      "FAIL",
      "POST /graphql (summary)",
      `Unexpected status ${summary.response.status}`,
    );
    return { host, checks, hasFailure };
  }

  if (!summary.parsed || summary.parsed.errors?.length) {
    const message =
      summary.parsed?.errors?.[0]?.message || "Invalid GraphQL JSON response";
    record("FAIL", "POST /graphql (summary)", message);
    return { host, checks, hasFailure };
  }

  const productTotal = Number(summary.parsed?.data?.products?.paginatorInfo?.total || 0);
  const graphqlFirstSlug = summary.parsed?.data?.products?.data?.[0]?.urlKey || null;
  record(
    "PASS",
    "POST /graphql (summary)",
    `status ${summary.response.status}, total products: ${productTotal}`,
  );

  const homeSlugs = extractProductSlugs(home.body);
  const candidateSlug = homeSlugs[0] || graphqlFirstSlug || null;

  if (!candidateSlug) {
    if (requireProduct) {
      record(
        "FAIL",
        "Product availability",
        "No product slug found on homepage or GraphQL response",
      );
    } else {
      record(
        "WARN",
        "Product availability",
        "No products found yet; product page smoke skipped for this tenant",
      );
    }

    return { host, checks, hasFailure };
  }

  const productUrl = buildUrl(protocol, host, `/product/${candidateSlug}`);
  const productPage = await fetchText(productUrl, timeoutMs);

  if (productPage.error || !productPage.response || !isHealthyStatus(productPage.response.status)) {
    record(
      "FAIL",
      `GET /product/${candidateSlug}`,
      productPage.error
        ? String(productPage.error)
        : `Unexpected status ${productPage.response?.status || "unknown"}`,
    );
  } else {
    record(
      "PASS",
      `GET /product/${candidateSlug}`,
      `status ${productPage.response.status}`,
    );
  }

  const slugQuery = `
    query SmokeProductBySlug($input: [FilterHomeCategoriesInput!]) {
      products: allProducts(input: $input) {
        data {
          id
          urlKey
        }
      }
    }
  `;

  const slugResult = await fetchGraphql({
    protocol,
    host,
    storefrontKey,
    timeoutMs,
    query: slugQuery,
    variables: {
      input: [
        { key: "url_key", value: candidateSlug },
        { key: "page", value: "1" },
        { key: "limit", value: "1" },
      ],
    },
  });

  if (slugResult.error || !slugResult.response) {
    record("FAIL", `GraphQL slug lookup (${candidateSlug})`, String(slugResult.error));
    return { host, checks, hasFailure };
  }

  if (!isHealthyStatus(slugResult.response.status)) {
    record(
      "FAIL",
      `GraphQL slug lookup (${candidateSlug})`,
      `Unexpected status ${slugResult.response.status}`,
    );
    return { host, checks, hasFailure };
  }

  if (!slugResult.parsed || slugResult.parsed.errors?.length) {
    const message =
      slugResult.parsed?.errors?.[0]?.message || "Invalid GraphQL JSON response";
    record("FAIL", `GraphQL slug lookup (${candidateSlug})`, message);
    return { host, checks, hasFailure };
  }

  const foundBySlug = Array.isArray(slugResult.parsed?.data?.products?.data)
    ? slugResult.parsed.data.products.data.length > 0
    : false;

  if (!foundBySlug) {
    record(
      "FAIL",
      `GraphQL slug lookup (${candidateSlug})`,
      "Slug rendered in frontend was not found in tenant GraphQL",
    );
  } else {
    record("PASS", `GraphQL slug lookup (${candidateSlug})`, "Product found");
  }

  return { host, checks, hasFailure };
}

function printTenantResult(result) {
  console.log(`\nTenant: ${result.host}`);
  for (const check of result.checks) {
    const tag =
      check.status === "PASS"
        ? "[PASS]"
        : check.status === "WARN"
          ? "[WARN]"
          : "[FAIL]";
    console.log(`${tag} ${check.label} -> ${check.detail}`);
  }
}

async function main() {
  const parsedOptions = parseArgs(process.argv.slice(2));
  const config = await readConfigFile(parsedOptions.configFile);
  const options = applyConfigDefaults(parsedOptions, config);

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.tenants.length) {
    printUsage();
    console.error("Error: no tenant hosts provided.");
    process.exit(1);
  }

  const startedAt = Date.now();
  const results = [];

  for (const host of options.tenants) {
    // Run sequentially to keep output clear and avoid burst traffic.
    const result = await runTenantSmoke({
      host,
      protocol: options.protocol,
      storefrontKey: options.storefrontKey,
      timeoutMs: options.timeoutMs,
      requireProduct: options.requireProduct,
    });
    results.push(result);
    printTenantResult(result);
  }

  const failedTenants = results.filter((result) => result.hasFailure);
  const durationMs = Date.now() - startedAt;

  console.log(
    `\nSummary: ${results.length - failedTenants.length}/${results.length} tenants passed (${durationMs}ms)`,
  );

  if (failedTenants.length > 0) {
    console.error(
      `Failed tenants: ${failedTenants.map((result) => result.host).join(", ")}`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected smoke test failure:", error);
  process.exit(1);
});
