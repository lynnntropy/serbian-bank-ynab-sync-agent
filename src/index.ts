import { sub } from "date-fns";
import config from "./config";
import logger from "./logger";
import providers from "./providers";

(async () => {
  for (const accountConfig of config.accounts) {
    const provider = providers.find((p) => p.slug === accountConfig.provider);
    if (!provider) {
      throw new Error(`Provider '${accountConfig.provider}' not recognized.`);
    }

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
      `Provider ${provider.slug} returned ${transactions.length} transactions.`
    );
  }
})();
