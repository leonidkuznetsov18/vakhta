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
      // Control registry first, then every tenant database (env mode: the single DATABASE_URL).
      preDeployCommand: ['node packages/db/dist/migrate-tenants.js'],
      healthcheckPath: '/health',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    },
    replicas: { [region]: 1 },
    env: {
      ACTIVATION_PEPPER: preserve(),
      TENANCY_MODE: preserve(),
      CONTROL_DATABASE_URL: preserve(),
      CONTROL_ENCRYPTION_KEY: preserve(),
      TENANT_POOL_MAX: preserve(),
      REGISTRY_REFRESH_SECONDS: preserve(),
      SUPPORT_TENANT_SLUG: preserve(),
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
      USER_GUIDE_URL: preserve(),
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
      CLOUDFLARE_AI_ACCOUNT_ID: preserve(),
      CLOUDFLARE_AI_TOKEN: preserve(),
      TENANCY_MODE: preserve(),
      CONTROL_DATABASE_URL: preserve(),
      CONTROL_ENCRYPTION_KEY: preserve(),
      TENANT_POOL_MAX: preserve(),
      REGISTRY_REFRESH_SECONDS: preserve(),
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

  // Control plane (specs/011): operators, tenants, provisioning. Holds the cluster admin URL and
  // provider tokens that the tenant-serving api never sees.
  const controlApi = service('control-api', {
    source: repo,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/control-api/Dockerfile',
      watchPatterns: [
        'apps/control-api/**',
        'packages/**',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ],
    },
    deploy: {
      preDeployCommand: ['node packages/registry/dist/cli/migrate.js'],
      healthcheckPath: '/health',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    },
    replicas: { [region]: 1 },
    env: {
      CONTROL_PORT: preserve(),
      CONTROL_HOST: preserve(),
      PORT: preserve(),
      CONTROL_DATABASE_URL: preserve(),
      CONTROL_ENCRYPTION_KEY: preserve(),
      CONTROL_AUTH_SECRET: preserve(),
      CONTROL_PUBLIC_BASE_URL: preserve(),
      CONTROL_CORS_ORIGINS: preserve(),
      S3_ACCESS_KEY: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_KEY: preserve(),
      AUTH_COOKIE_SAME_SITE: preserve(),
      PROVISION_DATABASE_ADMIN_URL: preserve(),
      PANEL_HOST_PATTERN: preserve(),
      KIOSK_HOST_PATTERN: preserve(),
      API_HOST_PATTERN: preserve(),
      PANEL_CNAME_TARGET: preserve(),
      KIOSK_CNAME_TARGET: preserve(),
      API_CNAME_TARGET: preserve(),
      PLATFORM_SCHEME: preserve(),
      LOG_LEVEL: preserve(),
      NODE_ENV: preserve(),
    },
  });

  return project('vakhta', {
    resources: [Postgres, Redis, postgresVolume, redisVolume, api, worker, controlApi],
  });
});
