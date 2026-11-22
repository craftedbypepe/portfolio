import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const meta = {
  title: 'Components/Select',
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select defaultValue="3">
      <SelectTrigger className="w-48" aria-label="Reference lap">
        <SelectValue placeholder="Reference lap" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="2">Lap 2 · 1:18.123</SelectItem>
        <SelectItem value="3">Lap 3 · 1:18.792</SelectItem>
        <SelectItem value="4">Lap 4 · 1:19.709</SelectItem>
      </SelectContent>
    </Select>
  ),
};
