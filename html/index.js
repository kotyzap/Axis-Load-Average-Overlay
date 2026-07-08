const PACKAGE_NAME = 'load_average_overlay';
// Routed to this microapp's own /settings.cgi handler via CamScripter's authenticated
// proxy, NOT the built-in /local/camscripter/package/settings.cgi — some AXIS firmware
// versions reject that one with a spurious HTTP 400 (CSRF/auth mismatch).
const SETTINGS_URL = `/local/camscripter/proxy/${PACKAGE_NAME}/settings.cgi`;
const STATUS_URL = `/local/camscripter/proxy/${PACKAGE_NAME}/status.cgi`;
const STATUS_POLL_MS = 3000;

const els = {
    protocol: document.getElementById('protocol'),
    ip: document.getElementById('ip'),
    port: document.getElementById('port'),
    user: document.getElementById('user'),
    pass: document.getElementById('pass'),
    use_cloud: document.getElementById('use_cloud'),
    cloud_url: document.getElementById('cloud_url'),
    device_access_token: document.getElementById('device_access_token'),
    service_id: document.getElementById('service_id'),
    mode: document.getElementById('mode'),
    show_load1: document.getElementById('show_load1'),
    show_load5: document.getElementById('show_load5'),
    show_load15: document.getElementById('show_load15'),
    field_load1: document.getElementById('field_load1'),
    field_load5: document.getElementById('field_load5'),
    field_load15: document.getElementById('field_load15'),
    field_combined: document.getElementById('field_combined'),
    combined_format: document.getElementById('combined_format'),
    update_interval_ms: document.getElementById('update_interval_ms'),
    status: document.getElementById('status'),
    saveBtn: document.getElementById('saveBtn'),
    themeToggle: document.getElementById('themeToggle'),
    liveLoad1: document.getElementById('liveLoad1'),
    liveLoad5: document.getElementById('liveLoad5'),
    liveLoad15: document.getElementById('liveLoad15'),
    pushDot: document.getElementById('pushDot'),
    pushSummary: document.getElementById('pushSummary'),
    pushDetail: document.getElementById('pushDetail'),
    pushToggle: document.getElementById('pushToggle'),
    versionBadge: document.getElementById('versionBadge'),
};

// Mirrors src/colors.ts thresholds exactly (green <2, orange 2-3, red >3) so this
// preview always matches the color actually pushed to the CamOverlay field.
const SEV_ORANGE_AT = 2;
const SEV_RED_AT = 3;
function severityClass(value) {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n < SEV_ORANGE_AT) return 'sev-green';
    if (n <= SEV_RED_AT) return 'sev-orange';
    return 'sev-red';
}
function setLiveValue(el, value) {
    el.textContent = value;
    el.classList.remove('sev-green', 'sev-orange', 'sev-red');
    el.classList.add(severityClass(value));
}

function timeAgo(ts) {
    const secs = Math.round((Date.now() - ts) / 1000);
    if (secs < 2) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    return `${Math.round(secs / 60)}m ago`;
}

async function pollStatus() {
    try {
        const resp = await fetch(STATUS_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const s = await resp.json();

        if (s.load) {
            setLiveValue(els.liveLoad1, s.load.load1);
            setLiveValue(els.liveLoad5, s.load.load5);
            setLiveValue(els.liveLoad15, s.load.load15);
        }

        if (s.version) {
            els.versionBadge.textContent = 'v' + s.version;
        }

        if (!s.configured) {
            els.pushDot.className = 'push-dot';
            els.pushSummary.textContent = 'Reading /proc/loadavg, but CamOverlay output camera is not configured yet — fill it in below and save.';
            els.pushDetail.textContent = '';
        } else if (!s.lastPush) {
            els.pushDot.className = 'push-dot';
            els.pushSummary.textContent = 'Waiting for first push…';
            els.pushDetail.textContent = '';
        } else {
            const p = s.lastPush;
            els.pushDot.className = 'push-dot ' + (p.ok ? 'ok' : 'err');
            if (p.skipped) {
                els.pushSummary.textContent = `Unchanged since last push (${timeAgo(p.timestamp)}) — not re-sent.`;
            } else if (p.ok) {
                els.pushSummary.textContent = `Pushed to CamOverlay ${timeAgo(p.timestamp)} — HTTP ${p.statusCode}.`;
            } else {
                els.pushSummary.textContent = `Push failed ${timeAgo(p.timestamp)}: ${p.error || 'HTTP ' + p.statusCode}`;
            }
            const detailLines = [];
            if (p.url) detailLines.push(`URL: ${p.url}`);
            if (p.paramsSent) detailLines.push(`Params: ${JSON.stringify(p.paramsSent)}`);
            if (p.responseText) detailLines.push(`Response: ${p.responseText}`);
            els.pushDetail.textContent = detailLines.join('\n');
        }
    } catch (err) {
        els.pushDot.className = 'push-dot err';
        els.pushSummary.textContent = 'Could not reach the app: ' + err.message;
    }
}

function applySettingsToForm(s) {
    els.protocol.value = s.output_camera.protocol;
    els.ip.value = s.output_camera.ip;
    els.port.value = s.output_camera.port;
    els.user.value = s.output_camera.user;
    els.pass.value = s.output_camera.pass;

    els.use_cloud.checked = s.cloud.use_cloud;
    els.cloud_url.value = s.cloud.cloud_url;
    els.device_access_token.value = s.cloud.device_access_token;

    els.service_id.value = s.camoverlay.service_id;
    els.mode.value = s.camoverlay.mode;
    els.show_load1.checked = s.camoverlay.show_load1;
    els.show_load5.checked = s.camoverlay.show_load5;
    els.show_load15.checked = s.camoverlay.show_load15;
    els.field_load1.value = s.camoverlay.field_load1;
    els.field_load5.value = s.camoverlay.field_load5;
    els.field_load15.value = s.camoverlay.field_load15;
    els.field_combined.value = s.camoverlay.field_combined;
    els.combined_format.value = s.camoverlay.combined_format;

    els.update_interval_ms.value = s.update_interval_ms;
    updateFieldToggleStates();
}

// Grey out (disable) a field-name input when its "show" checkbox is off — makes it
// visually obvious that value won't be pushed to the overlay.
function updateFieldToggleStates() {
    els.field_load1.disabled = !els.show_load1.checked;
    els.field_load5.disabled = !els.show_load5.checked;
    els.field_load15.disabled = !els.show_load15.checked;
}

function readFormToSettings() {
    return {
        output_camera: {
            protocol: els.protocol.value,
            ip: els.ip.value.trim(),
            port: Number(els.port.value) || 80,
            user: els.user.value.trim(),
            pass: els.pass.value,
        },
        cloud: {
            use_cloud: els.use_cloud.checked,
            cloud_url: els.cloud_url.value.trim(),
            device_access_token: els.device_access_token.value.trim(),
        },
        camoverlay: {
            service_id: Number(els.service_id.value) || 0,
            mode: els.mode.value,
            show_load1: els.show_load1.checked,
            show_load5: els.show_load5.checked,
            show_load15: els.show_load15.checked,
            field_load1: els.field_load1.value.trim(),
            field_load5: els.field_load5.value.trim(),
            field_load15: els.field_load15.value.trim(),
            field_combined: els.field_combined.value.trim(),
            combined_format: els.combined_format.value,
        },
        update_interval_ms: Number(els.update_interval_ms.value) || 5000,
    };
}

function setStatus(text, cls) {
    els.status.textContent = text;
    els.status.className = cls || '';
}

async function loadSettings() {
    try {
        const resp = await fetch(SETTINGS_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const settings = await resp.json();
        applySettingsToForm(settings);
    } catch (err) {
        setStatus('Failed to load settings: ' + err.message, 'err');
    }
}

async function saveSettings() {
    setStatus('Saving…');
    try {
        const resp = await fetch(SETTINGS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(readFormToSettings()),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        setStatus('Saved — app restarting with new settings.', 'ok');
    } catch (err) {
        setStatus('Failed to save: ' + err.message, 'err');
    }
}

// --- Theme switcher (light by default, persisted locally) ---
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeToggle.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

function initTheme() {
    const saved = localStorage.getItem('load_average_overlay_theme') || 'light';
    applyTheme(saved);
}

els.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('load_average_overlay_theme', next);
});

els.saveBtn.addEventListener('click', saveSettings);

[els.show_load1, els.show_load5, els.show_load15].forEach((cb) => {
    cb.addEventListener('change', updateFieldToggleStates);
});

// Auto-switch the well-known port when the protocol changes, but only if the port
// field still holds one of the well-known values — leaves a custom port untouched.
const WELL_KNOWN_PORTS = { http: '80', https: '443', https_insecure: '443' };
els.protocol.addEventListener('change', () => {
    const currentIsWellKnown = Object.values(WELL_KNOWN_PORTS).includes(els.port.value);
    if (currentIsWellKnown || els.port.value === '') {
        els.port.value = WELL_KNOWN_PORTS[els.protocol.value];
    }
});

els.pushToggle.addEventListener('click', () => {
    const open = els.pushDetail.classList.toggle('open');
    els.pushToggle.textContent = open ? 'details ▴' : 'details ▾';
});

initTheme();
loadSettings();
pollStatus();
setInterval(pollStatus, STATUS_POLL_MS);
