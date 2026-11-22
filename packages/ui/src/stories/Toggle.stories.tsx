import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadioIcon } from 'lucide-react';
import { Toggle } from '../components/ui/toggle';

const meta = {
  title: 'Components/Toggle',
  component: Toggle,
  args: { 'aria-label': 'Radio effect', defaultPressed: true },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RadioEffect: Story = {
  render: (args) => (
    <Toggle {...args}>
      <RadioIcon />
      Radio effect
    </Toggle>
  ),
};
export const Outline: Story = {
  args: { variant: 'outline' },
  render: (args) => <Toggle {...args}>Radio effect</Toggle>,
};
