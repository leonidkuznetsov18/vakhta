import { resolveTenant } from '../../packages/tenant-client/dist/index.js';

const controlUrl = process.env.CONTROL_API_URL;
if (!controlUrl) throw new Error('CONTROL_API_URL is required');
for (const [surface, value] of [
  ['PANEL', process.env.PANEL_URL],
  ['KIOSK', process.env.KIOSK_URL],
]) {
  if (!value) throw new Error(`${surface} URL is required`);
  const origin = new URL(value);
  const config = await resolveTenant({ host: origin.host, surface, controlUrl });
  if (new URL(config.canonicalUrl).origin !== origin.origin) {
    throw new Error(`Unexpected canonical origin for ${origin.host}`);
  }
  console.log(`Tenant runtime ready: ${origin.host}`);
}
