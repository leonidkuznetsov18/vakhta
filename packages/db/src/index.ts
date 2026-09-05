export * from './schema/index.js';
export * from './client.js';

/**
 * Оператори запитів реекспортуються звідси, щоб застосунки не залежали від drizzle-orm
 * напряму: інакше pnpm може дати їм іншу копію пакета (через peer-залежності інших
 * бібліотек), і типи SQL перестануть збігатись.
 */
export * from 'drizzle-orm';
export { migrate } from 'drizzle-orm/postgres-js/migrator';
