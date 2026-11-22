import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from '../components/ui/skeleton';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EvidenceCardLoading: Story = {
  render: () => (
    <div className="max-w-sm space-y-2">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
};
