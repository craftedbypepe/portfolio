import type { Meta, StoryObj } from '@storybook/react-vite';
import { Separator } from '../components/ui/separator';

const meta = {
  title: 'Components/Separator',
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="max-w-sm text-sm">
      <p>Sector 1</p>
      <Separator className="my-2" />
      <p>Sector 2</p>
    </div>
  ),
};
