#!/usr/bin/env python3
"""Create private rehearsal credentials and apply only to the dedicated kind cluster."""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kubeconfig', required=True)
    parser.add_argument('--directory', type=Path, required=True)
    args = parser.parse_args()
    command = ['kubectl', '--kubeconfig', args.kubeconfig]
    context = subprocess.check_output(command + ['config', 'current-context'], text=True).strip()
    if context != 'kind-plannet-verify':
        raise SystemExit('Verification secrets require a dedicated kind-plannet-verify context')
    directory = args.directory
    if directory.is_symlink():
        raise SystemExit('Private credential directory must not be a symlink')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory.chmod(0o700)
    existing = subprocess.check_output(command + ['-n', 'plannet', 'get', 'secret', 'plannet-db-secret', '--ignore-not-found', '-o', 'name'], text=True).strip()
    values = {}
    for role in ('admin', 'app'):
        path = directory / f'{role}.password'
        if path.is_symlink():
            raise SystemExit('Credential file must not be a symlink')
        if not path.exists():
            if existing:
                raise SystemExit('Existing verification DB credentials must be preserved; refusing password rotation')
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'w') as file:
                file.write(secrets.token_hex(32))
        if path.stat().st_uid != os.getuid():
            raise SystemExit('Credential file must be owned by the current user')
        path.chmod(0o600)
        values[role] = path.read_text().strip()
        if len(values[role]) != 64 or any(c not in '0123456789abcdef' for c in values[role]):
            raise SystemExit('Invalid private rehearsal credential file')
    resources = [
        ('plannet-db-secret', {'ADMIN_PASSWORD': values['admin'], 'APP_PASSWORD': values['app']}),
        ('plannet-api-secret', {
            'GOOGLE_CLIENT_ID': os.environ['MOCK_CLIENT_ID'],
            'GOOGLE_CLIENT_SECRET': os.environ['MOCK_CLIENT_SECRET'],
            'PLANNET_DB_URL': 'jdbc:postgresql://plannet-db:5432/plannet',
            'PLANNET_DB_USERNAME': 'plannet_app',
            'PLANNET_DB_PASSWORD': values['app'],
        }),
    ]
    for name, data in resources:
        encoded = {key: base64.b64encode(value.encode()).decode() for key, value in data.items()}
        resource = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'name': name, 'namespace': 'plannet'}, 'type': 'Opaque', 'data': encoded}
        # stdin only; never print Secret documents or embed passwords in process arguments.
        # Server-side apply: client-side apply would copy the values into the last-applied-configuration annotation.
        subprocess.run(command + ['apply', '--server-side', '--force-conflicts', '--field-manager=plannet-verify', '-f', '-'],
                       input=json.dumps(resource), text=True, check=True, stdout=subprocess.DEVNULL)
    print('Private DB credentials ready; required API and DB Secrets applied')


if __name__ == '__main__':
    main()
