import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', 'app.log');

if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, type = 'info', time, userAgent } = body;
    const logEntry = `[${time || new Date().toISOString()}] [${type.toUpperCase()}] ${message} | UA: ${userAgent || 'unknown'}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
    console.log(logEntry);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Log error:', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return new Response('No logs yet', { headers: { 'Content-Type': 'text/plain' } });
    }
    const logs = fs.readFileSync(LOG_FILE, 'utf8');
    return new Response(logs, { headers: { 'Content-Type': 'text/plain' } });
  } catch (error) {
    return new Response('Error reading logs: ' + String(error), { headers: { 'Content-Type': 'text/plain' } });
  }
}