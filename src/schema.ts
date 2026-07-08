import { z } from 'zod';

export const connectionParamsSchema = z.object({
    protocol: z.union([z.literal('http'), z.literal('https'), z.literal('https_insecure')]),
    ip: z.union([z.string().ip(), z.literal('')]),
    port: z.number().positive().lt(65535),
    user: z.string(),
    pass: z.string(),
});

export const cloudSchema = z.object({
    use_cloud: z.boolean(),
    cloud_url: z.string(),
    device_access_token: z.string(),
});

export const camOverlaySchema = z.object({
    service_id: z.number().int().nonnegative(),
    mode: z.union([z.literal('separate'), z.literal('combined'), z.literal('both')]),
    show_load1: z.boolean(),
    show_load5: z.boolean(),
    show_load15: z.boolean(),
    field_load1: z.string(),
    field_load5: z.string(),
    field_load15: z.string(),
    field_combined: z.string(),
    combined_format: z.string(),
});

export const serverDataSchema = z.object({
    output_camera: connectionParamsSchema,
    cloud: cloudSchema,
    camoverlay: camOverlaySchema,
    update_interval_ms: z.number().int().positive(),
});

export type ConnectionParams = z.infer<typeof connectionParamsSchema>;
export type CloudSettings = z.infer<typeof cloudSchema>;
export type CamOverlaySettings = z.infer<typeof camOverlaySchema>;
export type Settings = z.infer<typeof serverDataSchema>;
