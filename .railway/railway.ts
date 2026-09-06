import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  redis,
  service,
  volume,
} from 'railway/iac';

/**
 * Railway infrastructure for the pilot (docs/deploy.md): API + worker built from the
 * Dockerfiles in this repo, managed Postgres and Redis on the private network.
 * Secret values are never written here: `preserve()` keeps what is set in Railway.
 */
export default defineRailway(() => {
  const region = 'europe-west4';
  const repo = github('leonidkuznetsov18/vakhta', { branch: 'master', checkSuites: true });

  const Redis = redis('Redis', { region });
  Redis.deploy = {
    region,
    multiRegionConfig: { [region]: { numReplicas: 1 } },
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  Redis.networking = { privateNetworkEndpoint: 'redis' };
  const Postgres = postgres('Postgres', { region });
  // Public TCP proxy only for the nightly pg_dump from GitHub Actions (docs/runbooks/recovery.md).
  Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } };
  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'europe-west4-drams3a',
    sizeMB: 5000,
  });
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'europe-west4-drams3a',
    sizeMB: 5000,
  });

  const api = service('api', {
    source: repo,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/api/Dockerfile',
      watchPatterns: ['apps/api/**', 'packages/**', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'],
    },
    deploy: {
      preDeployCommand: ['node packages/db/dist/migrate.js'],
      healthcheckPath: '/health',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    },
    replicas: { [region]: 1 },
    env: {
      ACTIVATION_PEPPER: preserve(),
      API_HOST: preserve(),
      API_PORT: preserve(),
      PORT: preserve(),
      AUTH_COOKIE_SAME_SITE: preserve(),
      AUTH_SECRET: preserve(),
      CORS_ORIGINS: preserve(),
      DATABASE_URL: preserve(),
      DEFAULT_SITE_TIMEZONE: preserve(),
      LOG_LEVEL: preserve(),
      MEDIA_LINK_TTL_SECONDS: preserve(),
      METRICS_TOKEN: preserve(),
      NODE_ENV: preserve(),
      PUBLIC_BASE_URL: preserve(),
      QR_ROTATION_SECONDS: preserve(),
      QR_TTL_SECONDS: preserve(),
      REDIS_URL: preserve(),
      S3_ACCESS_KEY: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_KEY: preserve(),
      SENTRY_ENVIRONMENT: preserve(),
      TELEGRAM_BOT_TOKEN: preserve(),
      TELEGRAM_BOT_USERNAME: preserve(),
      TELEGRAM_MODE: preserve(),
      TELEGRAM_WEBHOOK_SECRET: preserve(),
    },
  });

  const worker = service('worker', {
    source: repo,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/worker/Dockerfile',
      watchPatterns: ['apps/worker/**', 'packages/**', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'],
    },
    deploy: { restartPolicyType: 'ALWAYS' },
    replicas: { [region]: 1 },
    env: {
      DATABASE_URL: preserve(),
      LOG_LEVEL: preserve(),
      NODE_ENV: preserve(),
      REDIS_URL: preserve(),
      S3_ACCESS_KEY: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_KEY: preserve(),
      SENTRY_ENVIRONMENT: preserve(),
      TELEGRAM_BOT_TOKEN: preserve(),
    },
  });

  return project('vakhta', {
    resources: [Postgres, Redis, postgresVolume, redisVolume, api, worker],
  });
});
