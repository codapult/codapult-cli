import { z } from 'zod';

export const envSourceSchema = z
  .enum(['file', 'process'])
  .default('file')
  .describe('Where to read environment variables from');
