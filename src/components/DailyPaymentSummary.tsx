import { formatRupiah, Transaction } from '@/lib/utils';

type Props = {
  transactions: Transaction[];
  compact?: boolean;
};

export default function DailyPaymentSummary({ transactions, compact = false }: Props) {
  const cash = transactions
    .filter((transaction) => (transaction.metode_bayar || 'tunai') === 'tunai')
    .reduce((sum, transaction) => sum + Number(transaction.total || 0), 0);
  const qris = transactions
    .filter((transaction) => transaction.metode_bayar === 'qris')
    .reduce((sum, transaction) => sum + Number(transaction.total || 0), 0);
  const total = cash + qris;

  return (
    <div className={`daily-payment-summary ${compact ? 'compact' : ''}`}>
      <div>
        <span>Cash</span>
        <strong>{formatRupiah(cash)}</strong>
      </div>
      <div>
        <span>QRIS</span>
        <strong>{formatRupiah(qris)}</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>{formatRupiah(total)}</strong>
      </div>
    </div>
  );
}
