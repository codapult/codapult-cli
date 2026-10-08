import { describe, expect, it, vi } from 'vitest';
import { RECIPES, recipeShowCommand } from './recipes.js';

describe('starter recipes', () => {
  it('has a setup recipe for each supported profile', () => {
    expect(Object.keys(RECIPES)).toEqual([
      'saas',
      'ai-saas',
      'b2b-saas',
      'ai-chatbot',
      'marketplace',
      'internal-tool',
      'content-saas',
      'marketing',
    ]);
    expect(
      Object.values(RECIPES).every((recipe) => recipe.steps[0].startsWith('setup --preset ')),
    ).toBe(true);
  });

  it('shows the selected recipe steps', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});

    recipeShowCommand('ai-saas');

    expect(output).toHaveBeenCalledWith(expect.stringContaining('1. setup --preset ai-saas'));
    output.mockRestore();
  });
});
