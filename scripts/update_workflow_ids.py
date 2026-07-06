#!/usr/bin/env python3
"""
update_workflow_ids.py
======================
Actualiza los workflow IDs de los nodos toolWorkflow en los flujos n8n de un cliente.

USO:
  1. Consigue los IDs reales desde La Isla n8n:
     - Ve a La Isla n8n → cada workflow → URL del browser
     - La URL tiene el formato: /workflow/XXXXXXXXXXXXXXXX
     - Copia ese ID para cada flujo

  2. Edita el diccionario WORKFLOW_IDS_CLIENTE al inicio de este script
     con los IDs reales de La Isla n8n.

  3. Ejecuta:
     python scripts/update_workflow_ids.py

  El script actualiza todos los archivos .json en la carpeta del cliente
  y genera un resumen de cambios.
"""

import json
import os
import sys
import shutil
from datetime import datetime

# ─────────────────────────────────────────────────────────────
# CONFIGURACIÓN — edita estos valores con los IDs de La Isla n8n
# ─────────────────────────────────────────────────────────────

CLIENTE_FOLDER = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', 'docs', 'n8n', 'la isla'
)

# Mapeo: nombre del workflow → ID en La Isla n8n
# Para obtener el ID: abre el workflow en La Isla n8n y copia el ID de la URL
# Ejemplo URL: https://la-isla-n8n.avtsif.easypanel.host/workflow/AbCdEfGhIjKlMnOp
#                                                                   ^^^^^^^^^^^^^^^^ este es el ID

WORKFLOW_IDS_CLIENTE = {
    "[MVP] Apertura":        "REEMPLAZAR_CON_ID_APERTURA",
    "[MVP] Despacho":        "REEMPLAZAR_CON_ID_DESPACHO",
    "[MVP] Pago":            "REEMPLAZAR_CON_ID_PAGO",
    "[MVP] Preguntas":       "REEMPLAZAR_CON_ID_PREGUNTAS",
    "[MVP] Derivar Humano":  "REEMPLAZAR_CON_ID_DERIVAR_HUMANO",
    "[MVP] Perfil Cliente":  "REEMPLAZAR_CON_ID_PERFIL_CLIENTE",
    "[MVP] Pedidos Cliente": "REEMPLAZAR_CON_ID_PEDIDOS_CLIENTE",
    "[MVP] Contexto":        "REEMPLAZAR_CON_ID_CONTEXTO",
}

# ─────────────────────────────────────────────────────────────
# NO EDITAR DEBAJO DE ESTA LÍNEA
# ─────────────────────────────────────────────────────────────

def validate_config():
    """Verifica que todos los IDs hayan sido configurados."""
    placeholder = "REEMPLAZAR_CON_ID_"
    pending = [name for name, wf_id in WORKFLOW_IDS_CLIENTE.items() if wf_id.startswith(placeholder)]
    if pending:
        print("⚠️  IDs sin configurar:")
        for name in pending:
            print(f"   - {name}")
        print("\nEdita WORKFLOW_IDS_CLIENTE en este script con los IDs reales de La Isla n8n.")
        print("Luego vuelve a ejecutar el script.")
        return False
    return True

def backup_folder(folder):
    """Crea un backup de la carpeta antes de modificar."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = folder.rstrip('/\\') + f"_backup_{timestamp}"
    shutil.copytree(folder, backup_path)
    return backup_path

def update_file(filepath, id_map):
    """
    Actualiza los workflow IDs en un archivo .json.
    Devuelve lista de cambios realizados.
    """
    with open(filepath, encoding='utf-8') as f:
        data = json.load(f)

    changes = []
    for node in data.get('nodes', []):
        if node.get('type') != '@n8n/n8n-nodes-langchain.toolWorkflow':
            continue

        wf_param = node.get('parameters', {}).get('workflowId', {})
        cached_name = wf_param.get('cachedResultName', '')
        old_id = wf_param.get('value', '')

        if cached_name in id_map:
            new_id = id_map[cached_name]
            if old_id != new_id:
                wf_param['value'] = new_id
                wf_param['cachedResultUrl'] = f"/workflow/{new_id}"
                changes.append({
                    'node': node['name'],
                    'workflow': cached_name,
                    'old_id': old_id,
                    'new_id': new_id
                })

    if changes:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return changes

def show_current_ids(folder):
    """Muestra los IDs actuales en todos los archivos del cliente."""
    print("\n📋 IDs actuales en los archivos del cliente:")
    print("-" * 70)

    all_refs = {}
    for fname in sorted(os.listdir(folder)):
        if not fname.endswith('.json'):
            continue
        with open(os.path.join(folder, fname), encoding='utf-8') as f:
            data = json.load(f)
        for node in data.get('nodes', []):
            if node.get('type') != '@n8n/n8n-nodes-langchain.toolWorkflow':
                continue
            wf = node.get('parameters', {}).get('workflowId', {})
            name = wf.get('cachedResultName', '?')
            wf_id = wf.get('value', '?')
            if name not in all_refs:
                all_refs[name] = wf_id
                print(f"  {name:<28} → {wf_id}")

    print("-" * 70)
    print(f"\nTotal de workflows referenciados: {len(all_refs)}")
    print("\nPara obtener los IDs correctos de La Isla n8n:")
    print("  1. Abre cada workflow en La Isla n8n")
    print("  2. Copia el ID de la URL: /workflow/[ESTE_ES_EL_ID]")
    print("  3. Pégalos en WORKFLOW_IDS_CLIENTE en este script")

def main():
    folder = os.path.normpath(CLIENTE_FOLDER)

    if not os.path.isdir(folder):
        print(f"❌ Carpeta no encontrada: {folder}")
        sys.exit(1)

    # Si se llama con --show, solo muestra los IDs actuales
    if '--show' in sys.argv:
        show_current_ids(folder)
        return

    # Validar configuración
    if not validate_config():
        print("\n💡 Tip: ejecuta con --show para ver los IDs actuales:")
        print("   python scripts/update_workflow_ids.py --show")
        sys.exit(1)

    # Crear backup
    print(f"📦 Creando backup de: {folder}")
    backup = backup_folder(folder)
    print(f"   Backup guardado en: {backup}")

    # Procesar cada archivo
    print(f"\n🔄 Actualizando IDs en: {folder}")
    print("-" * 70)

    total_changes = 0
    for fname in sorted(os.listdir(folder)):
        if not fname.endswith('.json'):
            continue

        filepath = os.path.join(folder, fname)
        changes = update_file(filepath, WORKFLOW_IDS_CLIENTE)

        if changes:
            print(f"\n✅ {fname}")
            for c in changes:
                print(f"   [{c['node']}] {c['workflow']}")
                print(f"      {c['old_id']} → {c['new_id']}")
            total_changes += len(changes)
        else:
            print(f"   {fname} → sin cambios")

    print("-" * 70)
    if total_changes > 0:
        print(f"\n✅ {total_changes} referencias actualizadas.")
        print("   Reimporta los archivos modificados en La Isla n8n.")
    else:
        print("\n⚠️  No se realizaron cambios. Verifica que los nombres en")
        print("   WORKFLOW_IDS_CLIENTE coincidan con los cachedResultName del JSON.")

if __name__ == '__main__':
    main()
