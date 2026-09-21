import { Router } from 'express';
import type { Container } from '../container.js';
import { requireUser } from '../middleware/authenticate.js';
import {
  analyticsQuery,
  createAccountBody,
  createCategoryBody,
  createSubscriptionBody,
  listTransactionsQuery,
  recordTransactionBody,
  recordTransferBody,
  subscriptionActionParams,
  subscriptionListQuery,
  subscriptionSummaryQuery,
} from '../validation/finance-schemas.js';

/**
 * Every route here requires a USER access token and works only on that
 * user's own data — each use case receives req.auth.userId and every
 * repository query filters by it. A device key is not accepted here.
 *
 * Optional fields are passed through only when present: with
 * exactOptionalPropertyTypes, "absent" and "undefined" are different
 * things, and use cases are written to expect absent.
 */
function defined<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as never;
}

export function financeRouter(container: Container): Router {
  const router = Router();
  // Attached to EACH route rather than router.use(): this router is
  // mounted at /api, so a router-level guard would intercept every
  // unmatched /api/* path and answer 401 where 404 is correct.
  const auth = requireUser(container.accessTokens);

  // --- categories ------------------------------------------------------
  router.get('/categories', auth, async (req, res) => {
    res.json({ categories: await container.listCategories.execute(req.auth!.userId) });
  });

  router.post('/categories', auth, async (req, res) => {
    const input = createCategoryBody.parse(req.body);
    res.status(201).json({ category: await container.createCategory.execute(req.auth!.userId, input) });
  });

  // --- accounts --------------------------------------------------------
  router.get('/accounts', auth, async (req, res) => {
    res.json({ accounts: await container.listAccounts.execute(req.auth!.userId) });
  });

  router.post('/accounts', auth, async (req, res) => {
    const input = createAccountBody.parse(req.body);
    res.status(201).json({ account: await container.createAccount.execute(req.auth!.userId, defined(input)) });
  });

  // --- transactions ----------------------------------------------------
  router.get('/transactions', auth, async (req, res) => {
    const query = listTransactionsQuery.parse(req.query);
    res.json({ transactions: await container.listTransactions.execute(req.auth!.userId, defined(query)) });
  });

  router.post('/transactions', auth, async (req, res) => {
    const input = recordTransactionBody.parse(req.body);
    res.status(201).json(await container.recordTransaction.execute(req.auth!.userId, defined(input)));
  });

  router.post('/transfers', auth, async (req, res) => {
    const input = recordTransferBody.parse(req.body);
    res.status(201).json(await container.recordTransfer.execute(req.auth!.userId, input));
  });

  // --- analytics -------------------------------------------------------
  router.get('/analytics/categories', auth, async (req, res) => {
    const query = analyticsQuery.parse(req.query);
    res.json(await container.getCategoryAnalytics.execute(req.auth!.userId, defined(query)));
  });

  // --- subscriptions ---------------------------------------------------
  router.get('/subscriptions', auth, async (req, res) => {
    const { status } = subscriptionListQuery.parse(req.query);
    res.json({ subscriptions: await container.listSubscriptions.execute(req.auth!.userId, status) });
  });

  // Registered before /:id/:action so "summary" is never read as an id.
  router.get('/subscriptions/summary', auth, async (req, res) => {
    const { days } = subscriptionSummaryQuery.parse(req.query);
    res.json(await container.getSubscriptionSummary.execute(req.auth!.userId, days));
  });

  router.post('/subscriptions', auth, async (req, res) => {
    const input = createSubscriptionBody.parse(req.body);
    res.status(201).json({ subscription: await container.createSubscription.execute(req.auth!.userId, defined(input)) });
  });

  router.post('/subscriptions/:id/:action', auth, async (req, res) => {
    const { id, action } = subscriptionActionParams.parse(req.params);
    res.json({ subscription: await container.changeSubscriptionStatus.execute(req.auth!.userId, id, action) });
  });

  return router;
}
