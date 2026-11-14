// Loads .env before anything else reads process.env.
//
// ES module imports are hoisted and evaluated before the importing module's own
// body runs, so a `dotenv.config()` call inside server.js happens *after* every
// imported module has already been initialised. Any module that reads
// process.env at import time (config/keycloak.js does) would see nothing.
// Importing this file first, for its side effect, fixes the order.
import dotenv from 'dotenv';

dotenv.config();
