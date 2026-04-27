# 🚀 Setup Subdomain untuk POS Kasir

## **Current Server IP:**
```
$(curl -s ifconfig.me)
```

## **Step 1: DNS Configuration**
Tambahkan record **A** di domain teacoxplus.cloud:

```
Type: A
Name: pos
Value: $(curl -s ifconfig.me)  # IP server kamu
TTL: 3600
```

## **Step 2: Nginx Configuration (Sudah Setup)**
File: `/etc/nginx/sites-available/pos-teacoxplus.conf`

## **Step 3: Test DNS**
```bash
# Setelah DNS propagate (bisa 5-60 menit)
nslookup pos.teacoxplus.cloud
ping pos.teacoxplus.cloud
```

## **Step 4: SSL Certificate (Optional)**
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d pos.teacoxplus.cloud
```

## **🌐 Access URLs:**

### **Local Access:**
- http://localhost:3000
- http://server-ip:3000

### **Public Access (After DNS):**
- http://pos.teacoxplus.cloud
- https://pos.teacoxplus.cloud (after SSL)

## **📱 Mobile Features:**
1. **Login** - Username: admin, Password: admin123
2. **Product Management** - Tambah/edit/hapus produk
3. **Transactions** - Buat transaksi penjualan
4. **Reports** - Lihat laporan penjualan

## **🔧 Maintenance:**
```bash
# Restart service
pm2 restart pos-kasir

# Check logs
pm2 logs pos-kasir

# Backup database
./backup.sh

# Monitor
./monitor.sh
```

## **📞 Support:**
Jika ada masalah:
1. Cek PM2 status: `pm2 status pos-kasir`
2. Cek Nginx logs: `sudo tail -f /var/log/nginx/pos-teacoxplus.error.log`
3. Restart semua: `sudo systemctl restart nginx && pm2 restart pos-kasir`