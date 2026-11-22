import type { Meta, StoryObj } from '@storybook/react-vite';
import { Shimmer } from '../components/ai-elements/shimmer';

const meta = {
  title: 'AI Elements/Shimmer',
  component: Shimmer,
  args: { children: 'Comparing laps…' },
} satisfies Meta<typeof Shimmer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
