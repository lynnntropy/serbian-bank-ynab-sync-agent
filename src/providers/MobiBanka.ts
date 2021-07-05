import axios from "axios";
import { SaveTransaction, TransactionDetail } from "ynab";
import config from "../config";
import { Provider } from "../types";
import * as tough from "tough-cookie";
import * as querystring from "querystring";
import logger from "../logger";
import { format, formatISO, parse } from "date-fns";
import cheerio from "cheerio";
import axiosCookieJarSupport from "axios-cookiejar-support";
import * as csvParse from "csv-parse";
import { BankTransaction } from "../types";

interface MobiBankaTransactionRecord {
  CreditorName: string;
  CreditorAccountNumber: string;
  CurrencyAmount: string;
  CurrencyCode: string;
  PurposeDescription: string;
  PurposeCode: string;
  ValueDate: string;
}

const StatusMapping = {
  Pending: SaveTransaction.ClearedEnum.Uncleared,
  Executed: SaveTransaction.ClearedEnum.Cleared,
};

class MobiBanka extends Provider {
  slug = "mobi-banka";

  async fetchTransactions(
    accountNumber: string,
    startDate: Date,
    endDate?: Date
  ): Promise<BankTransaction[]> {
    const { username, password } = config.providers["mobi-banka"];

    axiosCookieJarSupport(axios);

    const cookieJar = new tough.CookieJar();
    await cookieJar.removeAllCookies();

    logger.debug("Logging into Mobi Banka...");

    const { data: loginPage } = await axios.get(
      "https://online.mobibanka.rs/Identity"
    );
    let $ = cheerio.load(loginPage);
    const workflowId = $("input#WorkflowId").val() as string;

    logger.debug(`Workflow ID: ${workflowId}`);

    while (true) {
      await axios.post(
        "https://online.mobibanka.rs/Identity",
        querystring.stringify({
          UserName: username,
          Password: password,
          WorkflowId: workflowId,
          ["X-Requested-With"]: "XMLHttpRequest",
        }),
        {
          jar: cookieJar,
        }
      );

      if (
        (
          await cookieJar.getCookies("https://online.mobibanka.rs/Identity")
        ).find((c) => c.key === "iBank_Auth") !== undefined
      ) {
        break;
      }

      logger.debug(`No 'iBank_Auth' cookie found, retrying...`);
    }

    const { data: homePage } = await axios.get("https://online.mobibanka.rs/", {
      jar: cookieJar,
      withCredentials: true,
    });

    const sessionId = (homePage as string).match(/window\.name = \'(\S+)\'/)[1];
    logger.debug(`Session ID: ${sessionId}`);

    await cookieJar.setCookie(
      `__session:${sessionId}:=https:; Path=/;`,
      "https://online.mobibanka.rs/"
    );

    let records: {
      record: MobiBankaTransactionRecord;
      status: keyof typeof StatusMapping;
    }[] = [];
    const transactions: BankTransaction[] = [];

    for (const statusName in StatusMapping) {
      logger.debug(`Requesting CSV export for status '${statusName}'...`);

      const { data: csvPath } = await axios.post(
        "https://online.mobibanka.rs/CustomerAccount/Accounts/PrintList",
        querystring.stringify({
          PageNumber: "",
          PageSize: "",
          Report: "csv",
          PaymentDescription: "",
          DateFrom: format(startDate, "dd/MM/yyyy"),
          DateTo: format(endDate ?? new Date(), "dd/MM/yyyy"),
          CurrencyList_input: "Sve+valute",
          CurrencyList: "",
          AmountFrom: "",
          AmountTo: "",
          Direction: "",
          TransactionType: "-1",
          AccountPicker: sanitizeAccountNumber(accountNumber),
          RelatedCardPicker: "-1",
          CounterParty: "",
          StandingOrderId: "",
          SortBy: "ValueDate",
          SortAsc: "Desc",
          GeoLatitude: "",
          GeoLongitude: "",
          Radius: "2",
          StatusPicker: statusName,
          ViewPicker: "List",
        }),
        {
          jar: cookieJar,
          withCredentials: true,
          headers: {
            ["X-Requested-With"]: "XMLHttpRequest",
          },
        }
      );

      logger.trace(`CSV path: ${csvPath}`);

      logger.debug("Fetching CSV...");

      const { data: csv } = await axios.get(
        `https://online.mobibanka.rs${csvPath}`,
        {
          jar: cookieJar,
          withCredentials: true,
        }
      );

      logger.trace(csv);

      const parser = csvParse((csv as string).trim(), { columns: true });

      for await (const record of parser as unknown as Iterable<MobiBankaTransactionRecord>) {
        records.push({
          record,
          status: statusName as keyof typeof StatusMapping,
        });
      }
    }

    records = records.reverse();

    for (const { record, status } of records) {
      const inflow =
        record.CreditorAccountNumber === sanitizeAccountNumber(accountNumber);
      const amount = inflow
        ? amountToMilliunits(record.CurrencyAmount)
        : amountToMilliunits(record.CurrencyAmount) * -1;
      const date = parse(record.ValueDate, "d.M.yyyy", new Date());
      const occurrence =
        transactions.filter(
          (t) =>
            t.amount === amount &&
            t.date === formatISO(date, { representation: "date" })
        ).length + 1;

      transactions.push({
        date: formatISO(date, { representation: "date" }),
        amount,
        payee_name: inflow ? undefined : record.CreditorName,
        memo:
          record.PurposeDescription !== record.CreditorName
            ? record.PurposeDescription
            : undefined,
        cleared: StatusMapping[status],
        import_id: `${this.getImportIdPrefix()}${amount}:${formatISO(date, {
          representation: "date",
        })}:${occurrence}`,
      });
    }

    return transactions;
  }
}

const sanitizeAccountNumber = (accountNumber: string): string => {
  return accountNumber.replace(/[^a-zA-Z0-9]/g, "");
};

const amountToMilliunits = (amount: string): number => {
  return Number(amount.replace(/\D/i, "")) * 10;
};

export default MobiBanka;
