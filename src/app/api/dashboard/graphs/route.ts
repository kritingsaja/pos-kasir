import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const db = getDb();

        // 1. Daily Realtime (Per Hour Today)
        const today = new Date().toISOString().split('T')[0];
        const dailyTransactionsRes = await db.execute({
            sql: 'SELECT waktu, total FROM transactions WHERE tanggal = ?',
            args: [today]
        });
        const dailyTransactions = dailyTransactionsRes.rows as unknown as { waktu: string; total: number }[];

        const hourlySales = Array.from({ length: 24 }, (_, i) => ({
            hour: `${i.toString().padStart(2, '0')}:00`,
            total: 0
        }));

        dailyTransactions.forEach(t => {
            const hour = parseInt(t.waktu.split(':')[0], 10);
            if (!isNaN(hour) && hour >= 0 && hour <= 23) {
                hourlySales[hour].total += Number(t.total);
            }
        });

        // 2. Monthly (Per Day This Month)
        const currentMonth = today.substring(0, 7); // yyyy-mm
        const monthlyTransactionsRes = await db.execute({
            sql: `SELECT tanggal, SUM(total) as daily_total 
                  FROM transactions 
                  WHERE tanggal LIKE ? 
                  GROUP BY tanggal
                  ORDER BY tanggal ASC`,
            args: [`${currentMonth}%`]
        });
        const monthlyTransactions = monthlyTransactionsRes.rows as unknown as { tanggal: string; daily_total: number }[];

        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const dailySales = Array.from({ length: daysInMonth }, (_, i) => {
            const dateStr = `${currentMonth}-${(i + 1).toString().padStart(2, '0')}`;
            const found = monthlyTransactions.find(t => t.tanggal === dateStr);
            return {
                date: dateStr,
                day: i + 1,
                total: found ? found.daily_total : 0
            };
        });

        // 3. Yearly (Per Month This Year)
        const currentYear = today.substring(0, 4); // yyyy
        const yearlyTransactionsRes = await db.execute({
            sql: `SELECT substr(tanggal, 1, 7) as month, SUM(total) as monthly_total 
                  FROM transactions 
                  WHERE tanggal LIKE ? 
                  GROUP BY month
                  ORDER BY month ASC`,
            args: [`${currentYear}%`]
        });
        const yearlyTransactions = yearlyTransactionsRes.rows as unknown as { month: string; monthly_total: number }[];

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const monthlySales = months.map((m, i) => {
            const monthStr = `${currentYear}-${(i + 1).toString().padStart(2, '0')}`;
            const found = yearlyTransactions.find(t => t.month === monthStr);
            return {
                month: m,
                fullMonth: monthStr,
                total: found ? found.monthly_total : 0
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                hourly: hourlySales,
                daily: dailySales,
                monthly: monthlySales
            }
        });

    } catch (error) {
        console.error('Error fetching graph data:', error);
        return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
    }
}
