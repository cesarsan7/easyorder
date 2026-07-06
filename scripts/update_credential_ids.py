#!/usr/bin/env python3
"""
update_credential_ids.py
========================
Actualiza los credential IDs en todos los flujos n8n de un cliente.

USO:
  1. En La Isla n8n → Settings → Credentials → abre cada credencial
  2. Copia el ID de la URL: /credentials/[ESTE_ES_EL_ID]
  3. Edita CREDENTIAL_MAP_CLIENTE con los IDs reales
  4. Ejecuta: python scripts/update_credential_ids.py
"""

import json, os, shutil, sys
from datetime import datetime

CLIENTE_FOLDER = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', 'docs', 'n8n', 'la isla'
)

# IDs del n8n BASE (actuales en los JSONs)
BASE_IDS = {
    "postgres":      "cfmYSBh3ClVgSqjm",
    "redis":         "PGO2jku72XvMljgl",
    "openAiApi":     "QpZtXNG4SPcmrVPx",
    "httpHeaderAuth":"TRpswqZMEVt7LNy8",
}

# ─────────────────────────────────────────────────────────────
# EDITA ESTOS VALORES con los IDs reales de La Isla n8n
# ─────────────────────────────────────────────────────────────
CREDENTIAL_MAP_CLIENTE = {
    # tipo_credencial: (id_base, id_la_isla, nombre_en_la_isla)
    "postgres":       ("cfmYSBh3ClVgSqjm", "REEMPLAZAR_POSTGRES_ID",       "postgres restaurante_mvp"),
    "redis":          ("PGO2jku72XvMljgl", "REEMPLAZAR_REDIS_ID",           "Redis account"),
    "openAiApi":      ("QpZtXNG4SPcmrVPx", "REEMPLAZAR_OPENAI_ID",          "OpenAI account"),
    "httpHeaderAuth": ("TRpswqZMEVt7LNy8", "REEMPLAZAR_HEADERAUTH_ID",      "Header Auth account"),
}
# ─────────────────────────────────────────────────────────────

def validate():
    pending = [t for t, (_, new_id, _) in CREDENTIAL_MAP_CLIENTE.items() if new_id.startswith("REEMPLAZAR")]
    if pending:
        print("⚠️  IDs sin configurar:")
        for t in pending: print(f"   - {t}")
        return False
    return True

def update_file(filepath, cred_map):
    with open(filepath, encoding='utf-8') as f:
        data = json.load(f)

    changes = []
    for node in data.get('nodes', []):
        for cred_type, cred_data in node.get('credentials', {}).items():
            if cred_type in cred_map:
                old_id, new_id, new_name = cred_map[cred_type]
                if cred_data.get('id') == old_id and new_id != old_id:
                    cred_data['id'] = new_id
                    cred_data['name'] = new_name
                    changes.append((node['name'], cred_type, old_id, new_id))

    if changes:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return changes

def main():
    folder = os.path.normpath(CLIENTE_FOLDER)

    if '--show' in sys.argv:
        print("IDs actuales en flujos La Isla:\n")
        seen = set()
        for fname in sorted(os.listdir(folder)):
            if not fname.endswith('.json'): continue
            with open(os.path.join(folder, fname), encoding='utf-8') as f:
                data = json.load(f)
            for node in data.get('nodes', []):
                for ctype, cd in node.get('credentials', {}).items():
                    key = (ctype, cd.get('id'), cd.get('name'))
                    if key not in seen:
                        print(f"  {ctype:<20} id:{cd.get('id'):<28} name:'{cd.get('name')}'")
                        seen.add(key)
        return

    if not validate():
        sys.exit(1)

    # Backup
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = folder + f"_cred_backup_{ts}"
    shutil.copytree(folder, backup)
    print(f"📦 Backup: {backup}\n")

    total = 0
    for fname in sorted(os.listdir(folder)):
        if not fname.endswith('.json'): continue
        fp = os.path.join(folder, fname)
        changes = update_file(fp, CREDENTIAL_MAP_CLIENTE)
        if changes:
            print(f"✅ {fname}")
            for node_name, ctype, old, new in changes:
                print(f"   [{node_name}] {ctype}: {old} → {new}")
            total += len(changes)
        else:
            print(f"   {fname} → sin cambios")

    print(f"\n{'─'*60}")
    print(f"Total: {total} referencias de credenciales actualizadas.")
    if total:
        print("Reimporta TODOS los archivos de la carpeta 'la isla' en La Isla n8n.")

if __name__ == '__main__':
    main()
