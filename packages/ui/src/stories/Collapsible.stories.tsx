import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';

const meta = {
  title: 'Components/Collapsible',
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Collapsible className="max-w-sm space-y-2">
      <CollapsibleTrigger asChild>
        <Button variant="outline">Show data coverage</Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="text-sm text-muted-foreground">
        Lap 3 covers 0–4,300 m with no gaps over 10 m.
      </CollapsibleContent>
    </Collapsible>
  ),
};
