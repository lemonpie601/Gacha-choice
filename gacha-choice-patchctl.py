#!/usr/bin/env python3
"""Install/remove the Gacha Choice runtime patch on a Docker Compose Marinara without touching other hooks."""
import argparse
import hashlib
import pathlib
import re
import shutil
import subprocess

ROOT = pathlib.Path('/root/Marinara-Engine')
OVERRIDE = ROOT / 'docker-compose.override.yml'
FILES = ['gacha-choice-runtime.cjs', 'gacha-choice-selftest.cjs']
HERE = pathlib.Path(__file__).resolve().parent
MOUNTS = ['./' + f + ':/app/' + f + ':ro' for f in FILES]
REQUIRE = '--require=/app/gacha-choice-runtime.cjs'
# The Marinara image sets this itself; a compose NODE_OPTIONS replaces it, so a new value keeps it.
IMAGE_DEFAULT = '--max-old-space-size=4096'
STATE = ROOT / '.gacha-choice-patch-state'

def digest(b): return hashlib.sha256(b).hexdigest()
def stop(message): raise SystemExit('STOP: ' + message)
def present(s): return REQUIRE in s or MOUNTS[0] in s

def patch(s):
    if (REQUIRE in s) != (MOUNTS[0] in s): stop('incomplete gacha-choice setup; inspect override manually')
    if present(s): return s, 'already-installed'
    if not s.strip(): s = 'services:\n  marinara:\n'
    if not re.search(r'(?m)^services:\s*$', s): stop('override YAML has no top-level services: section')
    if not re.search(r'(?m)^  marinara:\s*$', s):
        s = s.rstrip() + '\n  marinara:\n'
    head = re.search(r'(?m)^  marinara:\s*$', s)
    start = head.end()
    next_service = re.search(r'(?m)^  [\w-]+:\s*$', s[start:])
    end = start + next_service.start() if next_service else len(s)
    body = s[start:end]
    mounts = ''.join('\n      - ' + m for m in MOUNTS)
    volumes = re.search(r'(?m)^    volumes:\s*$', body)
    if volumes:
        body = body[:volumes.end()] + mounts + body[volumes.end():]
    else:
        body = '\n    volumes:' + mounts + '\n' + body.lstrip('\n')
    env = re.search(r'(?m)^    environment:\s*$', body)
    opt = re.search(r'(?m)^(\s*)NODE_OPTIONS:\s*(["\'])(.*?)\2\s*$', body)
    if opt:
        value = ' '.join((opt.group(3) + ' ' + REQUIRE).split())
        body = body[:opt.start()] + opt.group(1) + 'NODE_OPTIONS: "' + value + '"' + body[opt.end():]
    elif re.search(r'NODE_OPTIONS', body):
        stop('NODE_OPTIONS is set in a form this tool does not edit; add ' + REQUIRE + ' to it manually')
    elif env:
        body = body[:env.end()] + '\n      NODE_OPTIONS: "' + IMAGE_DEFAULT + ' ' + REQUIRE + '"' + body[env.end():]
    else:
        body = body.rstrip('\n') + '\n    environment:\n      NODE_OPTIONS: "' + IMAGE_DEFAULT + ' ' + REQUIRE + '"\n'
    return s[:start] + body + s[end:], 'new-install'

def compose_check():
    p = subprocess.run(['docker', 'compose', 'config', '-q'], cwd=ROOT, capture_output=True, text=True)
    if p.returncode: stop('docker compose config invalid: ' + p.stderr[-500:])

def main():
    cmd = argparse.ArgumentParser()
    cmd.add_argument('action', choices=['check', 'install', 'restore', 'status'])
    args = cmd.parse_args()
    if not ROOT.is_dir(): stop(f'engine folder missing: {ROOT}')
    orig = OVERRIDE.read_text() if OVERRIDE.exists() else ''
    if args.action == 'status':
        print('gacha-choice configured:', present(orig), 'backup:', STATE.exists())
        return
    if args.action == 'restore':
        if not STATE.exists(): stop('no gacha-choice backup state')
        if digest(orig.encode()) != (STATE / 'sha256').read_text().strip():
            stop('override changed after install; manual reconciliation needed')
        before = STATE / 'override.before'
        if before.exists(): OVERRIDE.write_bytes(before.read_bytes())
        else: OVERRIDE.unlink(missing_ok=True)
        try: compose_check()
        except BaseException:
            OVERRIDE.write_text(orig)
            raise
        shutil.rmtree(STATE)
        print('CONFIG RESTORED. Run: cd /root/Marinara-Engine && docker compose up -d --force-recreate --no-deps marinara')
        return
    for f in FILES:
        if not (HERE / f).is_file(): stop(f + ' must be beside this script')
    if '[gacha-choice]' not in (HERE / FILES[0]).read_text(): stop('unrecognized runtime source')
    result, mode = patch(orig)
    if args.action == 'check':
        print('CHECK OK:', mode, '; existing NODE_OPTIONS hooks are preserved')
        return
    if mode == 'already-installed':
        for f in FILES: (ROOT / f).write_bytes((HERE / f).read_bytes())
        print('already configured; patch files updated. Run: cd /root/Marinara-Engine && docker compose up -d --force-recreate --no-deps marinara')
        return
    if STATE.exists(): stop('prior backup state exists; do not overwrite, inspect or restore first')
    STATE.mkdir(mode=0o700)
    if OVERRIDE.exists(): (STATE / 'override.before').write_bytes(OVERRIDE.read_bytes())
    try:
        for f in FILES: (ROOT / f).write_bytes((HERE / f).read_bytes())
        OVERRIDE.write_text(result)
        compose_check()
        (STATE / 'sha256').write_text(digest(OVERRIDE.read_bytes()))
        print('CONFIG APPLIED:', mode)
        print('Run: cd /root/Marinara-Engine && docker compose up -d --force-recreate --no-deps marinara')
    except BaseException:
        if (STATE / 'override.before').exists(): OVERRIDE.write_bytes((STATE / 'override.before').read_bytes())
        else: OVERRIDE.unlink(missing_ok=True)
        shutil.rmtree(STATE)
        raise

if __name__ == '__main__': main()
