import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="debrief" className="max-w-md">
      <TabsList>
        <TabsTrigger value="debrief">Debrief</TabsTrigger>
        <TabsTrigger value="strategy">Strategy</TabsTrigger>
        <TabsTrigger value="replay">Replay</TabsTrigger>
      </TabsList>
      <TabsContent value="debrief">Top 3 areas where time is lost.</TabsContent>
      <TabsContent value="strategy">Stints, lap-time trends and stops.</TabsContent>
      <TabsContent value="replay">Lap-by-lap timing tower with radio calls.</TabsContent>
    </Tabs>
  ),
};
