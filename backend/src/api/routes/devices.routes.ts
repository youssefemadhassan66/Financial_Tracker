import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container.js';
import type { RateLimiters } from '../middleware/rate-limits.js';
import { requireDevice, requireUser } from '../middleware/authenticate.js';
import { createDeviceKeyBody, ingestSmsBody } from '../validation/schemas.js';
import { uuidParam } from '../validation/fields.js';

/** Managing device keys is a USER action — it needs a JWT. */
export function devicesRouter(container: Container): Router {
  const router = Router();
  router.use(requireUser(container.accessTokens));

  router.post('/', async (req, res) => {
    const { name } = createDeviceKeyBody.parse(req.body);
    const { device, key } = await container.createDeviceKey.execute(req.auth!.userId, name);
    // `key` appears in this one response and never again.
    res.status(201).json({ device, key });
  });

  router.get('/', async (req, res) => {
    res.json({ devices: await container.listDeviceKeys.execute(req.auth!.userId) });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = z.object({ id: uuidParam }).parse(req.params);
    await container.revokeDeviceKey.execute(req.auth!.userId, id);
    res.status(204).end();
  });

  return router;
}

/** Submitting SMS is a DEVICE action — it needs a device key, and a JWT
 *  is not accepted here. Each credential opens exactly one door. */
export function ingestRouter(container: Container, limits: RateLimiters): Router {
  const router = Router();

  router.post('/sms', requireDevice(container.authenticateDevice), limits.ingest, async (req, res) => {
    const sms = ingestSmsBody.parse(req.body);
    const device = req.device!;
    const result = await container.storeRawSms.execute(device.userId, device.deviceKeyId, sms);

    // Parse right away so the transaction appears within a second. A
    // parse failure must NOT fail the request: the message is already
    // safely stored, and a 5xx would make the phone retry forever.
    // Anything that goes wrong here is fixed by a later reprocess.
    let processing: string = 'duplicate';
    if (!result.duplicate) {
      try {
        processing = (await container.processRawSms.execute(device.userId, result.id)).status;
      } catch (error) {
        console.error('[sms] processing failed; message kept for reprocess', error);
        processing = 'pending';
      }
    }

    // 201 for new, 200 for a duplicate. Both are success: the forwarder
    // must stop retrying either way.
    res.status(result.duplicate ? 200 : 201).json({ ...result, processing });
  });

  return router;
}
