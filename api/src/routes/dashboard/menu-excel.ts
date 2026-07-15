/**
 * menu-excel.ts
 *
 * GET  /dashboard/:slug/menu/export-excel  → descarga XLSX con el menú completo
 * POST /dashboard/:slug/menu/import-excel  → importa menú desde XLSX (upsert por nombre)
 *
 * Estructura del XLSX (4 hojas):
 *   1. Categorias  — name, sort_order, is_active
 *   2. Productos   — categoria, nombre, descripcion, es_pizza, activo, tags
 *   3. Variantes   — categoria, producto, variante, precio, sku, por_defecto, activo
 *   4. Extras      — nombre, precio, activo, alergenos
 */

import { Hono }    from 'hono';
import type { Variables } from '../../types.js';
import sql         from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth }   from '../../middleware/auth.js';
import * as XLSX   from 'xlsx';

const menuExcelRoutes = new Hono<{ Variables: Variables }>();

menuExcelRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ─── helpers ─────────────────────────────────────────────────────────────────

function boolCell(v: unknown): string {
  return v ? 'SI' : 'NO';
}

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().toUpperCase() === 'SI' || v.trim() === '1' || v.trim().toLowerCase() === 'true';
  return !!v;
}

function toNum(v: unknown, def = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : def;
}

function toStr(v: unknown, max = 500): string {
  return String(v ?? '').slice(0, max).trim();
}

// ─── GET /dashboard/:slug/menu/export-excel ───────────────────────────────────
menuExcelRoutes.get('/:slug/menu/export-excel', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const slug           = c.req.param('slug');

  try {
    // 1. Categorías
    const cats = await sql<{
      menu_category_id: number; name: string; sort_order: number; is_active: boolean;
    }[]>`
      SELECT menu_category_id, name, sort_order, is_active
      FROM menu_category
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY sort_order ASC NULLS LAST, name ASC
    `;

    // 2. Productos
    const items = await sql<{
      menu_item_id: number; menu_category_id: number; cat_name: string;
      name: string; description: string | null; is_pizza: boolean; is_active: boolean; tags: string | null;
    }[]>`
      SELECT mi.menu_item_id, mi.menu_category_id, mc.name AS cat_name,
             mi.name, mi.description, mi.is_pizza, mi.is_active, mi.tags
      FROM menu_item mi
      JOIN menu_category mc ON mc.menu_category_id = mi.menu_category_id
      WHERE mi.restaurante_id = ${restaurante_id}
      ORDER BY mc.sort_order ASC NULLS LAST, mi.name ASC
    `;

    // 3. Variantes
    const variants = await sql<{
      cat_name: string; item_name: string; variant_name: string;
      price: number; sku: string | null; is_default: boolean; is_active: boolean;
    }[]>`
      SELECT mc.name AS cat_name, mi.name AS item_name,
             mv.variant_name, mv.price, mv.sku, mv.is_default, mv.is_active
      FROM menu_variant mv
      JOIN menu_item    mi ON mi.menu_item_id = mv.menu_item_id
      JOIN menu_category mc ON mc.menu_category_id = mi.menu_category_id
      WHERE mv.restaurante_id = ${restaurante_id}
      ORDER BY mc.sort_order ASC NULLS LAST, mi.name ASC, mv.is_default DESC, mv.variant_name ASC
    `;

    // 4. Extras
    const extras = await sql<{
      name: string; price: number; is_active: boolean; allergens: string | null;
    }[]>`
      SELECT name, price, is_active, allergens
      FROM extra
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY name ASC
    `;

    // ── Build workbook ───────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // Hoja 1: Categorías
    const catRows = [
      ['nombre', 'orden', 'activo'],
      ...cats.map(r => [r.name, r.sort_order, boolCell(r.is_active)]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catRows), 'Categorias');

    // Hoja 2: Productos
    const itemRows = [
      ['categoria', 'nombre', 'descripcion', 'es_pizza', 'activo', 'tags'],
      ...items.map(r => [r.cat_name, r.name, r.description ?? '', boolCell(r.is_pizza), boolCell(r.is_active), r.tags ?? '']),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), 'Productos');

    // Hoja 3: Variantes
    const varRows = [
      ['categoria', 'producto', 'variante', 'precio', 'sku', 'por_defecto', 'activo'],
      ...variants.map(r => [r.cat_name, r.item_name, r.variant_name, Number(r.price), r.sku ?? '', boolCell(r.is_default), boolCell(r.is_active)]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(varRows), 'Variantes');

    // Hoja 4: Extras
    const extraRows = [
      ['nombre', 'precio', 'activo', 'alergenos'],
      ...extras.map(r => [r.name, Number(r.price), boolCell(r.is_active), r.allergens ?? '']),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(extraRows), 'Extras');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `menu-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(buf);

  } catch (err) {
    console.error('[GET /dashboard/:slug/menu/export-excel]', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ─── POST /dashboard/:slug/menu/import-excel ──────────────────────────────────
//
// Estrategia de importación (segura, no destructiva):
//   • Categorías  → INSERT ON CONFLICT (restaurante_id, name) DO UPDATE sort_order, is_active
//   • Productos   → INSERT ON CONFLICT (restaurante_id, menu_category_id, name) DO UPDATE description, is_pizza, is_active, tags
//   • Variantes   → INSERT ON CONFLICT (menu_item_id, variant_name) DO UPDATE price, sku, is_default, is_active
//   • Extras      → INSERT ON CONFLICT (restaurante_id, name) DO UPDATE price, is_active, allergens
//
// Los registros existentes que no aparecen en el XLSX NO se eliminan.
// Para reemplazar completamente el menú, usa el dashboard manualmente.
//
menuExcelRoutes.post('/:slug/menu/import-excel', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  let fileBuffer: ArrayBuffer;
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!file || typeof file === 'string') {
      return c.json({ error: 'missing_file', detail: 'Envía un campo "file" con el XLSX' }, 400);
    }
    fileBuffer = await (file as File).arrayBuffer();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch {
    return c.json({ error: 'invalid_xlsx', detail: 'No se pudo leer el archivo Excel' }, 400);
  }

  // ── Parse sheets ────────────────────────────────────────────────────────────
  function sheetToRows(name: string): Record<string, unknown>[] {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  }

  const catSheet     = sheetToRows('Categorias');
  const itemSheet    = sheetToRows('Productos');
  const variantSheet = sheetToRows('Variantes');
  const extraSheet   = sheetToRows('Extras');

  const stats = { categorias: 0, productos: 0, variantes: 0, extras: 0, errores: [] as string[] };

  try {
    await sql.begin(async (tx) => {

      // ── 1. Categorías ──────────────────────────────────────────────────────
      // Map nombre → menu_category_id (needed for products lookup)
      const catIdMap = new Map<string, number>();

      // Load existing categories first
      const existingCats = await tx<{ menu_category_id: number; name: string }[]>`
        SELECT menu_category_id, name FROM menu_category WHERE restaurante_id = ${restaurante_id}
      `;
      for (const ec of existingCats) catIdMap.set(ec.name.toLowerCase(), ec.menu_category_id);

      for (const row of catSheet) {
        const name       = toStr(row['nombre'], 100);
        const sort_order = toNum(row['orden'], 0);
        const is_active  = parseBool(row['activo'] ?? 'SI');
        if (!name) continue;

        const [inserted] = await tx<{ menu_category_id: number }[]>`
          INSERT INTO menu_category (restaurante_id, name, sort_order, is_active, created_at)
          VALUES (${restaurante_id}, ${name}, ${sort_order}, ${is_active}, NOW())
          ON CONFLICT (restaurante_id, name)
          DO UPDATE SET sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active, updated_at = NOW()
          RETURNING menu_category_id
        `;
        catIdMap.set(name.toLowerCase(), inserted.menu_category_id);
        stats.categorias++;
      }

      // ── 2. Productos ──────────────────────────────────────────────────────
      const itemIdMap = new Map<string, number>(); // "cat_id::nombre" → menu_item_id

      // Load existing items
      const existingItems = await tx<{ menu_item_id: number; menu_category_id: number; name: string }[]>`
        SELECT menu_item_id, menu_category_id, name FROM menu_item WHERE restaurante_id = ${restaurante_id}
      `;
      for (const ei of existingItems) {
        itemIdMap.set(`${ei.menu_category_id}::${ei.name.toLowerCase()}`, ei.menu_item_id);
      }

      for (const row of itemSheet) {
        const catName    = toStr(row['categoria'], 100);
        const name       = toStr(row['nombre'], 150);
        const desc       = toStr(row['descripcion'], 500) || null;
        const is_pizza   = parseBool(row['es_pizza'] ?? 'NO');
        const is_active  = parseBool(row['activo'] ?? 'SI');
        const tags       = toStr(row['tags'], 300) || null;

        if (!name || !catName) continue;
        const cat_id = catIdMap.get(catName.toLowerCase());
        if (!cat_id) {
          stats.errores.push(`Producto "${name}": categoría "${catName}" no encontrada`);
          continue;
        }

        const [inserted] = await tx<{ menu_item_id: number }[]>`
          INSERT INTO menu_item
            (restaurante_id, menu_category_id, name, description, is_pizza, is_active, tags, created_at)
          VALUES
            (${restaurante_id}, ${cat_id}, ${name}, ${desc}, ${is_pizza}, ${is_active}, ${tags}, NOW())
          ON CONFLICT (restaurante_id, menu_category_id, name)
          DO UPDATE SET
            description = EXCLUDED.description,
            is_pizza    = EXCLUDED.is_pizza,
            is_active   = EXCLUDED.is_active,
            tags        = EXCLUDED.tags,
            updated_at  = NOW()
          RETURNING menu_item_id
        `;
        itemIdMap.set(`${cat_id}::${name.toLowerCase()}`, inserted.menu_item_id);
        stats.productos++;
      }

      // ── 3. Variantes ──────────────────────────────────────────────────────
      for (const row of variantSheet) {
        const catName      = toStr(row['categoria'], 100);
        const itemName     = toStr(row['producto'], 150);
        const variantName  = toStr(row['variante'], 80);
        const price        = toNum(row['precio'], 0);
        const sku          = toStr(row['sku'], 50) || null;
        const is_default   = parseBool(row['por_defecto'] ?? 'NO');
        const is_active    = parseBool(row['activo'] ?? 'SI');

        if (!variantName || !itemName || !catName) continue;
        const cat_id  = catIdMap.get(catName.toLowerCase());
        if (!cat_id) { stats.errores.push(`Variante "${variantName}": categoría "${catName}" no encontrada`); continue; }
        const item_id = itemIdMap.get(`${cat_id}::${itemName.toLowerCase()}`);
        if (!item_id) { stats.errores.push(`Variante "${variantName}": producto "${itemName}" no encontrado`); continue; }

        await tx`
          INSERT INTO menu_variant
            (menu_item_id, restaurante_id, variant_name, price, sku, is_default, is_active, created_at)
          VALUES
            (${item_id}, ${restaurante_id}, ${variantName}, ${price}, ${sku}, ${is_default}, ${is_active}, NOW())
          ON CONFLICT (menu_item_id, variant_name)
          DO UPDATE SET
            price      = EXCLUDED.price,
            sku        = EXCLUDED.sku,
            is_default = EXCLUDED.is_default,
            is_active  = EXCLUDED.is_active,
            updated_at = NOW()
        `;
        stats.variantes++;
      }

      // ── 4. Extras ──────────────────────────────────────────────────────────
      for (const row of extraSheet) {
        const name      = toStr(row['nombre'], 120);
        const price     = toNum(row['precio'], 0);
        const is_active = parseBool(row['activo'] ?? 'SI');
        const allergens = toStr(row['alergenos'], 200) || null;

        if (!name) continue;

        await tx`
          INSERT INTO extra (restaurante_id, name, price, is_active, allergens, created_at)
          VALUES (${restaurante_id}, ${name}, ${price}, ${is_active}, ${allergens}, NOW())
          ON CONFLICT (restaurante_id, name)
          DO UPDATE SET
            price     = EXCLUDED.price,
            is_active = EXCLUDED.is_active,
            allergens = EXCLUDED.allergens,
            updated_at = NOW()
        `;
        stats.extras++;
      }

    }); // end transaction

    return c.json({ ok: true, stats });

  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    // Unique constraint violations may occur if DDL lacks ON CONFLICT targets
    if (pgErr.code === '23505') {
      return c.json({ error: 'duplicate_entry', detail: pgErr.message }, 409);
    }
    console.error('[POST /dashboard/:slug/menu/import-excel]', pgErr.message ?? err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

export default menuExcelRoutes;
