import { fail, heading, info, dim } from '../utils/ui.js';
import { setupCommand } from './setup.js';

export const RECIPES = {
  saas: {
    preset: 'saas',
    description: 'General-purpose SaaS with the full Codapult foundation.',
    steps: ['setup --preset saas', 'pnpm install', 'pnpm db:push', 'pnpm dev'],
  },
  'ai-saas': {
    preset: 'ai-saas',
    description: 'AI product with chat, agents, batch processing, playground, and RAG.',
    steps: ['setup --preset ai-saas', 'pnpm install', 'pnpm db:push', 'pnpm dev'],
  },
  'b2b-saas': {
    preset: 'b2b-saas',
    description: 'Team product with organizations, SSO, branding, audit, and operations modules.',
    steps: ['setup --preset b2b-saas', 'pnpm install', 'pnpm db:push', 'pnpm dev'],
  },
  marketing: {
    preset: 'marketing',
    description: 'Marketing site without authentication or dashboard modules.',
    steps: ['setup --preset marketing', 'pnpm install', 'pnpm dev'],
  },
} as const;

type RecipeName = keyof typeof RECIPES;

function getRecipe(name: string): (typeof RECIPES)[RecipeName] {
  if (name in RECIPES) return RECIPES[name as RecipeName];
  fail(`Unknown recipe: "${name}". Available: ${Object.keys(RECIPES).join(', ')}`);
  process.exit(1);
}

export function recipeListCommand(): void {
  heading('Codapult Recipes');
  for (const [name, recipe] of Object.entries(RECIPES)) {
    info(`${name} — ${recipe.description}`);
  }
  console.log();
  dim('Run `codapult recipe show <name>` for the steps.');
}

export function recipeShowCommand(name: string): void {
  const recipe = getRecipe(name);
  heading(`Recipe: ${name}`);
  info(recipe.description);
  console.log();
  recipe.steps.forEach((step, index) => dim(`${index + 1}. ${step}`));
}

export async function recipeApplyCommand(
  name: string,
  options: { envFile?: boolean },
): Promise<void> {
  const recipe = getRecipe(name);
  await setupCommand({ preset: recipe.preset, envFile: options.envFile });
}
