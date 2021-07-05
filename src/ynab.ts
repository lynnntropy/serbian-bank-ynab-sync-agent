import { API } from "ynab";
import config from "./config";

const ynab = new API(config.token);

export default ynab;
