const toCents = (value: number) => Math.round(value * 100);

export class SpendLedger {
  private readonly totals = new Map<string, number>();

  getUsedToday(subjectDid: string, date = new Date()): number {
    return (this.totals.get(this.key(subjectDid, date)) ?? 0) / 100;
  }

  assertCanSpend(subjectDid: string, amountUsd: number, dailyCapUsd: number, date = new Date()): void {
    const nextTotalCents = toCents(this.getUsedToday(subjectDid, date) + amountUsd);
    if (nextTotalCents > toCents(dailyCapUsd)) {
      throw new Error(
        `Daily cap exceeded: ${formatUsd(nextTotalCents / 100)} would be above ${formatUsd(dailyCapUsd)}`
      );
    }
  }

  recordSpend(subjectDid: string, amountUsd: number, date = new Date()): number {
    const key = this.key(subjectDid, date);
    const nextValue = (this.totals.get(key) ?? 0) + toCents(amountUsd);
    this.totals.set(key, nextValue);
    return nextValue / 100;
  }

  private key(subjectDid: string, date: Date): string {
    return `${subjectDid}|${date.toISOString().slice(0, 10)}`;
  }
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}
