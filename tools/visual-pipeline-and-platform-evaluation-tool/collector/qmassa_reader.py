#!/usr/bin/env python3

import json
import logging
import os
import re
import sys
import time

# === Constants ===
FIFO_FILE = "/app/qmassa.fifo"
DEBUG_LOG = "/app/qmassa_reader_trace.log"
HOSTNAME = os.uname()[1]
RETRY_DELAY = 1  # seconds to wait before retrying after recoverable errors

# Configure logger
file_handler = logging.FileHandler(DEBUG_LOG)
file_handler.setFormatter(
    logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )
)

logger = logging.getLogger()
# Set to DEBUG for verbose logging to help diagnose GPU metric collection
logger.setLevel(logging.DEBUG)
logger.handlers = [file_handler]


def emit_engine_usage(eng_usage, gpu_id, ts):
    """Emit GPU engine usage metrics."""
    if not isinstance(eng_usage, dict):
        logger.warning(f"eng_usage is not a dict: {type(eng_usage)}")
        return

    for eng, vals in eng_usage.items():
        if vals:
            try:
                usage_value = vals[-1]
                if usage_value is not None:
                    print(
                        f"gpu_engine_usage,engine={eng},type={eng},host={HOSTNAME},gpu_id={gpu_id} usage={usage_value} {ts}"
                    )
                    logger.debug(f"Emitted engine_usage for {eng}: {usage_value}")
            except Exception as e:
                logger.error(f"Error emitting engine usage for engine {eng}: {e}")


def emit_frequency(freqs, gpu_id, ts):
    """Emit GPU frequency metrics."""
    if not freqs:
        logger.debug("No frequency data available")
        return

    try:
        # Handle both list of lists and list of dicts
        freq_entry = None
        if isinstance(freqs[-1], list) and len(freqs[-1]) > 0:
            freq_entry = freqs[-1][0]
        elif isinstance(freqs[-1], dict):
            freq_entry = freqs[-1]

        if isinstance(freq_entry, dict) and "cur_freq" in freq_entry:
            freq_value = freq_entry['cur_freq']
            print(
                f"gpu_frequency,type=cur_freq,host={HOSTNAME},gpu_id={gpu_id} value={freq_value} {ts}"
            )
            logger.debug(f"Emitted frequency: {freq_value}")
        else:
            logger.debug(f"Frequency entry doesn't have cur_freq: {freq_entry}")
    except Exception as e:
        logger.error(f"Error emitting frequency for gpu {gpu_id}: {e}")


def emit_power(power, gpu_id, ts):
    """Emit GPU power metrics."""
    if not power:
        logger.debug("No power data available")
        return

    try:
        power_entry = power[-1]
        if not isinstance(power_entry, dict):
            logger.warning(f"power_entry is not a dict: {type(power_entry)}")
            return

        for key, val in power_entry.items():
            if val is not None:
                print(
                    f"gpu_power,type={key},host={HOSTNAME},gpu_id={gpu_id} value={val} {ts}"
                )
                logger.debug(f"Emitted power metric {key}: {val}")
    except Exception as e:
        logger.error(f"Error emitting power metrics for gpu {gpu_id}: {e}")


def process_device_metrics(dev, gpu_id, current_ts_ns):
    """Process and emit metrics for a single GPU device."""
    try:
        dev_stats = dev.get("dev_stats", {})
        if not dev_stats:
            logger.warning(f"No dev_stats found for gpu_id {gpu_id}")
            return

        eng_usage = dev_stats.get("eng_usage", {})
        freqs = dev_stats.get("freqs", [])
        power = dev_stats.get("power", [])

        logger.debug(f"Processing gpu_id {gpu_id}: eng_usage keys={list(eng_usage.keys()) if eng_usage else 'None'}, freqs_len={len(freqs) if freqs else 0}, power_len={len(power) if power else 0}")

        emit_engine_usage(eng_usage, gpu_id, current_ts_ns)
        emit_frequency(freqs, gpu_id, current_ts_ns)
        emit_power(power, gpu_id, current_ts_ns)
    except Exception as e:
        logger.error(f"Error processing device metrics for gpu_id {gpu_id}: {e}")


def process_line(state_line):
    try:
        state = json.loads(state_line)

        # If parsed JSON is not an object, skip and log.
        if not isinstance(state, dict):
            logger.debug(
                "Skipping line: parsed JSON is not an object (expected top-level dict)"
            )
            return

        # Use state.get with a safe default list and treat missing/empty as skip.
        ts = state.get("timestamps", [])
        if not ts:
            logger.debug("Skipping line: missing or empty top-level 'timestamps'")
            return

        current_ts_ns = int(time.time() * 1e9)
        devs_state = state.get("devs_state", [])
        if not devs_state:
            logger.warning("Skipping line: no devs_state found in state line")
            return

        # Process all devices in devs_state
        devices_found = 0
        for dev in devs_state:
            dev_nodes = dev.get("dev_nodes", "")
            match = re.search(r"renderD(\d+)", dev_nodes)
            if not match:
                logger.debug(f"No renderD match in dev_nodes: {dev_nodes}")
                continue  # no renderD<number> found, skip this device

            number = int(match.group(1))
            if number < 128:
                logger.warning(
                    f"renderD{number} in dev_nodes '{dev_nodes}' is less than 128, skipping device"
                )
                continue

            gpu_id = number - 128
            logger.info(f"Found GPU device: renderD{number} (gpu_id={gpu_id})")
            process_device_metrics(dev, gpu_id, current_ts_ns)
            devices_found += 1
            sys.stdout.flush()

        if devices_found == 0:
            logger.warning("No valid GPU devices found in this state line")
    except Exception as e:
        logger.error(f"Error processing line: {e}")


def main():
    logger.info(f"Starting qmassa_reader, reading from FIFO: {FIFO_FILE}")
    logger.info(f"Debug log file: {DEBUG_LOG}")
    lines_processed = 0
    while True:
        try:
            # Open the FIFO for reading (blocks until a writer is available)
            logger.info(f"Opening FIFO: {FIFO_FILE}")
            with open(FIFO_FILE, "r") as fifo:
                logger.info("FIFO opened successfully, waiting for data...")
                # Read lines from the FIFO, blocking until data is available
                for state_line in fifo:
                    state_line = state_line.strip()
                    if not state_line:
                        continue
                    lines_processed += 1
                    logger.debug(f"Processing line {lines_processed} (length: {len(state_line)})")
                    process_line(state_line)
            # If we reach here, the writer closed the FIFO. Loop to reopen and wait for new writers.
            logger.info("FIFO writer closed, waiting to reopen...")
        except (KeyboardInterrupt, SystemExit):
            # Allow graceful termination by external signals
            logger.info(f"Termination requested, exiting. Processed {lines_processed} lines.")
            raise
        except FileNotFoundError as e:
            logger.error(f"FIFO file not found: {FIFO_FILE}. Does qmassa process exist?")
            logger.exception(f"Error: {e}")
            time.sleep(RETRY_DELAY)
            continue
        except Exception as e:
            # Log full traceback for diagnostics and retry after a delay for recoverable errors.
            logger.exception(
                f"Error reading from FIFO (will retry after {RETRY_DELAY}s): {e}"
            )
            time.sleep(RETRY_DELAY)
            continue


if __name__ == "__main__":
    main()
