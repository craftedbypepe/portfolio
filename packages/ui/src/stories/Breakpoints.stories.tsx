import type { Meta, StoryObj } from '@storybook/react-vite';
import { BREAKPOINTS, SCREENSHOT_VIEWPORTS } from '../breakpoints';

// Breakpoints and screenshot viewports (SIE-72). Resize the canvas to see which breakpoint is active.
const meta = {
  title: 'Foundations/Breakpoints',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Breakpoints: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8">
      <section>
        <p className="label-mono mb-3">Active breakpoint</p>
        <p className="font-mono text-2xl">
          <span className="sm:hidden">base (&lt; 640)</span>
          <span className="hidden sm:inline md:hidden">sm (≥ 640)</span>
          <span className="hidden md:inline lg:hidden">md (≥ 768)</span>
          <span className="hidden lg:inline xl:hidden">lg (≥ 1024)</span>
          <span className="hidden xl:inline 2xl:hidden">xl (≥ 1280)</span>
          <span className="hidden 2xl:inline">2xl (≥ 1536)</span>
        </p>
      </section>
      <table className="w-full border text-sm">
        <thead>
          <tr className="label-mono border-b text-left">
            <th className="p-2">Breakpoint</th>
            <th className="p-2">Min width</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {Object.entries(BREAKPOINTS).map(([name, px]) => (
            <tr key={name} className="border-hairline-soft border-b">
              <td className="p-2">{name}</td>
              <td className="p-2">{px}px</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full border text-sm">
        <thead>
          <tr className="label-mono border-b text-left">
            <th className="p-2">Screenshot viewport</th>
            <th className="p-2">Size</th>
            <th className="p-2">Why</th>
          </tr>
        </thead>
        <tbody>
          {SCREENSHOT_VIEWPORTS.map((v) => (
            <tr key={v.name} className="border-hairline-soft border-b">
              <td className="p-2 font-mono">{v.name}</td>
              <td className="p-2 font-mono">
                {v.width} × {v.height}
              </td>
              <td className="text-muted-foreground p-2">{v.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
};
