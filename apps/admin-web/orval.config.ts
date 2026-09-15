import { defineConfig } from 'orval';

export default defineConfig({
  employees: {
    input: '../../contracts/openapi/employees.json',
    output: {
      target: './src/entities/employee/api/generated/employees.ts',
      schemas: './src/entities/employee/api/generated/models',
      client: 'axios-functions',
      override: {
        mutator: { path: './src/shared/api/index.ts', name: 'apiRequest' },
      },
    },
  },
});
