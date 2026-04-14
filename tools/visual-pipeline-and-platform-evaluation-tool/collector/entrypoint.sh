#!/bin/bash

# Ensure the named pipe for qmassa exists and is writable
if [ ! -p /app/qmassa.fifo ]; then
    mkfifo /app/qmassa.fifo
fi
chmod 666 /app/qmassa.fifo

# Telegraf and qmassa are started and managed by supervisord
/usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
