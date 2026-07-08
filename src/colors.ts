// Load-average severity colors for CamOverlay Custom Graphics fields.
// Thresholds: green below 2, orange from 2 up to 3, red above 3.
export const LOAD_THRESHOLD_ORANGE = 2;
export const LOAD_THRESHOLD_RED = 3;

const GREEN: [number, number, number] = [0, 200, 0];
const ORANGE: [number, number, number] = [255, 165, 0];
const RED: [number, number, number] = [255, 0, 0];

function pad3(n: number): string {
    return Math.max(0, Math.min(255, Math.round(n))).toString().padStart(3, '0');
}

// CamOverlay's customGraphics.cgi color params take a 9-digit RRRGGGBBB string
// (each channel zero-padded to 3 digits, e.g. white = 255255255).
export function rgbToParam([r, g, b]: [number, number, number]): string {
    return pad3(r) + pad3(g) + pad3(b);
}

export function colorForLoad(value: string): string {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n < LOAD_THRESHOLD_ORANGE) {
        return rgbToParam(GREEN);
    }
    if (n <= LOAD_THRESHOLD_RED) {
        return rgbToParam(ORANGE);
    }
    return rgbToParam(RED);
}
