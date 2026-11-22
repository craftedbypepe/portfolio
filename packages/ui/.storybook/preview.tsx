import type { Preview, ReactRenderer } from '@storybook/react-vite';
import { withThemeByClassName } from '@storybook/addon-themes';
import { TooltipProvider } from '../src/components/ui/tooltip';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  decorators: [
    withThemeByClassName<ReactRenderer>({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
    (Story) => (
      <TooltipProvider>
        <div className="bg-background text-foreground p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default preview;
