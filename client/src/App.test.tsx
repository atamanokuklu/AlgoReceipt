import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          merchantDid: 'did:key:zMerchant',
          merchantPaymentAddress: 'ADDR',
          offer: {
            path: '/v1/market-data/ALGO-USD',
            description: 'ALGO/USD paid market snapshot',
            requestAmountUsd: 0.05,
            amountMicroAlgos: 100000,
            asset: 'ALGO',
            network: 'algorand-localnet'
          },
          algod: {
            reachable: false,
            mode: 'offline',
            url: 'http://localhost:4001',
            tokenConfigured: false,
            message: 'offline'
          }
        })
      })
    );
  });

  test('renders the flow title and step headings', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /agent identity & verifiable payment receipts/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /agent requests a paid resource/i })).toBeInTheDocument();
    expect(await screen.findByText(/offline simulation mode/i)).toBeInTheDocument();
  });
});
