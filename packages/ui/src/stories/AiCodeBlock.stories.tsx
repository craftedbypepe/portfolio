import type { Meta, StoryObj } from '@storybook/react-vite';
import { CodeBlock } from '../components/ai-elements/code-block';

const meta = {
  title: 'AI Elements/Code block',
  component: CodeBlock,
  args: {
    language: 'json',
    code: JSON.stringify({ corner: 'T12', timeLostS: 0.267 }, null, 2),
  },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ToolOutputJson: Story = {};
