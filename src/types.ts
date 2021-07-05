import { SaveTransaction, TransactionDetail } from "ynab";

export abstract class Provider {
  abstract readonly slug: string;
  abstract fetchTransactions(
    accountNumber: string,
    startDate: Date,
    endDate?: Date
  ): Promise<BankTransaction[]>;

  protected getImportIdPrefix(): string {
    return `RS:`;
  }
}

export type BankTransaction = Pick<
  TransactionDetail,
  "date" | "amount" | "memo" | "cleared" | "import_id" | "payee_name"
>;

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
