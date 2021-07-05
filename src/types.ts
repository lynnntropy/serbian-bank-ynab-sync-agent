import { SaveTransaction } from "ynab";

export abstract class Provider {
  abstract readonly slug: string;
  abstract fetchTransactions(
    accountNumber: string,
    startDate: Date,
    endDate?: Date
  ): Promise<SaveTransaction[]>;

  protected getImportIdPrefix(): string {
    return `RS:${this.slug}:`;
  }
}

export interface Config {
  token: string;
  providers: {
    [key: string]: ProviderConfig;
  };
  accounts: AccountConfig[];
}

interface AccountConfig {
  budgetId: string;
  provider: string;
  sourceAccountNumber: string;
  targetAccountId: string;
}

interface ProviderConfig {
  [key: string]: string;
}
