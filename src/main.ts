import * as fs from 'fs';
import * as path from 'path';
import { HttpServer } from 'camstreamerlib/HttpServer';
import { CameraVapix } from 'camstreamerlib/CameraVapix';
import { serverDataSchema, Settings } from './schema';
import { buildCgiRequest } from './cloud';
import { DEFAULT_SETTINGS, APP_VERSION } from './constants';
import { colorForLoad } from './colors';

const LOADAVG_PATH = '/proc/loadavg';
const CUSTOM_GRAPHICS_PATH = '/local/camoverlay/api/customGraphics.cgi';

// CameraVapix (camstreamerlib) handles the Axis Digest auth handshake (MD5/SHA-256)
// for local requests. Plain fetch() + a hand-rolled "Authorization: Basic ..." header
// gets a 401 on cameras/firmware that require Digest — which is the default on most
// current AXIS OS versions. Only the cloud (device-connect.net) path uses plain fetch,
// since that proxy authenticates with DEVICE_ACCESS_TOKEN instead.
let vapix: CameraVapix | undefined;

// PERSISTENT_DATA_PATH resolves differently across firmware versions (absolute path on
// some cameras, relative "localdata/" on others) — path.join handles both safely.
const SETTINGS_PATH = path.join(process.env.PERSISTENT_DATA_PATH ?? '.', 'settings.json');

type LoadValues = { load1: string; load5: string; load15: string };
type PushResult = {
    timestamp: number;
    ok: boolean;
    skipped?: boolean;
    statusCode?: number;
    responseText?: string;
    error?: string;
    url?: string;
    paramsSent?: Record<string, string>;
};

let settings: Settings;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPushedKey: string | null = null;
let camoverlayConfigured = false;
let lastLoad: LoadValues | null = null;
let lastPush: PushResult | null = null;

// Merges a parsed settings object over DEFAULT_SETTINGS (nested, one level deep) so a
// settings.json saved by an older version of this app — missing fields a later release
// added, like show_load1/5/15 in 1.0.8 — still validates with sensible defaults instead
// of crashing the whole app after an upgrade. Used for reads, GET, and POST alike.
function mergeWithDefaults(onDisk: Record<string, unknown>): Settings {
    const partial = (onDisk ?? {}) as Partial<Record<keyof Settings, Record<string, unknown>>>;
    return serverDataSchema.parse({
        ...DEFAULT_SETTINGS,
        ...onDisk,
        output_camera: { ...DEFAULT_SETTINGS.output_camera, ...partial.output_camera },
        cloud: { ...DEFAULT_SETTINGS.cloud, ...partial.cloud },
        camoverlay: { ...DEFAULT_SETTINGS.camoverlay, ...partial.camoverlay },
    });
}

function readSettings(): Settings {
    try {
        const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
        return mergeWithDefaults(JSON.parse(raw));
    } catch (err) {
        console.error('Read settings error:', err instanceof Error ? err.message : err);
        process.exit(1);
    }
}

/**
 * Some AXIS firmware versions reject CamScripter's built-in
 * /local/camscripter/package/settings.cgi with a spurious HTTP 400 (CSRF/auth
 * mismatch). Workaround: serve our own /settings.cgi from this microapp's HTTP
 * server, reached via CamScripter's authenticated proxy at
 * /local/camscripter/proxy/<package_name>/settings.cgi. The settings UI (html/index.js)
 * calls that path instead of the built-in one.
 */
function startSettingsServer(): void {
    const server = new HttpServer();
    server.onRequest('/settings.cgi', (req, res) => {
        if (req.method === 'GET') {
            const onDisk = fs.existsSync(SETTINGS_PATH)
                ? JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
                : {};
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(mergeWithDefaults(onDisk)));
            return;
        }
        if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
            req.on('end', () => {
                try {
                    const incoming = JSON.parse(body);
                    const merged = mergeWithDefaults(incoming);
                    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true }));
                    // Restart with the new settings, same lifecycle CamScripter uses on save.
                    setTimeout(() => process.kill(process.pid, 'SIGINT'), 300);
                } catch (err) {
                    console.error('Invalid settings POST:', err instanceof Error ? err.message : err);
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: String(err) }));
                }
            });
            return;
        }
        res.statusCode = 405;
        res.end();
    });

    // Diagnostics endpoint: last value read from /proc/loadavg and the result of the
    // last attempt to push it to CamOverlay, so the settings UI can show live status
    // without needing camera system logs.
    server.onRequest('/status.cgi', (req, res) => {
        if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end();
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            now: Date.now(),
            version: APP_VERSION,
            configured: camoverlayConfigured,
            intervalMs: settings.update_interval_ms,
            load: lastLoad,
            lastPush,
        }));
    });
}

/**
 * /proc/loadavg format: "0.15 0.22 0.30 1/234 5678"
 * Fields: 1-min, 5-min, 15-min load averages, running/total processes, last PID.
 */
function readLoadAvg(): { load1: string; load5: string; load15: string } | null {
    try {
        const raw = fs.readFileSync(LOADAVG_PATH, 'utf8').trim();
        const [load1, load5, load15] = raw.split(/\s+/);
        if (!load1 || !load5 || !load15) {
            console.error(`Unexpected ${LOADAVG_PATH} format:`, raw);
            return null;
        }
        return { load1, load5, load15 };
    } catch (err) {
        console.error(`Cannot read ${LOADAVG_PATH}:`, err instanceof Error ? err.message : err);
        return null;
    }
}

async function pushToCamOverlay(load1: string, load5: string, load15: string): Promise<void> {
    const co = settings.camoverlay;
    const key = `${load1}|${load5}|${load15}`;

    // action=update_text is required for CamOverlay to also apply the per-field
    // "<field>_color" params below — a plain text update without it ignores color.
    const params: Record<string, string> = { action: 'update_text', service_id: String(co.service_id) };
    if (co.mode === 'separate' || co.mode === 'both') {
        // A value is only sent if its "show" toggle is on AND it has a field name —
        // an empty field name is treated the same as disabled, rather than sending a
        // malformed empty-key query param.
        if (co.show_load1 && co.field_load1) {
            params[co.field_load1] = load1;
            params[`${co.field_load1}_color`] = colorForLoad(load1);
        }
        if (co.show_load5 && co.field_load5) {
            params[co.field_load5] = load5;
            params[`${co.field_load5}_color`] = colorForLoad(load5);
        }
        if (co.show_load15 && co.field_load15) {
            params[co.field_load15] = load15;
            params[`${co.field_load15}_color`] = colorForLoad(load15);
        }
    }
    if ((co.mode === 'combined' || co.mode === 'both') && co.field_combined) {
        const combined = co.combined_format
            .replace('{load1}', load1)
            .replace('{load5}', load5)
            .replace('{load15}', load15);
        params[co.field_combined] = combined;
        // Color the combined field by whichever of the three is most severe.
        const worst = [load1, load5, load15]
            .map((v) => parseFloat(v))
            .reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), 0);
        params[`${co.field_combined}_color`] = colorForLoad(String(worst));
    }

    if (key === lastPushedKey) {
        // No change since last push — skip the HTTP round-trip, but still record that
        // we're alive and what we would have sent, for the status panel.
        lastPush = { timestamp: Date.now(), ok: true, skipped: true, paramsSent: params };
        return;
    }

    try {
        let resp: Response;
        let url: string | undefined;

        if (settings.cloud.use_cloud && settings.cloud.cloud_url) {
            // Cloud proxy authenticates with DEVICE_ACCESS_TOKEN — plain fetch is correct here.
            const built = buildCgiRequest(settings.output_camera, settings.cloud, CUSTOM_GRAPHICS_PATH, params);
            url = built.url;
            resp = await fetch(built.url, { headers: built.headers });
        } else if (vapix) {
            // Local camera — CameraVapix negotiates the Digest challenge (MD5/SHA-256) for us.
            url = `${CUSTOM_GRAPHICS_PATH}?${new URLSearchParams(params).toString()}`;
            resp = await vapix.vapixGet(CUSTOM_GRAPHICS_PATH, params);
        } else {
            throw new Error('No output camera client initialised');
        }

        const responseText = await resp.text().catch(() => '');
        lastPush = {
            timestamp: Date.now(),
            ok: resp.ok,
            statusCode: resp.status,
            responseText: responseText.slice(0, 500),
            url,
            paramsSent: params,
        };
        if (!resp.ok) {
            console.error(`customGraphics.cgi returned ${resp.status} ${resp.statusText}: ${responseText}`);
            return;
        }
        lastPushedKey = key;
    } catch (err) {
        lastPush = {
            timestamp: Date.now(),
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            paramsSent: params,
        };
        console.error('Failed to push to CamOverlay:', err instanceof Error ? err.message : err);
    }
}

function tick(): void {
    const load = readLoadAvg();
    if (!load) {
        return;
    }
    lastLoad = load;
    if (!camoverlayConfigured) {
        return;
    }
    void pushToCamOverlay(load.load1, load.load5, load.load15);
}

function main(): void {
    settings = readSettings();
    startSettingsServer();

    const cam = settings.output_camera;
    if (cam.ip.length !== 0 && cam.user.length !== 0) {
        camoverlayConfigured = true;
        if (!(settings.cloud.use_cloud && settings.cloud.cloud_url)) {
            vapix = new CameraVapix({
                ip: cam.ip,
                port: cam.port,
                user: cam.user,
                pass: cam.pass,
                tls: cam.protocol !== 'http',
                tlsInsecure: cam.protocol === 'https_insecure',
            });
        }
    } else {
        console.log('CamOverlay output camera not configured — disabled. Fill in settings and save.');
    }

    // Always poll /proc/loadavg — even when CamOverlay isn't configured yet — so the
    // settings UI's live status panel has values to show while the user is setting up.
    console.log(`Polling ${LOADAVG_PATH} every ${settings.update_interval_ms}ms` +
        (camoverlayConfigured ? `, pushing to service_id=${settings.camoverlay.service_id}` : ' (CamOverlay push disabled until configured)'));
    tick();
    pollTimer = setInterval(tick, settings.update_interval_ms);

    console.log('Application started');
}

process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('SIGTERM', () => {
    console.log('SIGTERM received');
    if (pollTimer) clearInterval(pollTimer);
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('SIGINT received — settings likely changed, letting CamScripter restart us');
    if (pollTimer) clearInterval(pollTimer);
    process.exit(0);
});

main();
