#!/bin/bash
echo "=== POS-KASIR MONITOR ==="
echo "1. PM2 Status:"
pm2 status pos-kasir --silent || echo "Not running"
echo ""
echo "2. Server Health:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/api/products
echo ""
echo "3. Database Size:"
ls -lh /root/pos-kasir/pos-kasir.db 2>/dev/null || echo "Database not found"
echo ""
echo "4. Recent Logs:"
pm2 logs pos-kasir --lines 5 --silent 2>/dev/null || echo "No logs"
