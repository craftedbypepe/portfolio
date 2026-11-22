import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Approximate</Button>
      </TooltipTrigger>
      <TooltipContent>Braking points are shown as approximate observations.</TooltipContent>
    </Tooltip>
  ),
};
