// Startup file for hosts that load the app with require() - cPanel's
// "Setup Node.js App" (Phusion Passenger) on GoDaddy hosting, for one.
// server.mjs is an ES module, so it has to be pulled in with import().
import('./server.mjs').catch((e) => { console.error(e); process.exit(1); });
