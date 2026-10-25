#!/usr/bin/env bash
# PERIPH-0.2/Paky-01 local commissioning discovery.
# READ-ONLY: no sudo, no serial opens, no systemctl start/stop/enable,
# no Docker changes, no Python publisher execution, no token contents.
set -u
export LC_ALL=C

heading() { printf '\n=== %s ===\n' "$1"; }

heading 'OPENRGD PERIPHERAL HOST PREFLIGHT / READ ONLY'
printf 'UTC: '; date -u '+%Y-%m-%dT%H:%M:%SZ'
printf 'Host: '; hostname
printf 'User: '; id -un
printf 'UID: '; id -u
printf 'Groups: '; id -nG
printf 'XDG_RUNTIME_DIR: %s\n' "${XDG_RUNTIME_DIR:-NOT_SET}"

heading 'CURRENT CONSOLE AND PAKY-01 SOURCES / NO MODIFICATIONS'
CONSOLE="${CONSOLE_SOURCE_DIR:-$HOME/openrgd/repos/openrgd-console}"
PAKY="${PAKY_SOURCE_DIR:-$HOME/openrgd/repos/paky-01}"
for item in "$CONSOLE" "$PAKY"; do
  printf '\nDirectory: %s\n' "$item"
  if [ ! -d "$item/.git" ] && ! git -C "$item" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo 'Repo unavailable at this path (not treated as clean)'
    continue
  fi
  printf 'Branch: '
  git -C "$item" branch --show-current 2>/dev/null || true
  printf 'Commit: '
  git -C "$item" rev-parse --short HEAD 2>/dev/null || true
  printf 'Worktree changes: '
  git -C "$item" status --porcelain=v1 -uno 2>/dev/null | wc -l
  printf 'IMU files present: '
  if [ "$item" = "$PAKY" ]; then
    [ -f "$item/scripts/imu_publish.py" ] && echo 'publisher found' || echo 'publisher absent'
  else
    [ -f "$item/services/api/src/imu.rs" ] && echo 'Console IMU ingress found' || echo 'Console IMU ingress absent'
  fi
done

heading 'IMU SOURCE IDENTITY DECLARATION / NOT A HARDWARE MEASUREMENT'
INSTANCE="$PAKY/parameters/imu_instance.json"
IMU_PATH=''
if [ -f "$INSTANCE" ] && [ ! -L "$INSTANCE" ]; then
  # Print no raw JSON, credentials or sensitive observations.
  IMU_PATH="$(python3 - "$INSTANCE" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    if d.get('robot_id') != 'paky-01' or d.get('sensor_id') != 'torso-imu-01':
        raise ValueError('unexpected IMU identity')
    host = d.get('host', {})
    path = host.get('port_by_path', '')
    if not isinstance(path, str) or not path.startswith('/dev/serial/by-path/'):
        raise ValueError('unconfigured by-path')
    print(path)
except (OSError, ValueError, TypeError):
    pass
PY
)"
  python3 - "$INSTANCE" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding='utf-8') as f:
        d=json.load(f)
    print('Robot:',d.get('robot_id'), '| Sensor:',d.get('sensor_id'))
    print('Reported VID:PID:',d.get('host',{}).get('device_usb_vid_pid'))
    print('Reported baud:',d.get('host',{}).get('baud_observed'))
    print('Sensor-to-torso calibration:',d.get('calibration',{}).get('state','UNKNOWN'))
except (OSError, ValueError, TypeError):
    print('Instance file invalid or not readable')
PY
else
  echo 'Paky-01 imu_instance.json missing (stop commissioning until source is confirmed)'
fi

heading 'ACTUAL USB ID / READ-ONLY UDEV METADATA'
if [ -n "$IMU_PATH" ]; then
  printf 'Configured by-path: %s\n' "$IMU_PATH"
  if [ -e "$IMU_PATH" ]; then
    printf 'Resolved USB endpoint: '
    readlink -f -- "$IMU_PATH" || true
    [ -r "$IMU_PATH" ] && echo 'Readable by current user: YES' || echo 'Readable by current user: NO'
    [ -w "$IMU_PATH" ] && echo 'Writable by current user: YES' || echo 'Writable by current user: NO'
    if command -v udevadm >/dev/null 2>&1; then
      udevadm info --query=property --name="$IMU_PATH" 2>/dev/null |
        grep -E '^(ID_VENDOR_ID|ID_MODEL_ID|ID_SERIAL_ID|ID_USB_DRIVER)=' || true
    fi
  else
    echo 'Configured IMU path currently ABSENT'
  fi
else
  echo 'No verified configured IMU path: no USB device probed'
fi

heading 'PYTHON RUNTIME / MODULE METADATA ONLY'
python3 - <<'PY'
import sys
print('Default Python executable:',sys.executable)
try:
    import serial
    print('Default Python pyserial: IMPORT_OK', getattr(serial, '__version__', '?'))
except ImportError:
    print('Default Python pyserial: MISSING (may be in existing venv)')
PY
TOKEN="$HOME/.config/openrgd/imu-ingest-token"
if [ -L "$TOKEN" ]; then
  echo 'Token metadata: SYMLINK (must not use)'
elif [ -f "$TOKEN" ]; then
  stat -c 'Token metadata: mode=%a owner=%U type=%F (contents NOT read)' "$TOKEN"
else
  echo 'Token metadata: MISSING'
fi

heading 'HOST USER SERVICES / STATUS ONLY'
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user show openrgd-paky01-imu.service \
    --property=LoadState,ActiveState,SubState,UnitFileState --no-pager 2>&1 | head -12 || true
  systemctl --user show openrgd-peripheral-broker.service \
    --property=LoadState,ActiveState,SubState,UnitFileState --no-pager 2>&1 | head -12 || true
else
  echo 'systemctl missing'
fi

heading 'EXISTING IMU PUBLISHER PROCESS / IDENTITY ONLY'
if command -v pgrep >/dev/null 2>&1; then
  IDS="$(pgrep -f '[p]ython[^[:space:]]*.*imu_publish.py|[i]mu_publish.py' | paste -sd, - || true)"
  if [ -n "$IDS" ]; then
    # No command lines, process environment, tokens or arguments are printed.
    ps -o pid,ppid,stat,etime,comm -p "$IDS" 2>/dev/null || true
  else
    echo 'No imu_publish.py process detected'
  fi
else
  echo 'pgrep not available'
fi

heading 'CONSOLE ACCEPTED IMU STATE / VALUES NOT PRINTED'
if command -v curl >/dev/null 2>&1; then
  OUTPUT="$(curl -fsS --max-time 3 http://127.0.0.1:8088/api/v1/robots/paky-01/imu 2>/dev/null)" || OUTPUT=''
  if [ -n "$OUTPUT" ]; then
    printf '%s\n' "$OUTPUT" | python3 -c '
import json,sys
try:
    obj=json.load(sys.stdin)
    if obj is None:
        print("Console IMU: NO_FRESH_SOURCE (null)")
    elif isinstance(obj,dict):
        print("Console IMU: record received")
        for k in ("schema_version","robot_id","sensor_id","source_id","source_kind"):
            print(k+":",str(obj.get(k,"MISSING"))[:100])
        print("Received timestamp: ",str(obj.get("console_received_at","MISSING"))[:100])
    else:
        print("Console IMU response: unexpected JSON type")
except (ValueError,TypeError):
    print("Console IMU response: invalid JSON")
'
  else
    echo 'Console IMU GET unavailable at 127.0.0.1:8088 (not evidence of device failure)'
  fi
else
  echo 'curl unavailable'
fi

heading 'PREFLIGHT COMPLETE / NO CHANGES'
echo 'No service installed, started, stopped or enabled.'
echo 'No hardware serial port opened, no token contents read, no motor commands.'
