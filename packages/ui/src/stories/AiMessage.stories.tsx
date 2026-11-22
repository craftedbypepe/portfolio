import type { Meta, StoryObj } from '@storybook/react-vite';
import { Message, MessageContent, MessageResponse } from '../components/ai-elements/message';

const meta = {
  title: 'AI Elements/Message',
  component: Message,
  args: { from: 'assistant' },
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <Message from="user">
        <MessageContent>Why am I slow in the last sector?</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>
            {'Most of the time goes in the **T12 area**: 0.267 s, with minimum speed 2 km/h lower.'}
          </MessageResponse>
        </MessageContent>
      </Message>
    </div>
  ),
};
