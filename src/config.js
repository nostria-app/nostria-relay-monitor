/**
 * Configuration file for Nostria Relay Monitor
 * Monitors Nostr relay hosts over HTTPS and WSS
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

const relayHosts = [
  'ribo.eu.nostria.app',
  'ribo.us.nostria.app',
  'discovery.eu.nostria.app',
  'discovery.us.nostria.app',
  'relay.damus.io',
  'relay.primal.net',
  'nos.lol',
  'offchain.pub',
  'relay.nostr.band',
  'relay.minds.com',
  'nostr.ono.re',
  'dev.nostrplayground.com',
  'nostrelites.org',
  'relay.nsite.lol',
  'nostr.bongbong.com',
  'nostr1.tunnelsats.com',
  'nostr.orangepill.dev',
  'relay.nostrgraph.net',
  'relay.current.fyi',
  'nostr-relay.wlvs.space',
  'relay.orange-crush.com',
  'nostr-dev.zbd.gg',
  'student.chadpolytechnic.com',
  'brb.io',
  'sg.qemura.xyz',
  'nostrsatva.net',
  'khatru.puhcho.me',
  'nostr.v0l.io',
  'nostr-2.zebedee.cloud',
  'welcome.nostr.wine',
  'nostr.mutinywallet.com',
  'relay.nostr.bg',
  'expensive-relay.fiatjaf.com',
  'nostr-relay.untethr.me',
  'nostr-01.bolt.observer',
  'relay.kamp.site',
  'lightningrelay.com',
  'us.rbr.bio',
  'relayer.fiatjaf.com',
  'nostr-relay.lnmarkets.com',
  'relayable.org',
  'nostr.fmt.wiz.biz',
  'wot.dergigi.com',
  'relay.ohbe.me',
  'relay.westernbtc.com',
  'nostr.milou.lol',
  'relay.orangepill.dev',
  'feeds.nostr.band',
  'nostr.zbd.gg',
  'relay.davidebtc.me',
  'nostr.hubmaker.io',
  'nostr.zebedee.cloud',
  'wot.utxo.one',
  'nostr.onsats.org',
  'nostr-relay.nokotaro.com',
  'rsslay.nostr.net',
  'relay.stoner.com',
  'nostr.walletofsatoshi.com',
  'relay.f7z.io',
  'relay.exit.pub',
  'nostr.lbdev.fun',
  'nostr.relayer.se',
  'nostr.lnbitcoin.cz',
  'umami.nostr1.com',
  'social.camph.net',
  'nostr2.actn.io',
  'nostr.actn.io',
  'nostr.portemonero.com',
  'ca.orangepill.dev',
  'nostrex.fly.dev',
  'rsslay.fiatjaf.com',
  'kiwibuilders.nostr21.net',
  'news.nos.social',
  'nostr3.actn.io',
  'relay-jp.nostr.wirednet.jp',
  'relay.nostrati.com',
  'relay.siamstr.com',
  'beta.nostril.cam',
  'relay.farscapian.com',
  'thewildhustle.nostr1.com',
  'relay.nostr.vet',
  'nostr.v6.army',
  'haven.vanderwarker.family',
  'jellyfish.land',
  'relay.otherstuff.fyi',
  'mhp258zrpiiwn.clorecloud.net',
  'shawn.nostr1.com',
  'relay.neuance.net',
  'relay.poster.place',
  'teemie1-relay.duckdns.org',
  'nostr.bitcoin-21.org',
  'nostr.okaits7534.net',
  'nostr.easify.de',
  'br.purplerelay.com',
  'lightning.red',
  'haven.slidestr.net',
  'atl.purplerelay.com',
  'dev-relay.nostrassets.com',
  'relay.hash.stream',
  'nostr.comunidadecancaonova.com',
  'fog.dedyn.io',
  'nostr.lnwallet.app',
  'nostr.tbai.me',
  'kmc-nostr.amiunderwater.com',
  'nostr.drss.io',
  'galaxy13.nostr1.com',
];

const config = {
  services: relayHosts.map((host) => ({
    name: host,
    host,
    httpsUrl: `https://${host}`,
    wssUrl: `wss://${host}`,
  })),

  // Database path - use environment variable or default based on platform
  dbPath: process.env.DB_PATH || (process.env.WEBSITES_ENABLE_APP_SERVICE_STORAGE ? '/home/data' : './data'),

  // Check interval in milliseconds (default: 30 minutes)
  checkInterval: parseInt(process.env.CHECK_INTERVAL_MS, 10) || 30 * 60 * 1000,

  // Data retention period in days (default: 7 days)
  dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS) || 14,

  // Port for the web server
  port: parseInt(process.env.PORT) || 3000,

  // Azure-specific configurations
  azure: {
    // Enable Azure-specific optimizations
    isAzureWebApp: !!process.env.WEBSITES_ENABLE_APP_SERVICE_STORAGE,

    // Health check configuration
    healthCheck: {
      enabled: true,
      path: '/health',
      timeout: 10000, // 10 seconds
    },

    // Logging configuration for Azure
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      enableConsole: true,
      enableFile: !process.env.WEBSITES_ENABLE_APP_SERVICE_STORAGE, // Don't write to files in Azure
    }
  },
};

export default config;