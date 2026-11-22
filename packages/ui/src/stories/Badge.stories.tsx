import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../components/ui/badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'Saved answer · Sonnet 5.5' },
  argTypes: {
    variant: { control: 'select', options: ['default', 'secondary', 'outline', 'destructive'] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Secondary: Story = { args: { variant: 'secondary', children: 'Demo mode' } };
export const Outline: Story = { args: { variant: 'outline', children: 'VSC' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Invalid lap' } };
