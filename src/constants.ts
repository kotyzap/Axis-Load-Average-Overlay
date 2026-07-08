import { Settings } from './schema';

// Kept in sync with manifest.json / package.json "version" on every release —
// shown in the settings UI header and returned by /status.cgi.
export const APP_VERSION = '1.0.8';

export const DEFAULT_SETTINGS: Settings = {
    output_camera: {
        protocol: 'http',
        ip: '127.0.0.1',
        port: 80,
        user: 'root',
        pass: '',
    },
    cloud: {
        use_cloud: false,
        cloud_url: '',
        device_access_token: '',
    },
    camoverlay: {
        service_id: 5,
        mode: 'both',
        show_load1: true,
        show_load5: true,
        show_load15: true,
        field_load1: 'field1',
        field_load5: 'field2',
        field_load15: 'field3',
        field_combined: 'load_summary',
        combined_format: 'Load: {load1} {load5} {load15}',
    },
    update_interval_ms: 5000,
};
