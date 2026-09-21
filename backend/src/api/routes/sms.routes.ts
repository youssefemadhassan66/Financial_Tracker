import { Router } from 'express';
import type { Container } from '../container.js';
import { requireUser } from '../middleware/authenticate.js';
import { smsListQuery, smsReprocessBody } from '../validation/finance-schemas.js';

/**
 * Your stored SMS and their parse results. USER token only: the phone's
 * device key can deliver messages but never read them back, so a stolen
 * phone key cannot be used to read your bank history.
 */
export function smsRouter(container: Container): Router {
  const router = Router();
  // Mounted at /api/sms, so a router-level guard only covers this prefix.
  router.use(requireUser(container.accessTokens));

  router.get('/', async (req, res) => {
    const query = smsListQuery.parse(req.query);
    const messages = await container.listSmsMessages.execute(req.auth!.userId, {
      limit: query.limit,
      ...(query.status === undefined ? {} : { status: query.status }),
    });
    res.json({ messages });
  });

  router.post('/reprocess', async (req, res) => {
    const body = smsReprocessBody.parse(req.body ?? {});
    const summary = await container.reprocessSms.execute(
      req.auth!.userId,
      body.after === undefined ? {} : { after: body.after },
    );
    res.json(summary);
  });

  return router;
}
