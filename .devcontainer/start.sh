#!/usr/bin/env bash
set -e

if [ -z "${VK_GROUP_ID:-}" ]; then
  echo "⚠ VK_GROUP_ID не найден в Codespaces Secrets"
else
  echo "✓ VK_GROUP_ID найден"
fi

if [ -z "${VK_ACCESS_TOKEN:-}" ]; then
  echo "⚠ VK_ACCESS_TOKEN не найден в Codespaces Secrets"
else
  echo "✓ VK_ACCESS_TOKEN найден"
fi

if pgrep -f "node server.js" >/dev/null 2>&1; then
  echo "✓ Сервер уже запущен"
else
  nohup npm start > /tmp/add-vkmarket.log 2>&1 &
  echo "✓ Сервер запущен на порту 3000"
  echo "Лог: /tmp/add-vkmarket.log"
fi
