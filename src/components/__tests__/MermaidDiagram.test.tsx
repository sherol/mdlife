// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MermaidDiagram, RERENDER_DELAY_MS } from '../MermaidDiagram';

const fake = vi.hoisted(() => ({
  rendered: [] as string[],
  gate: null as Promise<void> | null,
  initialize: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: fake.initialize,
    render: async (_id: string, code: string) => {
      fake.rendered.push(code);
      if (fake.gate) await fake.gate;
      return { svg: `<svg data-code="${code}"></svg>` };
    },
  },
}));

const svgCodes = (container: HTMLElement) =>
  [...container.querySelectorAll('svg')].map((el) => el.getAttribute('data-code'));

describe('MermaidDiagram', () => {
  afterEach(cleanup);

  beforeEach(() => {
    fake.rendered = [];
    fake.gate = null;
    fake.initialize.mockClear();
  });

  it('draws the first diagram at once with strict security', async () => {
    const { container } = render(<MermaidDiagram code="graph TD; A-->B" />);
    await waitFor(() => expect(svgCodes(container)).toEqual(['graph TD; A-->B']));
    expect(fake.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'strict' }),
    );
  });

  it('draws only the latest source while typing', async () => {
    const { container, rerender } = render(<MermaidDiagram code="v1" />);
    await waitFor(() => expect(svgCodes(container)).toEqual(['v1']));

    vi.useFakeTimers();
    try {
      for (const code of ['v2', 'v3', 'v4', 'v5']) {
        rerender(<MermaidDiagram code={code} />);
        await act(async () => vi.advanceTimersByTime(RERENDER_DELAY_MS / 3));
      }
      // The previous drawing stays up while typing continues.
      expect(svgCodes(container)).toEqual(['v1']);
      await act(async () => vi.advanceTimersByTime(RERENDER_DELAY_MS));
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(svgCodes(container)).toEqual(['v5']));
    expect(fake.rendered).toEqual(['v1', 'v5']);
  });

  it('skips renders superseded while waiting in the queue', async () => {
    let release!: () => void;
    fake.gate = new Promise<void>((r) => (release = r));
    const { container, rerender } = render(<MermaidDiagram code="a" />);
    await waitFor(() => expect(fake.rendered).toEqual(['a']));
    // Not drawn yet, so these go straight to the queue behind "a".
    rerender(<MermaidDiagram code="b" />);
    rerender(<MermaidDiagram code="c" />);
    fake.gate = null;
    await act(async () => release());
    await waitFor(() => expect(svgCodes(container)).toEqual(['c']));
    expect(fake.rendered).toEqual(['a', 'c']);
  });

  it('draws several diagrams in one note', async () => {
    const { container } = render(
      <>
        <MermaidDiagram code="one" />
        <MermaidDiagram code="two" />
      </>,
    );
    await waitFor(() => expect(svgCodes(container)).toEqual(['one', 'two']));
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
});
