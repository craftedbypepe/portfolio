import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../components/ui/button';
import { ButtonGroup } from '../components/ui/button-group';

const meta = {
  title: 'Components/Button group',
  component: ButtonGroup,
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Lap 2</Button>
      <Button variant="outline">Lap 3</Button>
      <Button variant="outline">Lap 4</Button>
    </ButtonGroup>
  ),
};
