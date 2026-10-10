/** Fastify default is 1MiB — identity POSTs send several 1536 JPEGs as base64. */
export const VISION_JSON_BODY_LIMIT_BYTES = 12 * 1024 * 1024;
