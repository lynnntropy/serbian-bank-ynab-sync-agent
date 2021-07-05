import axios from "axios";
import * as http from "http";
import * as https from "https";

axios.defaults.httpAgent = new http.Agent({ keepAlive: true });
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });
