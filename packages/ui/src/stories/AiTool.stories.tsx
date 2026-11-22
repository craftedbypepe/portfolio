import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '../components/ai-elements/tool';

const meta = {
  title: 'AI Elements/Tool',
  component: Tool,
} satisfies Meta<typeof Tool>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompletedToolCall: Story = {
  render: () => (
    <Tool defaultOpen className="max-w-xl">
      <ToolHeader title="cornerLosses" type="tool-cornerLosses" state="output-available" />
      <ToolContent>
        <ToolInput input={{ session: 'mexico-race', lapA: 2, lapB: 3 }} />
        <ToolOutput
          output={{ corner: 'T12', timeLostS: 0.267, minSpeedKmh: [124, 126] }}
          errorText={undefined}
        />
      </ToolContent>
    </Tool>
  ),
};
