import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

const meta = {
  title: 'Components/Table',
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const rows = [
  { pos: 1, driver: 'Mo', gap: 'Leader' },
  { pos: 2, driver: 'Tom', gap: '+0.8' },
  { pos: 3, driver: 'ColdTyres', gap: '+1.4' },
];

export const TimingTower: Story = {
  render: () => (
    <Table className="max-w-sm">
      <TableCaption>Lap 8 · VSC</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Pos</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead className="text-right">Gap</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.pos}>
            <TableCell>{row.pos}</TableCell>
            <TableCell>{row.driver}</TableCell>
            <TableCell className="text-right font-mono">{row.gap}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
