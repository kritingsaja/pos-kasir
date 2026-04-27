import { NextResponse } from 'next/server';
import { getAllSettings, updateSetting } from '@/lib/db';

export async function GET() {
    try {
        const settings = await getAllSettings();
        return NextResponse.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ success: false, error: 'Gagal mengambil pengaturan' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        for (const [key, value] of Object.entries(body)) {
            await updateSetting(key, value as string);
        }
        return NextResponse.json({ success: true, message: 'Pengaturan berhasil disimpan' });
    } catch (error) {
        console.error('Error saving settings:', error);
        return NextResponse.json({ success: false, error: 'Gagal menyimpan pengaturan' }, { status: 500 });
    }
}
