import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';

const meta = {
  title: 'Components/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EvidenceCard: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>T12 area</CardTitle>
        <CardDescription>0.267 s lost · minimum speed 2 km/h lower</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        Carry a little more minimum speed (124 vs 126 km/h) and keep the exit speed up.
      </CardContent>
      <CardFooter>
        <Badge variant="outline">Open evidence</Badge>
      </CardFooter>
    </Card>
  ),
};
