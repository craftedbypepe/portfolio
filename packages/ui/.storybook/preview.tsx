import type { Preview, ReactRenderer } from '@storybook/react-vite';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import { TooltipProvider } from '../src/components/ui/tooltip';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  decorators: [
    withThemeByDataAttribute<ReactRenderer>({
      themes: { sketch: 'sketch', blueprint: 'blueprint', dark: 'dark' },
      defaultTheme: 'sketch',
      attributeName: 'data-theme',
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
