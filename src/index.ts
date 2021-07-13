import { CronJob } from "cron";
import { formatISO, sub } from "date-fns";
import { isEqual } from "lodash";
import { SaveTransaction, TransactionDetail, UpdateTransaction } from "ynab";
import { AccountConfig } from "./types";
import "./axios";
import config from "./config";
import environment from "./environment";
import logger from "./logger";
import providers from "./providers";
import ynab from "./ynab";

const sync = async () => {
  logger.info("Synchronizing accounts...");

  const syncFromDate = sub(new Date(), { days: 7 });

  for (const accountConfig of config.accounts) {
    try {
      await processAccount(accountConfig, syncFromDate);
    } catch (e) {
      logger.error(
        `Failed to sync account no. ${accountConfig.sourceAccountNumber}.`
      );
      logger.error(e);
    }
  }
};

const processAccount = async (
  accountConfig: AccountConfig,
  syncFromDate: Date
) => {
  const provider = providers.find((p) => p.slug === accountConfig.provider);
  if (!provider) {
    throw new Error(`Provider '${accountConfig.provider}' not recognized.`);
  }

  logger.info(
    `Synchronizing transactions for account no. ${accountConfig.sourceAccountNumber} (provider ${provider.slug})...`
  );

  logger.debug("Fetching bank transactions...");

  let bankTransactions = await provider.fetchTransactions(
    accountConfig.sourceAccountNumber,
    syncFromDate
  );

  bankTransactions = bankTransactions.map((t) => ({
    ...t,
    account_id: accountConfig.targetAccountId,
  }));

  logger.trace(bankTransactions);
  logger.debug(
    `Provider ${provider.slug} (account no. ${accountConfig.sourceAccountNumber}) returned ${bankTransactions.length} transactions.`
  );

  logger.debug(
    `Fetching YNAB transactions for account ID ${accountConfig.targetAccountId}...`
  );

  const ynabTransactions = (
    await ynab.transactions.getTransactionsByAccount(
      accountConfig.budgetId,
      accountConfig.targetAccountId,
      formatISO(syncFromDate, { representation: "date" })
    )
  ).data.transactions;

  logger.debug(
    `Fetched ${ynabTransactions.length} transactions for account ID ${accountConfig.targetAccountId}.`
  );

  let toUpdate: UpdateTransaction[] = [];
  let toCreate: SaveTransaction[] = [];

  for (const bankTransaction of bankTransactions) {
    const ynabTransaction = ynabTransactions.find(
      (t) => t.import_id === bankTransaction.import_id
    );

    if (ynabTransaction && !isEqual(bankTransaction, ynabTransaction)) {
      toUpdate.push({
        ...bankTransaction,
        account_id: accountConfig.targetAccountId,
        id: null,
      });
    }

    if (!ynabTransaction) {
      toCreate.push({
        ...bankTransaction,
        account_id: accountConfig.targetAccountId,
      });
    }
  }

  // If this flag is enabled, match new (cleared) transactions
  // to current uncleared transactions in the same account

  if (accountConfig.matchNewTransactionsWithUncleared && toCreate.length > 0) {
    while (true) {
      let processedAllTransactions = false;

      for (let i = 0; i < toCreate.length; i++) {
        if (i === toCreate.length - 1) {
          processedAllTransactions = true;
        }

        const newTransaction = toCreate[i];

        if (newTransaction.cleared !== SaveTransaction.ClearedEnum.Cleared) {
          continue;
        }

        const unclearedTransaction = ynabTransactions.find(
          (t) =>
            t.cleared === TransactionDetail.ClearedEnum.Uncleared &&
            t.amount === newTransaction.amount
        );

        if (unclearedTransaction) {
          logger.debug(
            `Matched new transaction ${newTransaction.import_id} to uncleared transaction ${unclearedTransaction.import_id}.`
          );

          toCreate.splice(i, 1);

          toUpdate.push({
            ...newTransaction,
            id: unclearedTransaction.id,
            date: unclearedTransaction.date,
            memo:
              (newTransaction.memo ?? "") +
              ` [duplicate:${newTransaction.import_id}]`,
          });

          break;
        }
      }

      if (processedAllTransactions || toCreate.length === 0) {
        break;
      }
    }
  }

  // Don't create transactions we already know are duplicates of existing ones

  toCreate = toCreate.filter(
    (t) =>
      ynabTransactions.find(
        (yt) => yt.memo && yt.memo.includes(`[duplicate:${t.import_id}]`)
      ) === undefined
  );

  logger.debug(
    `Found ${toCreate.length} new transactions, ${toUpdate.length} to update.`
  );

  if (toCreate.length > 0) {
    try {
      const createResponse = await ynab.transactions.createTransactions(
        accountConfig.budgetId,
        { transactions: toCreate }
      );

      logger.info(
        `Created ${createResponse.data.transactions.length} new transactions.`
      );
    } catch (e) {
      logger.error(e);
      throw e;
    }
  }

  if (toUpdate.length > 0) {
    const updateResponse = await ynab.transactions.updateTransactions(
      accountConfig.budgetId,
      { transactions: toUpdate }
    );

    logger.info(
      `Updated ${updateResponse.data.transactions.length} transactions.`
    );
  }
};

if (environment.isProduction) {
  logger.info(
    "Starting in production mode (will sync accounts on a schedule)."
  );
  new CronJob(config.schedule ?? "*/30 * * * *", sync, null, true);
} else {
  logger.info("Starting in development mode (will sync once and exit).");
  sync();
}
