#!/bin/bash
# Test script to verify GPU metrics collection
set -e

echo "=== GPU Metrics Collection Diagnostic ==="
echo ""

# Check if FIFO exists
FIFO_FILE="/app/qmassa.fifo"
echo "1. Checking FIFO file: $FIFO_FILE"
if [ -p "$FIFO_FILE" ]; then
    echo "   ✓ FIFO exists"
    ls -la "$FIFO_FILE"
else
    echo "   ✗ FIFO does NOT exist"
fi
echo ""

# Check if qmassa process is running
echo "2. Checking if qmassa is running:"
if pgrep -f "qmassa" > /dev/null; then
    echo "   ✓ qmassa process found"
    ps aux | grep -E "qmassa" | grep -v grep
else
    echo "   ✗ qmassa process NOT running"
fi
echo ""

# Check if telegraf process is running
echo "3. Checking if telegraf is running:"
if pgrep -f "telegraf" > /dev/null; then
    echo "   ✓ telegraf process found"
    ps aux | grep -E "telegraf" | grep -v grep
else
    echo "   ✗ telegraf process NOT running"
fi
echo ""

# Check if qmassa_reader is running (spawned by telegraf/execd)
echo "4. Checking if qmassa_reader is running:"
if pgrep -f "qmassa_reader" > /dev/null; then
    echo "   ✓ qmassa_reader process found"
    ps aux | grep -E "qmassa_reader" | grep -v grep
else
    echo "   ✗ qmassa_reader process NOT running"
fi
echo ""

# Check qmassa_reader log
echo "5. Checking qmassa_reader debug log:"
LOG_FILE="/app/qmassa_reader_trace.log"
if [ -f "$LOG_FILE" ]; then
    echo "   ✓ Log file exists"
    echo "   Last 20 lines:"
    tail -20 "$LOG_FILE" | sed 's/^/   /'
else
    echo "   ✗ Log file does NOT exist"
fi
echo ""

# Try to read from FIFO (non-blocking, with timeout)
echo "6. Testing FIFO read (non-blocking):"
if [ -p "$FIFO_FILE" ]; then
    echo "   Attempting to read from FIFO (will timeout after 2 seconds)..."
    timeout 2 cat "$FIFO_FILE" 2>/dev/null | head -1 | sed 's/^/   Got: /' || echo "   (timeout or no data)"
else
    echo "   Cannot test - FIFO does not exist"
fi
echo ""

# Check /sys/class/drm for Intel GPUs
echo "7. Checking for Intel GPU devices in /sys/class/drm:"
if ls /sys/class/drm/renderD* 2>/dev/null | head -5; then
    echo "   ✓ GPU devices found"
else
    echo "   ✗ No GPU devices found"
fi
echo ""

# Check supervisor status
echo "8. Supervisor program status:"
supervisorctl status qmassa telegraf 2>/dev/null || echo "   (supervisorctl not available or no programs)"
echo ""

echo "=== Diagnostic Complete ==="
