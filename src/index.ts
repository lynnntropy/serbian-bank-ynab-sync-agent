import { CronJob } from "cron";
import { sub } from "date-fns";
import config from "./config";
import environment from "./environment";
import logger from "./logger";
import providers from "./providers";

const sync = async () => {
  logger.info("Synchronizing accounts...");

  for (const accountConfig of config.accounts) {
    const provider = providers.find((p) => p.slug === accountConfig.provider);
    if (!provider) {
      throw new Error(`Provider '${accountConfig.provider}' not recognized.`);
    }

    logger.info(
      `Fetching transactions for account no. ${accountConfig.sourceAccountNumber} (provider ${provider.slug})...`
    );

    let transactions = await provider.fetchTransactions(
      accountConfig.sourceAccountNumber,
      sub(new Date(), { days: 7 })
    );

    transactions = transactions.map((t) => ({
      ...t,
      account_id: accountConfig.targetAccountId,
    }));

    logger.trace(transactions);
    logger.debug(
      `Provider ${provider.slug} (account no. ${accountConfig.sourceAccountNumber}) returned ${transactions.length} transactions.`
    );
  }
};

if (environment.isProduction) {
  new CronJob("*/5 * * * *", sync, null, true);
} else {
  logger.info("Starting in development mode (will sync once and exit).");
  sync();
}
