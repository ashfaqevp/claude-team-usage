// Minimal PostgREST client using Node's http/https directly (no extra dependency,
// no reliance on global fetch being present in the extension host's Node version).
// Every call is POST + JSON, matching what the extension needs: row inserts and RPC calls.

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

const REQUEST_TIMEOUT_MS = 8_000;

interface RawResponse {
  status: number;
  body: string;
}

function postJson(
  baseUrl: string,
  urlPath: string,
  anonKey: string,
  payload: unknown,
  extraHeaders: Record<string, string>
): Promise<RawResponse | null> {
  return new Promise((resolve) => {
    let target: URL;
    try {
      target = new URL(urlPath, baseUrl);
    } catch {
      resolve(null);
      return;
    }

    const body = JSON.stringify(payload);
    const lib = target.protocol === 'http:' ? http : https;

    let settled = false;
    const finish = (result: RawResponse | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const req = lib.request(
        target,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Content-Length': Buffer.byteLength(body),
            ...extraHeaders,
          },
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => finish({ status: res.statusCode || 0, body: data }));
        }
      );

      req.on('error', () => finish(null));
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        finish(null);
      });

      req.write(body);
      req.end();
    } catch {
      finish(null);
    }
  });
}

export function isSupabaseConfigured(url: string | undefined, anonKey: string | undefined): boolean {
  return typeof url === 'string' && url.trim().length > 0 && typeof anonKey === 'string' && anonKey.trim().length > 0;
}

/** Insert rows via PostgREST. Returns whether the insert succeeded (2xx). */
export async function insertRows(
  url: string,
  anonKey: string,
  table: string,
  rows: Record<string, unknown>[]
): Promise<boolean> {
  const result = await postJson(url, `/rest/v1/${table}`, anonKey, rows, { Prefer: 'return=minimal' });
  return result != null && result.status >= 200 && result.status < 300;
}

/** Call a PostgREST RPC function. Returns the parsed JSON result, or null on any failure. */
export async function callRpc<T>(
  url: string,
  anonKey: string,
  fnName: string,
  args: Record<string, unknown> = {}
): Promise<T | null> {
  const result = await postJson(url, `/rest/v1/rpc/${fnName}`, anonKey, args, {});
  if (!result || result.status < 200 || result.status >= 300) return null;
  try {
    return JSON.parse(result.body) as T;
  } catch {
    return null;
  }
}
