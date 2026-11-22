import type { Meta, StoryObj } from '@storybook/react-vite';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../components/ai-elements/reasoning';

const meta = {
  title: 'AI Elements/Reasoning',
  component: Reasoning,
} satisfies Meta<typeof Reasoning>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Finished: Story = {
  render: () => (
    <Reasoning className="max-w-xl" duration={4} defaultOpen>
      <ReasoningTrigger />
      <ReasoningContent>
        {'Compared corner losses for laps 2 and 3. T12, T8–T11 and T2 are the three largest.'}
      </ReasoningContent>
    </Reasoning>
  ),
};

export const Streaming: Story = {
  render: () => (
    <Reasoning className="max-w-xl" isStreaming defaultOpen>
      <ReasoningTrigger />
      <ReasoningContent>{'Checking which metrics are reportable…'}</ReasoningContent>
    </Reasoning>
  ),
};
