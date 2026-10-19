import express, { Router } from 'express';
import { InvalidPdfError } from '../../application/errors.js';
import type { Container } from '../container.js';
import { requireUser } from '../middleware/authenticate.js';
import {
  accountIdParams,
  analyticsQuery,
  budgetCategoryParams,
  budgetListQuery,
  createInstallmentBody,
  installmentIdParams,
  setBudgetBody,
  createAccountBody,
  createCategoryBody,
  createSubscriptionBody,
  dismissSubscriptionSuggestionBody,
  listTransactionsQuery,
  recordTransactionBody,
  recordTransferBody,
  subscriptionActionParams,
  subscriptionListQuery,
  subscriptionSummaryQuery,
  updateAccountBody,
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

/** A year of monthly statements is well under 1 MB; the cap stops abuse. */
const MAX_STATEMENT_BYTES = '5mb';

/**
 * The body must be the PDF itself (Content-Type: application/pdf). The
 * magic bytes are checked here, before the upload reaches a PDF parser:
 * a file named .pdf is not a PDF because of its name.
 */
function pdfBody(body: unknown): Uint8Array {
  if (!Buffer.isBuffer(body) || body.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new InvalidPdfError('Send the statement file itself as the body, with Content-Type: application/pdf');
  }
  return new Uint8Array(body);
}

export function financeRouter(container: Container): Router {
  const router = Router();
  // Attached to EACH route rather than router.use(): this router is
  // mounted at /api, so a router-level guard would intercept every
  // unmatched /api/* path and answer 401 where 404 is correct.
  const auth = requireUser(container.accessTokens);

  // --- credit card statements --------------------------------------------
  router.post(
    '/accounts/:id/statements',
    auth,
    express.raw({ type: 'application/pdf', limit: MAX_STATEMENT_BYTES }),
    async (req, res) => {
      const { id } = accountIdParams.parse(req.params);
      const statements = await container.importCardStatements.execute(req.auth!.userId, id, pdfBody(req.body));
      // Best effort: the import is saved; a matching failure is fixed by
      // the next run (or POST /subscriptions/match), never by failing this.
      try {
        await container.matchSubscriptionCharges.execute(req.auth!.userId);
      } catch (error) {
        console.error('[subscriptions] matching after a statement import failed', error);
      }
      res.status(201).json({ statements });
    },
  );

  router.get('/accounts/:id/statements', auth, async (req, res) => {
    const { id } = accountIdParams.parse(req.params);
    res.json({ statements: await container.listCardStatements.execute(req.auth!.userId, id) });
  });

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

  router.patch('/accounts/:id', auth, async (req, res) => {
    const { id } = accountIdParams.parse(req.params);
    const input = updateAccountBody.parse(req.body);
    res.json({ account: await container.updateAccount.execute(req.auth!.userId, id, defined(input)) });
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

  router.post('/subscriptions/match', auth, async (req, res) => {
    res.json(await container.matchSubscriptionCharges.execute(req.auth!.userId));
  });

  // Registered before /:id/:action so fixed paths are never read as an id.
  router.get('/subscriptions/suggestions', auth, async (req, res) => {
    res.json({ suggestions: await container.suggestSubscriptions.execute(req.auth!.userId) });
  });

  router.post('/subscriptions/suggestions/dismiss', auth, async (req, res) => {
    const { merchantKey } = dismissSubscriptionSuggestionBody.parse(req.body);
    await container.dismissSuggestion.execute(req.auth!.userId, merchantKey);
    res.status(204).end();
  });

  router.get('/subscriptions/summary', auth, async (req, res) => {
    const { days } = subscriptionSummaryQuery.parse(req.query);
    res.json(await container.getSubscriptionSummary.execute(req.auth!.userId, days));
  });

  router.post('/subscriptions', auth, async (req, res) => {
    const input = createSubscriptionBody.parse(req.body);
    const subscription = await container.createSubscription.execute(req.auth!.userId, defined(input));
    // Best effort: newly created subscription may match existing unlinked charges immediately.
    try {
      await container.matchSubscriptionCharges.execute(req.auth!.userId);
    } catch (error) {
      console.error('[subscriptions] matching after subscription creation failed', error);
    }
    res.status(201).json({ subscription });
  });

  // --- budgets -----------------------------------------------------------
  router.get('/budgets', auth, async (req, res) => {
    const { month } = budgetListQuery.parse(req.query);
    res.json(await container.listBudgets.execute(req.auth!.userId, month));
  });

  // Sets the limit from this month on; earlier months keep theirs.
  router.put('/budgets/:categoryId', auth, async (req, res) => {
    const { categoryId } = budgetCategoryParams.parse(req.params);
    await container.setBudget.execute(req.auth!.userId, categoryId, setBudgetBody.parse(req.body));
    res.status(204).end();
  });

  router.delete('/budgets/:categoryId', auth, async (req, res) => {
    const { categoryId } = budgetCategoryParams.parse(req.params);
    await container.stopBudget.execute(req.auth!.userId, categoryId);
    res.status(204).end();
  });

  // --- installments ------------------------------------------------------
  router.get('/installments', auth, async (req, res) => {
    res.json(await container.listInstallments.execute(req.auth!.userId));
  });

  router.post('/installments', auth, async (req, res) => {
    const input = createInstallmentBody.parse(req.body);
    res.status(201).json({ plan: await container.createInstallmentPlan.execute(req.auth!.userId, defined(input)) });
  });

  router.post('/installments/:id/cancel', auth, async (req, res) => {
    const { id } = installmentIdParams.parse(req.params);
    res.json({ plan: await container.cancelInstallmentPlan.execute(req.auth!.userId, id) });
  });

  router.post('/subscriptions/:id/:action', auth, async (req, res) => {
    const { id, action } = subscriptionActionParams.parse(req.params);
    res.json({ subscription: await container.changeSubscriptionStatus.execute(req.auth!.userId, id, action) });
  });

  return router;
}
