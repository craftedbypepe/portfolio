import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slider } from '../components/ui/slider';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  args: { defaultValue: [8], min: 1, max: 29, step: 1, 'aria-label': 'Replay lap' },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReplayScrubber: Story = {
  render: (args) => <Slider className="max-w-sm" {...args} />,
};
