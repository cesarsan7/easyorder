#!/usr/bin/env python3
"""
delete_restaurante.py
─────────────────────
Elimina un restaurante y todos sus datos relacionados llamando a la función
PL/pgSQL public.delete_restaurante() en Supabase.

REQUISITOS
  pip install supabase python-dotenv

USO
  # Por id:
  python scripts/delete_restaurante.py --id 4

  # Por nombre:
  python scripts/delete_restaurante.py --nombre "test"

  # Sin confirmación interactiva (útil en CI):
  python scripts/delete_restaurante.py --id 4 --yes

VARIABLES DE ENTORNO (en .env o exportadas):
  SUPABASE_URL          https://<proyecto>.supabase.co
  SUPABASE_SERVICE_KEY  service_role key (nunca la anon key)
"""

import argparse
import os
import sys

# ── Carga .env si existe ──────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv opcional; se pueden exportar las vars manualmente

# ── Importar Supabase ─────────────────────────────────────────────────────────
try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: instala el cliente: pip install supabase")
    sys.exit(1)


def get_supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()

    if not url or not key:
        print(
            "ERROR: define SUPABASE_URL y SUPABASE_SERVICE_KEY en .env o como variables de entorno.\n"
            "  Usa la SERVICE_ROLE key (nunca la anon key) para operaciones de eliminación."
        )
        sys.exit(1)

    return create_client(url, key)


def delete_restaurante(client: Client, p_id: int | None, p_nombre: str | None) -> str:
    """Llama a public.delete_restaurante() vía RPC y devuelve el mensaje de resultado."""
    params: dict = {}
    if p_id is not None:
        params["p_id"] = p_id
    if p_nombre is not None:
        params["p_nombre"] = p_nombre

    response = client.rpc("delete_restaurante", params).execute()

    # La función devuelve un TEXT → viene en response.data
    if response.data is None:
        raise RuntimeError(f"Respuesta inesperada de Supabase: {response}")

    # response.data puede ser una lista con un solo valor o el valor directo
    if isinstance(response.data, list):
        return str(response.data[0])
    return str(response.data)


def confirm_deletion(identifier: str) -> bool:
    answer = input(
        f"\n⚠️  ATENCIÓN: Se eliminarán PERMANENTEMENTE el restaurante '{identifier}'\n"
        "   y TODOS sus datos relacionados (menú, pedidos, usuarios, historial, etc.).\n\n"
        "   Escribe 'ELIMINAR' para confirmar: "
    ).strip()
    return answer == "ELIMINAR"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Elimina un restaurante y todos sus datos de Supabase."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--id",     type=int, dest="rid",    metavar="ID",     help="ID numérico del restaurante")
    group.add_argument("--nombre", type=str, dest="nombre", metavar="NOMBRE", help="Nombre del restaurante")
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Omitir confirmación interactiva (úsalo solo en scripts automatizados)"
    )
    args = parser.parse_args()

    identifier = str(args.rid) if args.rid is not None else args.nombre

    # Confirmación interactiva
    if not args.yes:
        if not confirm_deletion(identifier):
            print("Operación cancelada.")
            sys.exit(0)

    print(f"\n🔌 Conectando a Supabase…")
    client = get_supabase_client()

    print(f"🗑️  Eliminando restaurante '{identifier}'…")
    try:
        result = delete_restaurante(client, args.rid, args.nombre)
        print(f"✅ {result}")
    except Exception as exc:
        print(f"❌ Error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
