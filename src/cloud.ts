import { ConnectionParams, CloudSettings } from './schema';

/**
 * Builds a { url, headers } pair for a CGI call against either the local camera
 * (Basic auth) or CamStreamer Cloud / device-connect.net (DEVICE_ACCESS_TOKEN query param).
 * Never send both auth methods at once.
 */
export function buildCgiRequest(
    camera: ConnectionParams,
    cloud: CloudSettings,
    path: string,
    params: Record<string, string> = {}
): { url: string; headers: Record<string, string> } {
    const qp = new URLSearchParams(params);

    if (cloud.use_cloud && cloud.cloud_url) {
        qp.set('DEVICE_ACCESS_TOKEN', cloud.device_access_token);
        return { url: `${cloud.cloud_url}${path}?${qp.toString()}`, headers: {} };
    }

    const scheme = camera.protocol === 'http' ? 'http' : 'https';
    const auth = 'Basic ' + Buffer.from(`${camera.user}:${camera.pass}`).toString('base64');
    return {
        url: `${scheme}://${camera.ip}:${camera.port}${path}?${qp.toString()}`,
        headers: { Authorization: auth },
    };
}
