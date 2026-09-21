import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistryTenantSource, SecretCipher, createRegistry } from '@vakhta/registry';
import { loadControlEnv, type ControlEnv } from '../config/env.js';

export const REGISTRY = Symbol('REGISTRY');
export const REGISTRY_HANDLE = Symbol('REGISTRY_HANDLE');
export const SECRET_CIPHER = Symbol('SECRET_CIPHER');
export const TENANT_SOURCE = Symbol('TENANT_SOURCE');
/** The parsed environment as one frozen object for code that needs many keys at once. */
export const CONTROL_ENV = Symbol('CONTROL_ENV');

type Handle = ReturnType<typeof createRegistry>;

@Injectable()
class RegistryShutdown implements OnApplicationShutdown {
  constructor(
    @Inject(REGISTRY_HANDLE) private readonly handle: Handle,
    @Inject(TENANT_SOURCE) private readonly source: RegistryTenantSource,
  ) {}
  async onApplicationShutdown(): Promise<void> {
    this.source.stop();
    await this.handle.client.end({ timeout: 5 });
  }
}

/** The control database, the secret cipher and a read model of tenants for the public config. */
@Global()
@Module({
  providers: [
    { provide: CONTROL_ENV, useFactory: (): ControlEnv => loadControlEnv(process.env) },
    {
      provide: REGISTRY_HANDLE,
      useFactory: (config: ConfigService<ControlEnv, true>) =>
        createRegistry(config.get('CONTROL_DATABASE_URL', { infer: true }), { max: 5 }),
      inject: [ConfigService],
    },
    { provide: REGISTRY, useFactory: (handle: Handle) => handle.db, inject: [REGISTRY_HANDLE] },
    {
      provide: SECRET_CIPHER,
      useFactory: (config: ConfigService<ControlEnv, true>) =>
        new SecretCipher(config.get('CONTROL_ENCRYPTION_KEY', { infer: true })),
      inject: [ConfigService],
    },
    {
      provide: TENANT_SOURCE,
      useFactory: async (handle: Handle, cipher: SecretCipher) => {
        const source = new RegistryTenantSource(handle.db, cipher, { refreshEverySeconds: 5 });
        await source.reload();
        source.start();
        return source;
      },
      inject: [REGISTRY_HANDLE, SECRET_CIPHER],
    },
    RegistryShutdown,
  ],
  exports: [REGISTRY, SECRET_CIPHER, TENANT_SOURCE, CONTROL_ENV],
})
export class RegistryModule {}
