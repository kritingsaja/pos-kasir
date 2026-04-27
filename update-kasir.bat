@echo off
echo Updating pos-kasir...
cd /d "C:\Users\User\homeserver"
docker compose build --no-cache pos-kasir
docker compose up -d pos-kasir
echo Done!
pause