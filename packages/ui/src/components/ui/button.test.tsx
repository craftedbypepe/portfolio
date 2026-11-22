import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders a button with the default variant classes', () => {
    render(<Button>Compare laps</Button>);
    const button = screen.getByRole('button', { name: 'Compare laps' });
    expect(button.className).toContain('bg-primary');
  });

  it('applies the outline variant', () => {
    render(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole('button', { name: 'Outline' }).className).toContain('border');
  });
});
