import axios from "axios";
import * as http from "http";
import * as https from "https";
const axiosRetry = require("axios-retry");

axiosRetry(axios, { retries: 3 });

axios.defaults.httpAgent = new http.Agent({ keepAlive: true });
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });
